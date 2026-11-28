import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  LeadsService,
  RECOVERY_EMAIL_SUBJECT,
  WELCOME_EMAIL_SUBJECT,
} from '../../server/services/leadsService.js';
import {
  app,
  setDataDir,
  setUsersFilePath,
  writeUsers,
} from '../../server/server.js';

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pouw-leads-test-'));
}

test('SCRUM-336 Regla B: rejects invalid email and skips marketing when allowsCommunication=false', () => {
  const dir = createTempDir();
  const svc = new LeadsService(() => dir);

  const invalid = svc.captureLead({ email: 'bad', allowsCommunication: true, status: 'registering' });
  assert.equal(invalid.captured, false);
  assert.equal(invalid.reason, 'INVALID_EMAIL');

  const noConsent = svc.captureLead({
    email: 'buyer@example.com',
    allowsCommunication: false,
    status: 'configuring',
    powerTh: 96,
    priceUsd: 1139.99,
  });
  assert.equal(noConsent.captured, false);
  assert.equal(noConsent.reason, 'NO_COMMUNICATION_CONSENT');
  assert.equal(svc.readLeads().length, 0);
  assert.equal(svc.readEmailEvents().length, 0);
});

test('SCRUM-336 Regla B: captures lead on registering/configuring/paying, schedules & dispatches recovery email, and cancels on purchased', () => {
  const dir = createTempDir();
  const svc = new LeadsService(() => dir);

  // 1) Registering -> welcome email
  const reg = svc.captureLead({
    event: 'user/lead-captured',
    name: 'Ana Tester',
    email: 'ana@example.com',
    status: 'registering',
    allowsCommunication: true,
    source: 'register-welcome',
  });
  assert.equal(reg.captured, true);
  assert.equal(reg.lead?.status, 'registering');
  assert.equal(reg.emailEvent?.type, 'welcome');
  assert.equal(reg.emailEvent?.subject, WELCOME_EMAIL_SUBJECT);

  // 2) Configuring without paying -> schedules "Termina de configurar tu miner y págalo"
  const cfg = svc.captureLead({
    event: 'user/lead-captured',
    email: 'ana@example.com',
    status: 'configuring',
    allowsCommunication: true,
    source: 'builder-configure',
    powerTh: 96,
    priceUsd: 1139.99,
    designSlug: 'v04-kraken',
  });
  assert.equal(cfg.captured, true);
  assert.equal(cfg.lead?.status, 'configuring');
  assert.equal(cfg.lead?.recoveryEmailStatus, 'SCHEDULED');
  assert.equal(cfg.emailEvent?.type, 'abandoned_config_recovery');
  assert.equal(cfg.emailEvent?.subject, RECOVERY_EMAIL_SUBJECT);

  // 3) Another buyer never registered earlier, leaves email directly at pre-pay (Regla B!)
  const prepay = svc.captureLead({
    event: 'user/lead-captured',
    email: 'direct.buyer@example.com',
    status: 'paying',
    allowsCommunication: true,
    source: 'checkout-prepay',
    powerTh: 32,
    priceUsd: 379.99,
  });
  assert.equal(prepay.captured, true);
  assert.equal(prepay.lead?.status, 'paying');
  assert.equal(prepay.lead?.recoveryEmailStatus, 'SCHEDULED');

  // 4) Ana completes purchase -> her recovery email is cancelled automatically
  const purchased = svc.captureLead({
    event: 'user/lead-captured',
    email: 'ana@example.com',
    status: 'purchased',
    allowsCommunication: true,
    source: 'purchase-receipt',
  });
  assert.equal(purchased.lead?.status, 'purchased');
  assert.equal(purchased.lead?.recoveryEmailStatus, 'CANCELLED_PURCHASED');

  // 5) Processing recovery emails sends ONLY to direct.buyer (not Ana who purchased!)
  const dispatch = svc.processPendingRecoveryEmails();
  assert.equal(dispatch.dispatchedCount, 1);
  assert.equal(dispatch.dispatched[0].email, 'direct.buyer@example.com');
  assert.equal(dispatch.dispatched[0].subject, RECOVERY_EMAIL_SUBJECT);

  const list = svc.listLeads();
  assert.equal(list.summary.total, 2);
  assert.equal(list.summary.purchased, 1);
  assert.equal(list.summary.paying, 1);
  assert.equal(list.summary.recoverySent, 1);
});

test('EMBUDO-F4-LEADS-ADMIN-VIEW: HTTP /api/admin/leads enforces 401 without admin and returns captured leads with admin session', async () => {
  const tempDir = createTempDir();
  const usersFile = path.join(tempDir, 'users.json');
  const prevAllowlist = process.env.ADMIN_ALLOWLIST_SOURCE;
  const prevDevSession = process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN;

  setDataDir(tempDir);
  setUsersFilePath(usersFile);
  process.env.ADMIN_ALLOWLIST_SOURCE = 'file';
  process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = 'true';

  const adminToken = 'tok_leads_admin_test_001';
  const nonAdminToken = 'tok_leads_viewer_test_002';

  writeUsers({
    users: [
      {
        id: 'usr_admin_leads',
        username: 'adminleads',
        email: 'admin.leads@pouwminer.local',
        passwordHash: '',
        fullName: 'Admin Leads',
        role: 'admin',
        sessionToken: adminToken,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'usr_viewer_leads',
        username: 'viewerleads',
        email: 'viewer.leads@pouwminer.local',
        passwordHash: '',
        fullName: 'Viewer Leads',
        role: 'viewer',
        sessionToken: nonAdminToken,
        createdAt: new Date().toISOString(),
      },
    ],
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    // 1) Unauthenticated -> 401
    const unauthRes = await fetch(`${baseUrl}/api/admin/leads`);
    assert.equal(unauthRes.status, 401);

    // 2) Non-admin -> 401
    const nonAdminRes = await fetch(`${baseUrl}/api/admin/leads`, {
      headers: { Authorization: `Bearer ${nonAdminToken}` },
    });
    assert.equal(nonAdminRes.status, 401);

    // 3) Unauthenticated process-recovery -> 401
    const unauthRecRes = await fetch(`${baseUrl}/api/admin/leads/process-recovery`, {
      method: 'POST',
    });
    assert.equal(unauthRecRes.status, 401);

    // 4) Public capture endpoint with consent -> 201
    const capRes = await fetch(`${baseUrl}/api/leads/capture`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'user/lead-captured',
        name: 'Test Lead Admin View',
        email: 'lead.admin.view@pouwminer.local',
        status: 'paying',
        allowsCommunication: true,
        source: 'checkout-prepay',
        powerTh: 64,
        priceUsd: 759.99,
        designSlug: 'v05-falcon',
      }),
    });
    assert.equal(capRes.status, 201);
    const capJson = (await capRes.json()) as { captured: boolean; lead: { email: string; recoveryEmailStatus: string } };
    assert.equal(capJson.captured, true);
    assert.equal(capJson.lead.email, 'lead.admin.view@pouwminer.local');
    assert.equal(capJson.lead.recoveryEmailStatus, 'SCHEDULED');

    // 5) Authenticated admin GET /api/admin/leads -> 200
    const adminRes = await fetch(`${baseUrl}/api/admin/leads`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminRes.status, 200);
    const adminJson = (await adminRes.json()) as {
      leads: Array<{ email: string; name: string; status: string; allowsCommunication: boolean; recoveryEmailStatus: string }>;
      summary: { total: number; paying: number; recoveryScheduled: number };
    };
    assert.equal(adminJson.summary.total, 1);
    assert.equal(adminJson.summary.paying, 1);
    assert.equal(adminJson.summary.recoveryScheduled, 1);
    assert.equal(adminJson.leads[0].email, 'lead.admin.view@pouwminer.local');
    assert.equal(adminJson.leads[0].allowsCommunication, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    setDataDir(null);
    setUsersFilePath(null);
    if (prevAllowlist === undefined) delete process.env.ADMIN_ALLOWLIST_SOURCE;
    else process.env.ADMIN_ALLOWLIST_SOURCE = prevAllowlist;
    if (prevDevSession === undefined) delete process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN;
    else process.env.ALLOW_DEV_LOCAL_SESSION_TOKEN = prevDevSession;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('EMBUDO-F4-LEADS-ADMIN-VIEW: LeadsView.tsx renders all required fields, 4 statuses, theme-aware contrast, and avoids purple/transition-all', () => {
  const leadsViewPath = path.resolve(import.meta.dirname, '../../src/components/admin/LeadsView.tsx');
  const src = fs.readFileSync(leadsViewPath, 'utf8');

  assert.match(src, /data-testid="admin-leads-view"/);
  assert.match(src, /apiFetch\(`\/api\/admin\/leads\$\{query\}`\)/);
  assert.match(src, /registering:\s*\{/);
  assert.match(src, /configuring:\s*\{/);
  assert.match(src, /paying:\s*\{/);
  assert.match(src, /purchased:\s*\{/);
  assert.match(src, /lead\.name/);
  assert.match(src, /lead\.email/);
  assert.match(src, /formattedDate/);
  assert.match(src, /lead\.status/);
  assert.match(src, /lead\.allowsCommunication/);
  assert.match(src, /lead\.recoveryEmailStatus/);
  assert.doesNotMatch(src, /transition-all/);
  assert.doesNotMatch(src, /purple-/);
});
