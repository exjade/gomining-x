/**
 * SCRUM-358 — Real Firebase Client SDK Red-Team Security Rules Verification
 * Executes REAL Firebase Web Client SDK (`firebase/auth` + `firebase/firestore`) calls
 * against live Firebase Auth + Firestore Emulators loaded with `firestore.rules`.
 *
 * Verifies:
 * 1. Vector 1 (CRITICAL — Minting): Client create on /mining_daily_profit,
 *    /unilevel_distributions, and /referralCommissions is DENIED.
 * 2. Vector 2 (HIGH — Unilevel Eligibility Bypass): Client create/update on
 *    /unilevel/{uid} (self, other, and subcollections) is DENIED; owner read ALLOWED;
 *    cross-UID read DENIED.
 * 3. Vector 3 (HIGH — Cross-UID /users update & server-side purchase counters):
 *    Cross-UID update on /users/{otherUid} (sponsorId, purchasesCount) DENIED;
 *    self-update of purchasesCount, lastPurchaseAt, firstPurchaseAt DENIED.
 * 4. Vector 4 (MEDIUM — SCRUM-235 display aggregates on /users/{uid}):
 *    Self-update and non-zero initial create of ownMiningProfitTotal, unilevelBalance,
 *    and receivedUnilevelCommissionTotal DENIED.
 * 5. Vector 5 (No-Regression): Legitimate owner reads (/users, /userBalances, /unilevel,
 *    /referrals, /mining_daily_profit, /unilevel_distributions, /referralCommissions),
 *    admin /unilevel reads, and non-financial /users profile updates remain ALLOWED.
 * 6. Vector 6 (SCRUM-361 — Anonymous & Non-Admin Reads on /admin_workers and /admin_settings):
 *    Anonymous sessions DENIED on /admin_workers/worker-1, /admin_settings/internal_config,
 *    and /admin_settings/storefront_sections; regular registered user DENIED on
 *    /admin_workers/worker-1 and /admin_settings/internal_config and ALLOWED on
 *    /admin_settings/storefront_sections; active admin ALLOWED on all three.
 */

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { initializeApp as initAdminApp, deleteApp as deleteAdminApp, type App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClientApp, deleteApp as deleteClientApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth as getClientAuth,
  signInAnonymously,
  signInWithCustomToken,
  signOut,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore as getClientFirestore,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'salad-miners';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';

function parseHostPort(raw: string, defaultPort: number): { host: string; port: number } {
  const [host, portStr] = raw.split(':');
  return { host: host || '127.0.0.1', port: Number(portStr) || defaultPort };
}

async function assertPermissionDenied(fn: () => Promise<unknown>, label: string): Promise<void> {
  let succeeded = false;
  try {
    await fn();
    succeeded = true;
  } catch (err: any) {
    const code = String(err?.code ?? '');
    const msg = String(err?.message ?? '');
    assert.ok(
      code.includes('permission-denied') ||
        msg.toLowerCase().includes('permission_denied') ||
        msg.toLowerCase().includes('missing or insufficient permissions'),
      `${label}: expected permission-denied, got code="${code}" msg="${msg}"`,
    );
  }
  assert.equal(succeeded, false, `${label}: MUST be denied by firestore.rules`);
}

describe('SCRUM-358: Red-Team Firestore Rules Hardening (Auth + Firestore Emulator)', () => {
  let adminApp: AdminApp;
  let clientApp: FirebaseApp;

  const fsAddr = parseHostPort(FIRESTORE_HOST, 8080);

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;

    adminApp = initAdminApp({ projectId: PROJECT_ID }, `scrum358-redteam-admin-${Date.now()}`);
    const adminDb = getAdminFirestore(adminApp);

    await Promise.all([
      adminDb.collection('admin_users').doc('adm-358').set({
        uid: 'adm-358',
        email: 'admin358@pouw.test',
        role: 'admin',
        status: 'ACTIVE',
        permissions: ['withdrawals.read', 'withdrawals.audit'],
      }),
      adminDb.collection('users').doc('client-a').set(
        {
          uid: 'client-a',
          email: 'clienta@pouw.test',
          displayName: 'Alice',
          balance: 250,
          purchasesCount: 1,
          ownMiningProfitTotal: 10,
          unilevelBalance: 5,
          receivedUnilevelCommissionTotal: 5,
          sponsorId: 'sponsor-orig',
        },
        { merge: true },
      ),
      adminDb.collection('users').doc('client-b').set(
        {
          uid: 'client-b',
          email: 'clientb@pouw.test',
          displayName: 'Bob',
          balance: 500,
          purchasesCount: 2,
          sponsorId: 'sponsor-b',
        },
        { merge: true },
      ),
      adminDb.collection('userBalances').doc('client-a').set(
        {
          uid: 'client-a',
          availableBalanceMicros: 250_000_000,
          lockedBalanceMicros: 0,
          totalWithdrawnMicros: 0,
        },
        { merge: true },
      ),
      adminDb.collection('unilevel').doc('client-a').set({
        uid: 'client-a',
        activeReferredMinersCount: 1,
        ownMiningProfitTotal: 10,
      }),
      adminDb.collection('unilevel').doc('client-b').set({
        uid: 'client-b',
        activeReferredMinersCount: 0,
        ownMiningProfitTotal: 0,
      }),
      adminDb.collection('referrals').doc('client-a').set({
        sponsorUid: 'client-a',
        withdrawableBalance: 15,
        totalWithdrawn: 0,
      }),
      adminDb.collection('mining_daily_profit').doc('seed-profit-1').set({
        minerId: 'MINER-1',
        minerUid: 'client-a',
        periodDate: '2026-11-20',
        status: 'finalized',
        eligibleProfitUsdt6: '2.176200',
      }),
      adminDb.collection('unilevel_distributions').doc('seed-dist-1').set({
        minerId: 'MINER-1',
        minerUid: 'client-a',
        periodDate: '2026-11-20',
        status: 'DISTRIBUTED',
      }),
      adminDb.collection('referralCommissions').doc('seed-comm-1').set({
        sponsorUid: 'client-a',
        buyerUid: 'client-b',
        commissionUsdt6: '15.000000',
        status: 'CREDITED',
      }),
      adminDb.collection('admin_workers').doc('worker-1').set({
        id: 'worker-1',
        name: 'Rack-01-Worker-A',
        status: 'ONLINE',
      }),
      adminDb.collection('admin_settings').doc('internal_config').set({
        key: 'internal_config',
        maintenanceMode: false,
      }),
      adminDb.collection('admin_settings').doc('storefront_sections').set({
        showPresale: true,
        showLaunch: true,
        showMonthly: true,
        showCustom: true,
      }),
    ]);

    clientApp = initClientApp(
      { apiKey: 'demo-api-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
      `scrum358-redteam-client-${Date.now()}`,
    );
    connectAuthEmulator(getClientAuth(clientApp), `http://${AUTH_HOST}`, { disableWarnings: true });
    connectFirestoreEmulator(getClientFirestore(clientApp), fsAddr.host, fsAddr.port);
  });

  after(async () => {
    if (clientApp) {
      await signOut(getClientAuth(clientApp)).catch(() => {});
      await deleteClientApp(clientApp).catch(() => {});
    }
    if (adminApp) {
      await deleteAdminApp(adminApp).catch(() => {});
    }
  });

  async function signInAs(uid: string) {
    const token = await getAdminAuth(adminApp).createCustomToken(uid);
    await signInWithCustomToken(getClientAuth(clientApp), token);
  }

  it('1. Vector 1 (CRITICAL — Minting): denies client create on /mining_daily_profit, /unilevel_distributions, and /referralCommissions', async () => {
    const db = getClientFirestore(clientApp);
    await signInAs('client-a');

    await assertPermissionDenied(
      () =>
        setDoc(doc(db, 'mining_daily_profit', 'fake-profit'), {
          minerId: 'FAKE-MINER',
          minerUid: 'client-a',
          periodDate: '2026-11-21',
          status: 'finalized',
          eligibleProfitUsdt6: '999999.000000',
        }),
      'Client minting setDoc /mining_daily_profit/fake-profit',
    );

    await assertPermissionDenied(
      () =>
        setDoc(doc(db, 'unilevel_distributions', 'fake-dist'), {
          minerId: 'FAKE-MINER',
          minerUid: 'client-a',
          status: 'DISTRIBUTED',
        }),
      'Client setDoc /unilevel_distributions/fake-dist',
    );

    await assertPermissionDenied(
      () =>
        setDoc(doc(db, 'referralCommissions', 'fake-comm'), {
          sponsorUid: 'client-a',
          commissionUsdt6: '999999.000000',
          status: 'CREDITED',
        }),
      'Client setDoc /referralCommissions/fake-comm',
    );
  });

  it('2. Vector 2 (HIGH — Unilevel Eligibility Bypass): denies all client writes on /unilevel/{uid} + subcollections, allows owner read, denies cross-UID read', async () => {
    const db = getClientFirestore(clientApp);
    await signInAs('client-a');

    await assertPermissionDenied(
      () => setDoc(doc(db, 'unilevel', 'client-a'), { activeReferredMinersCount: 20 }, { merge: true }),
      'Client setDoc /unilevel/client-a',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'unilevel', 'client-a'), { activeReferredMinersCount: 20 }),
      'Client updateDoc /unilevel/client-a',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'unilevel', 'client-b'), { activeReferredMinersCount: 20 }, { merge: true }),
      'Client setDoc /unilevel/client-b',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'unilevel', 'client-b'), { activeReferredMinersCount: 20 }),
      'Client updateDoc /unilevel/client-b',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'unilevel', 'client-a', 'items', 'x'), { hacked: true }),
      'Client setDoc /unilevel/client-a/items/x',
    );

    // Owner read ALLOWED
    const ownUni = await getDoc(doc(db, 'unilevel', 'client-a'));
    assert.equal(ownUni.exists(), true);
    assert.equal(ownUni.data()?.activeReferredMinersCount, 1);

    // Cross-UID read DENIED
    await assertPermissionDenied(
      () => getDoc(doc(db, 'unilevel', 'client-b')),
      'Cross-UID getDoc /unilevel/client-b',
    );
  });

  it('3. Vector 3 (HIGH — Cross-UID /users update & server-side purchase counters): denies cross-UID update and self-update of purchasesCount/lastPurchaseAt/firstPurchaseAt', async () => {
    const db = getClientFirestore(clientApp);
    await signInAs('client-a');

    await assertPermissionDenied(
      () => updateDoc(doc(db, 'users', 'client-b'), { sponsorId: 'client-a' }),
      'Cross-UID updateDoc /users/client-b.sponsorId',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'users', 'client-b'), { purchasesCount: 999 }),
      'Cross-UID updateDoc /users/client-b.purchasesCount',
    );

    for (const field of ['purchasesCount', 'lastPurchaseAt', 'firstPurchaseAt']) {
      await assertPermissionDenied(
        () => updateDoc(doc(db, 'users', 'client-a'), { [field]: 999 }),
        `Self updateDoc /users/client-a.${field}`,
      );
    }
  });

  it('4. Vector 4 (MEDIUM — SCRUM-235 display aggregates on /users/{uid}): denies self-update and non-zero initial create of ownMiningProfitTotal, unilevelBalance, and receivedUnilevelCommissionTotal', async () => {
    const db = getClientFirestore(clientApp);
    await signInAs('client-a');

    for (const field of [
      'ownMiningProfitTotal',
      'unilevelBalance',
      'receivedUnilevelCommissionTotal',
    ]) {
      await assertPermissionDenied(
        () => updateDoc(doc(db, 'users', 'client-a'), { [field]: 999999 }),
        `Self updateDoc /users/client-a.${field}`,
      );
    }

    // Non-zero initial create MUST be denied
    const initialCases: Array<{ uid: string; field: string }> = [
      { uid: 'client-new-agg1', field: 'ownMiningProfitTotal' },
      { uid: 'client-new-agg2', field: 'unilevelBalance' },
      { uid: 'client-new-agg3', field: 'receivedUnilevelCommissionTotal' },
    ];
    for (const { uid, field } of initialCases) {
      await signInAs(uid);
      await assertPermissionDenied(
        () => setDoc(doc(db, 'users', uid), { uid, [field]: 50 }),
        `Initial setDoc /users/${uid} with non-zero ${field}`,
      );
    }
  });

  it('5. No-Regression: allows legitimate owner reads, admin /unilevel reads, and non-financial /users profile updates', async () => {
    const db = getClientFirestore(clientApp);
    await signInAs('client-a');

    const [ownUser, ownBal, ownUni, ownRef, seedProfit, seedDist, seedComm] = await Promise.all([
      getDoc(doc(db, 'users', 'client-a')),
      getDoc(doc(db, 'userBalances', 'client-a')),
      getDoc(doc(db, 'unilevel', 'client-a')),
      getDoc(doc(db, 'referrals', 'client-a')),
      getDoc(doc(db, 'mining_daily_profit', 'seed-profit-1')),
      getDoc(doc(db, 'unilevel_distributions', 'seed-dist-1')),
      getDoc(doc(db, 'referralCommissions', 'seed-comm-1')),
    ]);

    assert.equal(ownUser.exists(), true);
    assert.equal(ownBal.exists(), true);
    assert.equal(ownUni.exists(), true);
    assert.equal(ownRef.exists(), true);
    assert.equal(seedProfit.exists(), true);
    assert.equal(seedDist.exists(), true);
    assert.equal(seedComm.exists(), true);

    // Non-financial profile update on own /users/{uid} remains ALLOWED
    await updateDoc(doc(db, 'users', 'client-a'), { displayName: 'Alice Updated' });
    const updatedUser = await getDoc(doc(db, 'users', 'client-a'));
    assert.equal(updatedUser.data()?.displayName, 'Alice Updated');

    // Active admin can read /unilevel/{uid} for both users
    await signInAs('adm-358');
    const adminUniB = await getDoc(doc(db, 'unilevel', 'client-b'));
    assert.equal(adminUniB.exists(), true);
  });

  it('6. Vector 6 (SCRUM-361 — Anonymous & Non-Admin Reads on /admin_workers and /admin_settings): enforces admin-only /admin_workers and scoped non-anonymous storefront_sections read', async () => {
    const db = getClientFirestore(clientApp);

    // 1. Anonymous session: DENIED on /admin_workers/worker-1, /admin_settings/internal_config, /admin_settings/storefront_sections
    await signInAnonymously(getClientAuth(clientApp));
    await assertPermissionDenied(
      () => getDoc(doc(db, 'admin_workers', 'worker-1')),
      'Anonymous getDoc /admin_workers/worker-1',
    );
    await assertPermissionDenied(
      () => getDoc(doc(db, 'admin_settings', 'internal_config')),
      'Anonymous getDoc /admin_settings/internal_config',
    );
    await assertPermissionDenied(
      () => getDoc(doc(db, 'admin_settings', 'storefront_sections')),
      'Anonymous getDoc /admin_settings/storefront_sections',
    );

    // 2. Registered non-admin user (client-a): DENIED on /admin_workers/worker-1 and /admin_settings/internal_config; ALLOWED on /admin_settings/storefront_sections
    await signInAs('client-a');
    await assertPermissionDenied(
      () => getDoc(doc(db, 'admin_workers', 'worker-1')),
      'Registered non-admin getDoc /admin_workers/worker-1',
    );
    await assertPermissionDenied(
      () => getDoc(doc(db, 'admin_settings', 'internal_config')),
      'Registered non-admin getDoc /admin_settings/internal_config',
    );
    const clientStorefront = await getDoc(doc(db, 'admin_settings', 'storefront_sections'));
    assert.equal(clientStorefront.exists(), true);
    assert.equal(clientStorefront.data()?.showPresale, true);

    // 3. Active admin (adm-358): ALLOWED on all three documents
    await signInAs('adm-358');
    const [adminWorker, adminInternalConfig, adminStorefront] = await Promise.all([
      getDoc(doc(db, 'admin_workers', 'worker-1')),
      getDoc(doc(db, 'admin_settings', 'internal_config')),
      getDoc(doc(db, 'admin_settings', 'storefront_sections')),
    ]);
    assert.equal(adminWorker.exists(), true);
    assert.equal(adminInternalConfig.exists(), true);
    assert.equal(adminStorefront.exists(), true);
  });
});
