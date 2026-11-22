/**
 * SCRUM-346 (PG-04) — Real Firebase Auth + Firestore Emulator E2E Verification
 * Verifies atomic server-authoritative lockdown of financial collections in firestore.rules:
 *  - /miners/{uid}/miner/{minerId} (create/delete denied; non-cosmetic update denied; owner cosmetic update allowed)
 *  - /admin_orders/{orderId} (all client writes denied; owner/admin read allowed; cross-UID read denied)
 *  - /admin_contracts/{contractId} (all client writes denied; owner/admin read allowed; cross-UID read denied)
 *  - /payment_intents/{intentId} (all client writes denied; owner/admin read allowed; cross-UID read denied)
 *  - /usedTxHashes/{txKey} (all client writes denied; non-admin read denied; admin read allowed)
 *  - /referrals/{uid} & /referrals/{uid}/transactions/{txId} (all client writes denied; owner/admin read allowed; cross-UID read denied)
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
  signInWithCustomToken,
  signOut,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  deleteDoc,
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

describe('SCRUM-346 (PG-04): Payment Hardening Firestore Rules E2E (Auth + Firestore Emulator)', () => {
  let adminApp: AdminApp;
  let clientApp: FirebaseApp;
  const fsAddr = parseHostPort(FIRESTORE_HOST, 8080);

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
    process.env.FIREBASE_AUTH_EMULATOR_HOST = AUTH_HOST;

    adminApp = initAdminApp({ projectId: PROJECT_ID }, `scrum346-rules-admin-${Date.now()}`);
    const adminDb = getAdminFirestore(adminApp);

    await Promise.all([
      adminDb.collection('admin_users').doc('adm-346').set({
        uid: 'adm-346',
        email: 'admin346@pouw.test',
        role: 'admin',
        status: 'ACTIVE',
        permissions: ['withdrawals.read', 'withdrawals.audit'],
      }),
      adminDb.collection('miners').doc('client-a').collection('miner').doc('seeded-miner-1').set({
        id: 'seeded-miner-1',
        uid: 'client-a',
        status: 'active',
        powerTh: 48,
        hashrate: 48,
        pricePaidUsdt: 561.99,
        appearance: { wall: 'default' },
      }),
      adminDb.collection('admin_orders').doc('ord-seed-a').set({
        orderId: 'ord-seed-a',
        buyerUid: 'client-a',
        userId: 'client-a',
        status: 'SETTLED',
        amountUsd: 561.99,
      }),
      adminDb.collection('admin_contracts').doc('ctr-seed-a').set({
        contractId: 'ctr-seed-a',
        uid: 'client-a',
        userId: 'client-a',
        status: 'ACTIVE',
      }),
      adminDb.collection('payment_intents').doc('pi-seed-a').set({
        intentId: 'pi-seed-a',
        buyerUid: 'client-a',
        status: 'AWAITING',
        amountUsd: 561.99,
      }),
      adminDb.collection('usedTxHashes').doc('56_0xseeded').set({
        usedTxKey: '56_0xseeded',
        intentId: 'pi-seed-a',
      }),
      adminDb.collection('referrals').doc('client-a').set({
        uid: 'client-a',
        withdrawableBalance: 25,
      }),
      adminDb.collection('referrals').doc('client-a').collection('transactions').doc('tx-seed-a').set({
        id: 'tx-seed-a',
        amount: 25,
        type: 'commission_income',
      }),
    ]);

    clientApp = initClientApp(
      { apiKey: 'demo-api-key', projectId: PROJECT_ID, authDomain: `${PROJECT_ID}.firebaseapp.com` },
      `scrum346-rules-client-${Date.now()}`,
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

  it('1. Denies client create/delete and financial field updates on /miners/{uid}/miner/{minerId}, while allowing owner cosmetic updates', async () => {
    const db = getClientFirestore(clientApp);
    await signInAs('client-a');

    await assertPermissionDenied(
      () => setDoc(doc(db, 'miners', 'client-a', 'miner', 'fake-1'), { uid: 'client-a', status: 'active', powerTh: 999 }),
      'Client create /miners/client-a/miner/fake-1',
    );
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'miners', 'client-a', 'miner', 'seeded-miner-1')),
      'Client delete /miners/client-a/miner/seeded-miner-1',
    );

    for (const [field, value] of [
      ['status', 'inactive'],
      ['hashrate', 9999],
      ['powerTh', 9999],
      ['pricePaidUsdt', 0.01],
    ] as const) {
      await assertPermissionDenied(
        () => updateDoc(doc(db, 'miners', 'client-a', 'miner', 'seeded-miner-1'), { [field]: value }),
        `Client financial update /miners/client-a/miner/seeded-miner-1.${field}`,
      );
    }

    // Owner cosmetic update ALLOWED
    await updateDoc(doc(db, 'miners', 'client-a', 'miner', 'seeded-miner-1'), {
      appearance: { wall: 'neon-violet', updatedAt: '2026-11-22T12:00:00.000Z' },
    });
    const updated = await getDoc(doc(db, 'miners', 'client-a', 'miner', 'seeded-miner-1'));
    assert.equal(updated.data()?.appearance?.wall, 'neon-violet');

    // Cross-UID cosmetic update DENIED
    await signInAs('client-b');
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'miners', 'client-a', 'miner', 'seeded-miner-1'), { appearance: { wall: 'hacked' } }),
      'Cross-UID cosmetic update /miners/client-a/miner/seeded-miner-1',
    );
  });

  it('2. Denies client create/update/delete on /admin_orders, /admin_contracts, /payment_intents, /usedTxHashes, and /referrals', async () => {
    const db = getClientFirestore(clientApp);
    await signInAs('client-a');

    await assertPermissionDenied(
      () => setDoc(doc(db, 'admin_orders', 'fake-order'), { buyerUid: 'client-a', status: 'SETTLED' }),
      'Client create /admin_orders/fake-order',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'admin_orders', 'ord-seed-a'), { status: 'SETTLED', amountUsd: 1 }),
      'Client update /admin_orders/ord-seed-a',
    );
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'admin_orders', 'ord-seed-a')),
      'Client delete /admin_orders/ord-seed-a',
    );

    await assertPermissionDenied(
      () => setDoc(doc(db, 'admin_contracts', 'fake-contract'), { uid: 'client-a', status: 'ACTIVE' }),
      'Client create /admin_contracts/fake-contract',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'admin_contracts', 'ctr-seed-a'), { status: 'TERMINATED' }),
      'Client update /admin_contracts/ctr-seed-a',
    );
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'admin_contracts', 'ctr-seed-a')),
      'Client delete /admin_contracts/ctr-seed-a',
    );

    await assertPermissionDenied(
      () => setDoc(doc(db, 'payment_intents', 'fake-intent'), { buyerUid: 'client-a', status: 'SETTLED' }),
      'Client create /payment_intents/fake-intent',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'payment_intents', 'pi-seed-a'), { status: 'SETTLED' }),
      'Client update /payment_intents/pi-seed-a',
    );
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'payment_intents', 'pi-seed-a')),
      'Client delete /payment_intents/pi-seed-a',
    );

    await assertPermissionDenied(
      () => setDoc(doc(db, 'usedTxHashes', '56_0xabc'), { intentId: 'pi-seed-a' }),
      'Client create /usedTxHashes/56_0xabc',
    );
    await assertPermissionDenied(
      () => updateDoc(doc(db, 'usedTxHashes', '56_0xseeded'), { intentId: 'hijacked' }),
      'Client update /usedTxHashes/56_0xseeded',
    );
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'usedTxHashes', '56_0xseeded')),
      'Client delete /usedTxHashes/56_0xseeded',
    );

    await assertPermissionDenied(
      () => setDoc(doc(db, 'referrals', 'client-a'), { withdrawableBalance: 9999 }, { merge: true }),
      'Client write /referrals/client-a',
    );
    await assertPermissionDenied(
      () => setDoc(doc(db, 'referrals', 'client-a', 'transactions', 't1'), { amount: 9999, type: 'commission_income' }),
      'Client create /referrals/client-a/transactions/t1',
    );
    await assertPermissionDenied(
      () => deleteDoc(doc(db, 'referrals', 'client-a', 'transactions', 'tx-seed-a')),
      'Client delete /referrals/client-a/transactions/tx-seed-a',
    );
  });

  it('3. Enforces strict owner/admin read isolation on /payment_intents, /admin_orders, /admin_contracts, /referrals, and admin-only on /usedTxHashes', async () => {
    const db = getClientFirestore(clientApp);

    // Owner (client-a) ALLOWED on own docs, DENIED on /usedTxHashes
    await signInAs('client-a');
    const [ownIntent, ownOrder, ownContract, ownRef, ownRefTx] = await Promise.all([
      getDoc(doc(db, 'payment_intents', 'pi-seed-a')),
      getDoc(doc(db, 'admin_orders', 'ord-seed-a')),
      getDoc(doc(db, 'admin_contracts', 'ctr-seed-a')),
      getDoc(doc(db, 'referrals', 'client-a')),
      getDoc(doc(db, 'referrals', 'client-a', 'transactions', 'tx-seed-a')),
    ]);
    assert.equal(ownIntent.exists(), true);
    assert.equal(ownOrder.exists(), true);
    assert.equal(ownContract.exists(), true);
    assert.equal(ownRef.exists(), true);
    assert.equal(ownRefTx.exists(), true);

    await assertPermissionDenied(
      () => getDoc(doc(db, 'usedTxHashes', '56_0xseeded')),
      'Non-admin read /usedTxHashes/56_0xseeded',
    );

    // Cross-UID (client-b) DENIED on all client-a docs
    await signInAs('client-b');
    await assertPermissionDenied(() => getDoc(doc(db, 'payment_intents', 'pi-seed-a')), 'Cross-UID read /payment_intents');
    await assertPermissionDenied(() => getDoc(doc(db, 'admin_orders', 'ord-seed-a')), 'Cross-UID read /admin_orders');
    await assertPermissionDenied(() => getDoc(doc(db, 'admin_contracts', 'ctr-seed-a')), 'Cross-UID read /admin_contracts');
    await assertPermissionDenied(() => getDoc(doc(db, 'referrals', 'client-a')), 'Cross-UID read /referrals');
    await assertPermissionDenied(() => getDoc(doc(db, 'referrals', 'client-a', 'transactions', 'tx-seed-a')), 'Cross-UID read /referrals/transactions');

    // Active Admin (adm-346) ALLOWED on all including /usedTxHashes
    await signInAs('adm-346');
    const [admIntent, admOrder, admUsedTx] = await Promise.all([
      getDoc(doc(db, 'payment_intents', 'pi-seed-a')),
      getDoc(doc(db, 'admin_orders', 'ord-seed-a')),
      getDoc(doc(db, 'usedTxHashes', '56_0xseeded')),
    ]);
    assert.equal(admIntent.exists(), true);
    assert.equal(admOrder.exists(), true);
    assert.equal(admUsedTx.exists(), true);
  });
});
