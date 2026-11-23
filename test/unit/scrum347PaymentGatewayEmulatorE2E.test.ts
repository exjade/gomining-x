/**
 * SCRUM-347 (PG-05) — Real Firebase Auth + Firestore Emulator Security & Query Parity E2E
 *
 * Verifies against live Firebase Auth + Firestore Emulators loaded with `firestore.rules`:
 *  1. Pure LF `firestore.rules` SHA-256 = EA8F0C18923E1B2D25ED1C9D2599858475ADDDB06E6677667F29EC594F90705C.
 *  2. PERMISSION_DENIED on direct browser writes (setDoc, updateDoc, deleteDoc) from registered and
 *     anonymous sessions across all 6 financial collections:
 *     /admin_orders, /admin_contracts, /miners/{uid}/miner/{minerId} (except strictly cosmetic owner update),
 *     /referrals/{uid}, /payment_intents, /usedTxHashes.
 *  3. Real SCRUM-370 client query on /admin_orders:
 *     getDocs(query(collection(db, 'admin_orders'), where('userId', '==', 'client-a'))) PASSES for client-a
 *     and returns only client-a orders; cross-UID query/getDoc and anonymous queries return PERMISSION_DENIED.
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
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'salad-miners';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const EXPECTED_RULES_SHA256 = 'EA8F0C18923E1B2D25ED1C9D2599858475ADDDB06E6677667F29EC594F90705C';

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

describe('SCRUM-347 (PG-05): Payment Gateway Auth + Firestore Emulator E2E', () => {
  let adminApp: AdminApp;
  let clientApp: FirebaseApp;
  const fsAddr = parseHostPort(FIRESTORE_HOST, 8080);

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;

    adminApp = initAdminApp({ projectId: PROJECT_ID }, `scrum347-emu-admin-${Date.now()}`);
    const adminDb = getAdminFirestore(adminApp);

    await Promise.all([
      adminDb.collection('admin_users').doc('adm-347').set({
        uid: 'adm-347',
        email: 'admin347@pouwminer.com',
        role: 'admin',
        status: 'ACTIVE',
        permissions: ['payments.read', 'payments.audit'],
      }),
      adminDb.collection('miners').doc('client-a').collection('miner').doc('miner-347-a').set({
        id: 'miner-347-a',
        uid: 'client-a',
        status: 'active',
        powerTh: 48,
        hashrate: 48,
        pricePaidUsdt: 561.99,
        appearance: { wall: 'obsidian' },
      }),
      adminDb.collection('admin_orders').doc('ord-347-a1').set({
        orderId: 'ord-347-a1',
        intentId: 'ord-347-a1',
        userId: 'client-a',
        buyerUid: 'client-a',
        status: 'SETTLED',
        amountUsd: 561.99,
        createdAt: '2026-11-22T10:00:00.000Z',
      }),
      adminDb.collection('admin_orders').doc('ord-347-a2').set({
        orderId: 'ord-347-a2',
        intentId: 'ord-347-a2',
        userId: 'client-a',
        buyerUid: 'client-a',
        status: 'PROCESSING',
        confirmations: 5,
        requiredConfirmations: 15,
        amountUsd: 744.99,
        createdAt: '2026-11-22T11:00:00.000Z',
      }),
      adminDb.collection('admin_orders').doc('ord-347-a3-legacy').set({
        orderId: 'ord-347-a3-legacy',
        userId: 'client-a',
        paymentNetwork: 'PLATFORM_BALANCE',
        status: 'SETTLED',
        amountUsd: 100,
        createdAt: '2026-11-22T09:00:00.000Z',
      }),
      adminDb.collection('admin_orders').doc('ord-347-b1').set({
        orderId: 'ord-347-b1',
        intentId: 'ord-347-b1',
        userId: 'client-b',
        buyerUid: 'client-b',
        status: 'AWAITING',
        amountUsd: 1111.99,
        createdAt: '2026-11-22T12:00:00.000Z',
      }),
      adminDb.collection('admin_contracts').doc('ctr-347-a').set({
        id: 'ctr-347-a',
        orderId: 'ord-347-a1',
        activatedMinerId: 'miner-347-a',
        userId: 'client-a',
        uid: 'client-a',
        contractedTh: 48,
        allocatedTh: 48,
        status: 'ACTIVE',
      }),
      adminDb.collection('payment_intents').doc('pi-347-a').set({
        intentId: 'pi-347-a',
        orderId: 'ord-347-a2',
        buyerUid: 'client-a',
        userId: 'client-a',
        status: 'PROCESSING',
        amountUsd: 744.99,
      }),
      adminDb.collection('usedTxHashes').doc('97_0xabc347').set({
        usedTxKey: '97_0xabc347',
        intentId: 'pi-347-a',
      }),
      adminDb.collection('referrals').doc('client-a').set({
        uid: 'client-a',
        withdrawableBalance: 50,
      }),
    ]);

    clientApp = initClientApp(
      { apiKey: 'demo-api-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
      `scrum347-emu-client-${Date.now()}`,
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

  it('1. Confirms firestore.rules pure LF parity and exact SHA-256 EA8F0C18...', () => {
    const raw = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'));
    assert.equal(raw.includes(0x0d), false, 'firestore.rules must have 0 CRLF bytes');
    const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
    assert.equal(hash, EXPECTED_RULES_SHA256);
  });

  it('2. Denies direct browser writes (registered & anonymous) on all 6 financial collections while allowing owner cosmetic miner updates', async () => {
    const db = getClientFirestore(clientApp);

    // 2A. Registered non-anonymous user (client-a)
    await signInAs('client-a');
    await assertPermissionDenied(
      () => setDoc(doc(db, 'admin_orders', 'ord-forge-347'), { userId: 'client-a', buyerUid: 'client-a', status: 'SETTLED' }),
      'Registered create /admin_orders',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'admin_orders', 'ord-347-a2'), { status: 'SETTLED' }),
      'Registered update /admin_orders',
    );
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'admin_orders', 'ord-347-a1')),
      'Registered delete /admin_orders',
    );

    await assertPermissionDenied(
      () => setDoc(doc(db, 'admin_contracts', 'ctr-forge-347'), { userId: 'client-a', status: 'ACTIVE' }),
      'Registered create /admin_contracts',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'admin_contracts', 'ctr-347-a'), { allocatedTh: 9999 }),
      'Registered update /admin_contracts',
    );
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'admin_contracts', 'ctr-347-a')),
      'Registered delete /admin_contracts',
    );

    await assertPermissionDenied(
      () => setDoc(doc(db, 'miners', 'client-a', 'miner', 'miner-forge-347'), { uid: 'client-a', status: 'active', powerTh: 500 }),
      'Registered create /miners',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'miners', 'client-a', 'miner', 'miner-347-a'), { powerTh: 9999 }),
      'Registered financial update /miners',
    );
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'miners', 'client-a', 'miner', 'miner-347-a')),
      'Registered delete /miners',
    );

    // Owner cosmetic update still allowed
    await updateDoc(doc(db, 'miners', 'client-a', 'miner', 'miner-347-a'), {
      appearance: { wall: 'gold-matte' },
    });
    const minerAfter = await getDoc(doc(db, 'miners', 'client-a', 'miner', 'miner-347-a'));
    assert.equal(minerAfter.data()?.appearance?.wall, 'gold-matte');

    await assertPermissionDenied(
      () => setDoc(doc(db, 'referrals', 'client-a'), { withdrawableBalance: 99999 }, { merge: true }),
      'Registered write /referrals',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'payment_intents', 'pi-forge-347'), { buyerUid: 'client-a', status: 'SETTLED' }),
      'Registered create /payment_intents',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'payment_intents', 'pi-347-a'), { status: 'SETTLED' }),
      'Registered update /payment_intents',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'usedTxHashes', '97_0xforge347'), { intentId: 'pi-347-a' }),
      'Registered create /usedTxHashes',
    );

    // 2B. Anonymous session denied on all 6 financial collections
    await signInAnonymously(getClientAuth(clientApp));
    await assertPermissionDenied(
      () => setDoc(doc(db, 'admin_orders', 'ord-anon-347'), { status: 'SETTLED' }),
      'Anonymous write /admin_orders',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'admin_contracts', 'ctr-anon-347'), { status: 'ACTIVE' }),
      'Anonymous write /admin_contracts',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'miners', 'client-a', 'miner', 'miner-347-a'), { appearance: { wall: 'anon' } }),
      'Anonymous update /miners',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'referrals', 'client-a'), { withdrawableBalance: 1 }, { merge: true }),
      'Anonymous write /referrals',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'payment_intents', 'pi-anon-347'), { status: 'OPEN' }),
      'Anonymous write /payment_intents',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'usedTxHashes', '97_0xanon347'), { intentId: 'pi-anon-347' }),
      'Anonymous write /usedTxHashes',
    );
  });

  it('3. Verifies real SCRUM-370 /admin_orders query (where userId == auth.uid): owner PASS, cross-UID & anonymous PERMISSION_DENIED', async () => {
    const db = getClientFirestore(clientApp);

    // Owner (client-a) query where('userId', '==', 'client-a') PASSES and returns strictly own orders
    await signInAs('client-a');
    const ownSnap = await getDocs(
      query(collection(db, 'admin_orders'), where('userId', '==', 'client-a')),
    );
    const ownIds = ownSnap.docs.map((d) => d.id).sort();
    assert.ok(ownIds.includes('ord-347-a1'), 'Owner query must include ord-347-a1');
    assert.ok(ownIds.includes('ord-347-a2'), 'Owner query must include ord-347-a2');
    assert.ok(ownIds.includes('ord-347-a3-legacy'), 'Owner query must include legacy SCRUM-221 order without buyerUid');
    assert.equal(ownIds.includes('ord-347-b1'), false, 'Owner query must NEVER include client-b orders');
    for (const d of ownSnap.docs) {
      assert.equal(d.data().userId, 'client-a');
    }

    // Legacy SCRUM-221 order (userId only, no buyerUid) direct getDoc PASSES for owner
    const legacySnap = await getDoc(doc(db, 'admin_orders', 'ord-347-a3-legacy'));
    assert.equal(legacySnap.exists(), true, 'Owner must be able to getDoc legacy SCRUM-221 order without buyerUid');

    // Owner (client-a) query on /admin_contracts where('userId', '==', 'client-a') PASSES; cross-UID DENIED
    const ownContractsSnap = await getDocs(
      query(collection(db, 'admin_contracts'), where('userId', '==', 'client-a')),
    );
    assert.ok(ownContractsSnap.docs.some((d) => d.id === 'ctr-347-a'), 'Owner query must return own contract');
    await assertPermissionDenied(
      () => getDocs(query(collection(db, 'admin_contracts'), where('userId', '==', 'client-b'))),
      'Cross-UID query /admin_contracts where userId == client-b',
    );

    // Cross-UID query filtering for client-b DENIED
    await assertPermissionDenied(
      () => getDocs(query(collection(db, 'admin_orders'), where('userId', '==', 'client-b'))),
      'Cross-UID query /admin_orders where userId == client-b',
    );

    // Direct cross-UID getDoc DENIED
    await assertPermissionDenied(
      () => getDoc(doc(db, 'admin_orders', 'ord-347-b1')),
      'Cross-UID getDoc /admin_orders/ord-347-b1',
    );

    // Unfiltered collection scan by non-admin DENIED
    await assertPermissionDenied(
      () => getDocs(collection(db, 'admin_orders')),
      'Non-admin unfiltered getDocs /admin_orders',
    );

    // Anonymous query DENIED
    await signInAnonymously(getClientAuth(clientApp));
    await assertPermissionDenied(
      () => getDocs(query(collection(db, 'admin_orders'), where('userId', '==', 'client-a'))),
      'Anonymous query /admin_orders',
    );

    // Active Admin can read /admin_orders & /admin_contracts but CANNOT write directly from browser
    await signInAs('adm-347');
    const adminSnap = await getDocs(collection(db, 'admin_orders'));
    assert.ok(adminSnap.size >= 3, 'Active admin must be able to read /admin_orders');
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'admin_contracts', 'ctr-347-a'), { allocatedTh: 10 }),
      'Even active admin browser write to /admin_contracts MUST be denied (Admin SDK only)',
    );
  });
});
