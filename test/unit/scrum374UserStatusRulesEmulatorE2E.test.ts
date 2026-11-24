/**
 * SCRUM-374 — Real Firebase Auth + Firestore Emulator Security Rules Verification for `/users/{uid}.status`
 *
 * Verifies against live Firebase Auth + Firestore Emulators loaded with `firestore.rules`:
 *  1. Pure LF `firestore.rules` (HAS_CR=false) and canonical SCRUM-374 SHA-256 parity.
 *  2. create `/users/{uid}` with `status: 'active'` -> ALLOWED; without `status` (legacy) -> ALLOWED.
 *  3. create `/users/{uid}` with `status: 'ACTIVE'`, `'suspended'`, `'blocked'`, `'inactive'`, `true`, `null`, `''`, `123` -> PERMISSION_DENIED.
 *  4. updateDoc / setDoc(merge) / deleteField on `status` by `'suspended'`, `'blocked'`, `'active'`, or legacy user -> PERMISSION_DENIED.
 *  5. updateDoc by `'active'` user on non-protected profile fields (`displayName`, `country`, `walletAddress`) -> ALLOWED (no regression).
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { initializeApp as initAdminApp, deleteApp as deleteAdminApp, type App as AdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initClientApp, deleteApp as deleteClientApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth as getClientAuth,
  signInWithCustomToken,
  signOut,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  deleteField,
  doc,
  getDoc,
  getFirestore as getClientFirestore,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'salad-miners';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const EXPECTED_RULES_SHA256 = 'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779';

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

describe('SCRUM-374: /users/{uid}.status Protection in firestore.rules (Auth + Firestore Emulator)', () => {
  let adminApp: AdminApp;
  let clientApp: FirebaseApp;
  const fsAddr = parseHostPort(FIRESTORE_HOST, 8080);

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;

    adminApp = initAdminApp({ projectId: PROJECT_ID }, `scrum374-rules-admin-${Date.now()}`);
    const adminDb = getAdminFirestore(adminApp);

    await Promise.all([
      adminDb.collection('users').doc('u374-active').set({
        uid: 'u374-active',
        email: 'active374@pouw.test',
        displayName: 'Active User',
        country: 'US',
        walletAddress: '',
        status: 'active',
        balance: 0,
      }),
      adminDb.collection('users').doc('u374-suspended').set({
        uid: 'u374-suspended',
        email: 'suspended374@pouw.test',
        displayName: 'Suspended User',
        status: 'suspended',
        balance: 0,
      }),
      adminDb.collection('users').doc('u374-blocked').set({
        uid: 'u374-blocked',
        email: 'blocked374@pouw.test',
        displayName: 'Blocked User',
        status: 'blocked',
        balance: 0,
      }),
      adminDb.collection('users').doc('u374-legacy').set({
        uid: 'u374-legacy',
        email: 'legacy374@pouw.test',
        displayName: 'Legacy User',
        balance: 0,
      }),
    ]);

    clientApp = initClientApp(
      { apiKey: 'demo-api-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
      `scrum374-rules-client-${Date.now()}`,
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

  it('1. Verifies firestore.rules pure LF parity and updated SCRUM-374 SHA-256', () => {
    const raw = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'));
    assert.equal(raw.includes(0x0d), false, 'firestore.rules must be pure LF (HAS_CR=false)');
    const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
    assert.equal(hash, EXPECTED_RULES_SHA256);
  });

  it('2. Allows create /users/{uid} with status: "active" and without status (legacy compatibility)', async () => {
    const db = getClientFirestore(clientApp);

    await signInAs('u374-create-active');
    await setDoc(doc(db, 'users', 'u374-create-active'), {
      uid: 'u374-create-active',
      email: 'create-active@pouw.test',
      status: 'active',
      balance: 0,
    });
    const activeSnap = await getDoc(doc(db, 'users', 'u374-create-active'));
    assert.equal(activeSnap.exists(), true);
    assert.equal(activeSnap.data()?.status, 'active');

    await signInAs('u374-create-legacy');
    await setDoc(doc(db, 'users', 'u374-create-legacy'), {
      uid: 'u374-create-legacy',
      email: 'create-legacy@pouw.test',
      balance: 0,
    });
    const legacySnap = await getDoc(doc(db, 'users', 'u374-create-legacy'));
    assert.equal(legacySnap.exists(), true);
    assert.equal(legacySnap.data()?.status, undefined);
  });

  it('3. Denies create /users/{uid} with invalid or non-canonical status values (ACTIVE, suspended, blocked, inactive, true, null, empty, number)', async () => {
    const db = getClientFirestore(clientApp);
    const invalidCases: Array<{ uid: string; status: unknown; label: string }> = [
      { uid: 'u374-bad-upper', status: 'ACTIVE', label: 'uppercase ACTIVE' },
      { uid: 'u374-bad-susp', status: 'suspended', label: 'suspended' },
      { uid: 'u374-bad-block', status: 'blocked', label: 'blocked' },
      { uid: 'u374-bad-inact', status: 'inactive', label: 'inactive' },
      { uid: 'u374-bad-bool', status: true, label: 'boolean true' },
      { uid: 'u374-bad-null', status: null, label: 'null' },
      { uid: 'u374-bad-empty', status: '', label: 'empty string' },
      { uid: 'u374-bad-num', status: 1, label: 'number 1' },
    ];

    for (const tc of invalidCases) {
      await signInAs(tc.uid);
      await assertPermissionDenied(
        () =>
          setDoc(doc(db, 'users', tc.uid), {
            uid: tc.uid,
            email: `${tc.uid}@pouw.test`,
            status: tc.status,
            balance: 0,
          }),
        `create /users/${tc.uid} with status=${tc.label}`,
      );
    }
  });

  it('4. Denies self-reactivation and any client status mutation on update (suspended, blocked, active, legacy, deleteField, setDoc merge, cross-UID)', async () => {
    const db = getClientFirestore(clientApp);

    // Suspended user attempting self-reactivation / deleteField / setDoc merge
    await signInAs('u374-suspended');
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'users', 'u374-suspended'), { status: 'active' }),
      'Suspended user updateDoc status -> active',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'users', 'u374-suspended'), { status: deleteField() }),
      'Suspended user deleteField status',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'users', 'u374-suspended'), { status: 'active' }, { merge: true }),
      'Suspended user setDoc merge status -> active',
    );

    // Blocked user attempting self-reactivation / deleteField / setDoc merge
    await signInAs('u374-blocked');
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'users', 'u374-blocked'), { status: 'active' }),
      'Blocked user updateDoc status -> active',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'users', 'u374-blocked'), { status: deleteField() }),
      'Blocked user deleteField status',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'users', 'u374-blocked'), { status: 'active' }, { merge: true }),
      'Blocked user setDoc merge status -> active',
    );

    // Active user attempting any status mutation or cross-UID status update
    await signInAs('u374-active');
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'users', 'u374-active'), { status: 'inactive' }),
      'Active user updateDoc status -> inactive',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'users', 'u374-active'), { status: deleteField() }),
      'Active user deleteField status',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'users', 'u374-suspended'), { status: 'active' }),
      'Cross-UID updateDoc on suspended user status',
    );

    // Legacy user (no status field) attempting to add status via update
    await signInAs('u374-legacy');
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'users', 'u374-legacy'), { status: 'active' }),
      'Legacy user updateDoc adding status',
    );
  });

  it('5. No-Regression: allows active user updateDoc on displayName, country, and walletAddress without touching status', async () => {
    const db = getClientFirestore(clientApp);
    await signInAs('u374-active');

    await updateDoc(doc(db, 'users', 'u374-active'), {
      displayName: 'Active User Updated',
      country: 'MX',
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    });

    const snap = await getDoc(doc(db, 'users', 'u374-active'));
    assert.equal(snap.exists(), true);
    assert.equal(snap.data()?.displayName, 'Active User Updated');
    assert.equal(snap.data()?.country, 'MX');
    assert.equal(snap.data()?.walletAddress, '0x1234567890abcdef1234567890abcdef12345678');
    assert.equal(snap.data()?.status, 'active');
  });
});
