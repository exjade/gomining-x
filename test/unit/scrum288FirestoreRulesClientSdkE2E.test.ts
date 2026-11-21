/**
 * SCRUM-275 / SCRUM-288 — Real Firebase Client SDK Security Rules Verification
 * Executes REAL Firebase Web Client SDK (`firebase/auth` + `firebase/firestore`) calls
 * against live Firebase Auth + Firestore Emulators loaded with `firestore.rules`.
 *
 * Verifies:
 * 1. Direct Client SDK writes FAIL with PERMISSION_DENIED on ALL 7 collections:
 *    - /userBalances/{uid}
 *    - /users/{uid} (all protected financial/balance fields)
 *    - /withdrawalRequests/{id}
 *    - /financialLedger/{id}
 *    - /withdrawalAuditEvents/{id}
 *    - /withdrawal_idempotency/{id}
 *    - /admin_users/{uid} (for client, read-only admin, suspended admin, SUPER_ADMIN without permissions)
 * 2. F-CRIT-02: isAdmin() requires status == 'ACTIVE' + explicit non-empty permissions;
 *    only admin with 'admin.users.manage' can write /admin_users/{uid} (delete always denied).
 * 3. F-CRIT-04: Direct Client SDK read of /withdrawalRequests/{id} by owner is DENIED (zero 11-field leak).
 * 4. F-HIGH-01: /users/{uid} unauthenticated and cross-UID reads are DENIED; owner read ALLOWED;
 *    /publicReferralCodes/{CODE} exact-key GET ALLOWED (unauthenticated) while LIST is DENIED.
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
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
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

describe('SCRUM-288: Real Client SDK Firestore Rules Enforcement (7 Collections + F-CRIT-02/04 + F-HIGH-01)', () => {
  let adminApp: AdminApp;
  let clientApp: FirebaseApp;

  const fsAddr = parseHostPort(FIRESTORE_HOST, 8080);

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;

    adminApp = initAdminApp({ projectId: PROJECT_ID }, `rules-audit-admin-${Date.now()}`);
    const adminDb = getAdminFirestore(adminApp);

    // Seed authoritative documents via Admin SDK
    await Promise.all([
      adminDb.collection('admin_users').doc('adm-suspended').set({
        uid: 'adm-suspended',
        email: 'susp@pouw.test',
        role: 'admin',
        status: 'SUSPENDED',
        permissions: ['withdrawals.read', 'admin.users.manage'],
      }),
      adminDb.collection('admin_users').doc('adm-super-empty').set({
        uid: 'adm-super-empty',
        email: 'super0@pouw.test',
        role: 'admin',
        status: 'ACTIVE',
        adminTier: 'SUPER_ADMIN',
        permissions: [],
      }),
      adminDb.collection('admin_users').doc('adm-readonly').set({
        uid: 'adm-readonly',
        email: 'ro@pouw.test',
        role: 'admin',
        status: 'ACTIVE',
        permissions: ['withdrawals.read'],
      }),
      adminDb.collection('admin_users').doc('adm-manager').set({
        uid: 'adm-manager',
        email: 'mgr@pouw.test',
        role: 'admin',
        status: 'ACTIVE',
        permissions: ['admin.users.manage', 'withdrawals.read', 'withdrawals.audit'],
      }),
      adminDb.collection('users').doc('client-a').set({
        uid: 'client-a',
        email: 'clienta@pouw.test',
        balance: 250,
        commissionBalance: 15,
        referral: { referralCode: 'CLIENTA99', referrerBy: '', userReferrals: [] },
      }),
      adminDb.collection('users').doc('client-b').set({
        uid: 'client-b',
        email: 'clientb@pouw.test',
        balance: 500,
        commissionBalance: 0,
        referral: { referralCode: 'CLIENTB99', referrerBy: '', userReferrals: [] },
      }),
      adminDb.collection('publicReferralCodes').doc('CLIENTA99').set({
        uid: 'client-a',
        referralCode: 'CLIENTA99',
        createdAt: '2026-11-18T10:00:00.000Z',
      }),
      adminDb.collection('userBalances').doc('client-a').set({
        uid: 'client-a',
        email: 'clienta@pouw.test',
        membershipTier: 'PRO',
        availableBalanceMicros: 250_000_000,
        lockedBalanceMicros: 0,
        totalWithdrawnMicros: 0,
        version: 1,
        updatedAt: '2026-11-18T10:00:00.000Z',
      }),
      adminDb.collection('withdrawalRequests').doc('wth-rules-001').set({
        id: 'wth-rules-001',
        userId: 'client-a',
        userEmail: 'clienta@pouw.test',
        status: 'UNDER_REVIEW',
        internalNotes: 'CONFIDENTIAL_AML_INTERNAL_NOTE',
        reviewedBy: 'adm-manager',
        idempotencyKey: 'idem-secret-rules',
      }),
      adminDb.collection('financialLedger').doc('led_lock_wth-rules-001').set({
        id: 'led_lock_wth-rules-001',
        userId: 'client-a',
        withdrawalId: 'wth-rules-001',
        type: 'WITHDRAWAL_LOCK',
        amountMicros: 20_000_000,
      }),
      adminDb.collection('withdrawalAuditEvents').doc('aud_create_wth-rules-001').set({
        id: 'aud_create_wth-rules-001',
        withdrawalId: 'wth-rules-001',
        action: 'CREATE',
      }),
      adminDb.collection('withdrawal_idempotency').doc('client-a__idem-secret-rules').set({
        uid: 'client-a',
        withdrawalId: 'wth-rules-001',
      }),
    ]);

    clientApp = initClientApp(
      { apiKey: 'demo-api-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
      `rules-audit-client-${Date.now()}`,
    );
    const clientAuth = getClientAuth(clientApp);
    connectAuthEmulator(clientAuth, `http://${AUTH_HOST}`, { disableWarnings: true });
    const clientDb = getClientFirestore(clientApp);
    connectFirestoreEmulator(clientDb, fsAddr.host, fsAddr.port);
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

  it('1. F-HIGH-01: denies unauthenticated & cross-UID reads on /users, allows owner read & public exact-key /publicReferralCodes lookup (denies list)', async () => {
    const db = getClientFirestore(clientApp);
    await signOut(getClientAuth(clientApp));

    // Unauthenticated read of /users/client-a -> DENIED (balance no longer public!)
    await assertPermissionDenied(
      () => getDoc(doc(db, 'users', 'client-a')),
      'Unauthenticated getDoc /users/client-a',
    );

    // Unauthenticated exact-key lookup of /publicReferralCodes/CLIENTA99 -> ALLOWED (only uid + referralCode)
    const pubSnap = await getDoc(doc(db, 'publicReferralCodes', 'CLIENTA99'));
    assert.equal(pubSnap.exists(), true);
    assert.equal(pubSnap.data()?.uid, 'client-a');
    assert.equal('balance' in (pubSnap.data() || {}), false);

    // Unauthenticated LIST of /publicReferralCodes -> DENIED
    await assertPermissionDenied(
      () => getDocs(collection(db, 'publicReferralCodes')),
      'Unauthenticated list /publicReferralCodes',
    );

    // Authenticated client-b reading /users/client-a -> DENIED
    await signInAs('client-b');
    await assertPermissionDenied(
      () => getDoc(doc(db, 'users', 'client-a')),
      'Cross-UID getDoc /users/client-a by client-b',
    );

    // Authenticated client-a reading own /users/client-a -> ALLOWED
    await signInAs('client-a');
    const ownUser = await getDoc(doc(db, 'users', 'client-a'));
    assert.equal(ownUser.exists(), true);
    assert.equal(ownUser.data()?.balance, 250);
  });

  it('2. Denies ALL direct Client SDK writes across the 7 protected collections (/userBalances, /users balance fields, /withdrawalRequests, /financialLedger, /withdrawalAuditEvents, /withdrawal_idempotency, /admin_users)', async () => {
    const db = getClientFirestore(clientApp);
    await signInAs('client-a');

    // (1) /userBalances/{uid}: owner can read, NEVER write
    const ownBal = await getDoc(doc(db, 'userBalances', 'client-a'));
    assert.equal(ownBal.exists(), true);
    await assertPermissionDenied(
      () => setDoc(doc(db, 'userBalances', 'client-a'), { availableBalanceMicros: 999_999_999 }, { merge: true }),
      'Client write /userBalances/client-a',
    );
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'userBalances', 'client-a')),
      'Client delete /userBalances/client-a',
    );

    // (2) /users/{uid}: protected financial fields MUST fail
    for (const field of [
      'balance',
      'commissionBalance',
      'totalCommissionsEarned',
      'availableBalanceMicros',
      'lockedBalanceMicros',
      'totalWithdrawnMicros',
      'withdrawableBalance',
      'totalWithdrawn',
    ]) {
      await assertPermissionDenied(
        () => updateDoc(doc(db, 'users', 'client-a'), { [field]: 999999 }),
        `Client update /users/client-a.${field}`,
      );
    }

    // (3) /withdrawalRequests/{id}: F-CRIT-04 denies direct Client SDK read AND write!
    await assertPermissionDenied(
      () => getDoc(doc(db, 'withdrawalRequests', 'wth-rules-001')),
      'F-CRIT-04 Owner direct getDoc /withdrawalRequests/wth-rules-001',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'withdrawalRequests', 'wth-forged'), { userId: 'client-a', status: 'COMPLETED' }),
      'Client create /withdrawalRequests/wth-forged',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'withdrawalRequests', 'wth-rules-001'), { status: 'COMPLETED' }),
      'Client update /withdrawalRequests/wth-rules-001',
    );

    // (4) /financialLedger/{id}: write DENIED
    await assertPermissionDenied(
      () => setDoc(doc(db, 'financialLedger', 'led_fake'), { userId: 'client-a', amountMicros: 1 }),
      'Client create /financialLedger/led_fake',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'financialLedger', 'led_lock_wth-rules-001'), { amountMicros: 0 }),
      'Client update /financialLedger/led_lock_wth-rules-001',
    );

    // (5) /withdrawalAuditEvents/{id}: client read & write DENIED
    await assertPermissionDenied(
      () => getDoc(doc(db, 'withdrawalAuditEvents', 'aud_create_wth-rules-001')),
      'Client read /withdrawalAuditEvents',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'withdrawalAuditEvents', 'aud_fake'), { action: 'APPROVE' }),
      'Client create /withdrawalAuditEvents',
    );

    // (6) /withdrawal_idempotency/{id}: default-deny read & write
    await assertPermissionDenied(
      () => getDoc(doc(db, 'withdrawal_idempotency', 'client-a__idem-secret-rules')),
      'Client read /withdrawal_idempotency',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'withdrawal_idempotency', 'client-a__forged'), { uid: 'client-a' }),
      'Client write /withdrawal_idempotency',
    );

    // (7) /admin_users/{uid}: client write DENIED
    await assertPermissionDenied(
      () => setDoc(doc(db, 'admin_users', 'client-a'), { role: 'admin', status: 'ACTIVE', permissions: ['withdrawals.approve'] }),
      'Client self-promotion in /admin_users',
    );

    // Anonymous user also denied on /financialLedger and /publicReferralCodes create
    await signInAnonymously(getClientAuth(clientApp));
    await assertPermissionDenied(
      () => setDoc(doc(db, 'publicReferralCodes', 'ANONCODE'), { uid: 'x', referralCode: 'ANONCODE', createdAt: 'now' }),
      'Anonymous create /publicReferralCodes',
    );
  });

  it('3. F-CRIT-02: blocks suspended admin, SUPER_ADMIN with empty permissions, and read-only admin from writing /admin_users or escalating privileges', async () => {
    const db = getClientFirestore(clientApp);

    // (a) Suspended admin CANNOT reactivate themselves or read /withdrawalRequests
    await signInAs('adm-suspended');
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'admin_users', 'adm-suspended'), { status: 'ACTIVE' }),
      'Suspended admin self-reactivation in /admin_users',
    );
    await assertPermissionDenied(
      () => getDoc(doc(db, 'withdrawalRequests', 'wth-rules-001')),
      'Suspended admin read /withdrawalRequests',
    );

    // (b) SUPER_ADMIN with permissions: [] CANNOT read /withdrawalRequests or grant self permissions
    await signInAs('adm-super-empty');
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'admin_users', 'adm-super-empty'), { permissions: ['withdrawals.approve', 'withdrawals.broadcast'] }),
      'SUPER_ADMIN empty-perms self-escalation in /admin_users',
    );
    await assertPermissionDenied(
      () => getDoc(doc(db, 'withdrawalRequests', 'wth-rules-001')),
      'SUPER_ADMIN empty-perms read /withdrawalRequests',
    );

    // (c) Active read-only admin (permissions: ['withdrawals.read']) CAN read /withdrawalRequests,
    //     CANNOT read /withdrawalAuditEvents, and CANNOT escalate own /admin_users permissions
    await signInAs('adm-readonly');
    const reqSnap = await getDoc(doc(db, 'withdrawalRequests', 'wth-rules-001'));
    assert.equal(reqSnap.exists(), true);
    await assertPermissionDenied(
      () => getDoc(doc(db, 'withdrawalAuditEvents', 'aud_create_wth-rules-001')),
      'Read-only admin read /withdrawalAuditEvents without withdrawals.audit',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'admin_users', 'adm-readonly'), { permissions: ['withdrawals.read', 'withdrawals.broadcast'] }),
      'Read-only admin privilege escalation in /admin_users',
    );

    // (d) Active admin with explicit 'admin.users.manage' CAN update /admin_users (delete still forbidden)
    await signInAs('adm-manager');
    await updateDoc(doc(db, 'admin_users', 'adm-readonly'), { displayName: 'Audited Read-Only Operator' });
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'admin_users', 'adm-readonly')),
      'Admin delete /admin_users must stay forbidden',
    );
  });
});
