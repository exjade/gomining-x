// Browser global polyfills for Node.js unit test execution
if (typeof (globalThis as any).localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
}

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as paymentsModule from '../../src/services/admin/packagePaymentsService.js';
import type { PackageOrderPayment, OrderPaymentStatus } from '../../src/types/admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8');
}

describe('SCRUM-370 (PG-06) Task 2: Admin Real-Time Payment Tracking & Hardening', () => {
  it('1. Enforces canonical 8-state machine + retroactive REVERSED without CONFIRMED or PENDING in src/types/admin.ts', () => {
    const typesSrc = readSource('src/types/admin.ts');
    const statusMatch = typesSrc.match(/export type OrderPaymentStatus\s*=[\s\S]*?;/);
    assert.ok(statusMatch, 'OrderPaymentStatus type must exist');
    const statusDef = statusMatch[0];

    const requiredStatuses = [
      'OPEN',
      'AWAITING',
      'PROCESSING',
      'SETTLED',
      'UNDERPAID',
      'FAILED',
      'EXPIRED',
      'CANCELLED',
      'REVERSED',
    ];
    for (const s of requiredStatuses) {
      assert.ok(statusDef.includes(`'${s}'`), `OrderPaymentStatus must include '${s}'`);
    }
    assert.equal(statusDef.includes("'CONFIRMED'"), false, "OrderPaymentStatus must NOT contain 'CONFIRMED'");
    assert.equal(statusDef.includes("'PENDING'"), false, "OrderPaymentStatus must NOT contain 'PENDING'");

    const orderMatch = typesSrc.match(/export interface PackageOrderPayment\s*\{[\s\S]*?\}/);
    assert.ok(orderMatch, 'PackageOrderPayment interface must exist');
    const orderDef = orderMatch[0];
    for (const field of ['intentId?:', 'buyerUid?:', 'networkMode?:', 'productType?:', 'contractId?:']) {
      assert.ok(orderDef.includes(field), `PackageOrderPayment must include ${field}`);
    }
  });

  it('2. Removes INITIAL_PACKAGE_PAYMENTS, confirmAndSettlePayment, setDoc, Math.random, and fake defaults in packagePaymentsService.ts', () => {
    const src = readSource('src/services/admin/packagePaymentsService.ts');
    for (const forbidden of [
      'INITIAL_PACKAGE_PAYMENTS',
      'confirmAndSettlePayment',
      'setDoc(',
      'updateDoc(',
      'deleteDoc(',
      'Math.random(',
      'BRIDGE_SPEI',
      'confirmations ?? 12',
      "|| 'SETTLED'",
      'tx_internal',
    ]) {
      assert.equal(src.includes(forbidden), false, `packagePaymentsService.ts must have 0 occurrences of ${forbidden}`);
    }
    assert.equal('INITIAL_PACKAGE_PAYMENTS' in paymentsModule, false, 'INITIAL_PACKAGE_PAYMENTS must not be exported');

    const service = paymentsModule.PackagePaymentsService.getInstance();
    assert.deepEqual(service.getPayments(), [], 'getPayments() must return [] without hardcoded mocks');
    assert.equal(typeof (service as any).reverifyPaymentOnChain, 'function', 'reverifyPaymentOnChain must exist');
    assert.ok(src.includes('confirmPaymentIntent'), 'packagePaymentsService.ts must wire confirmPaymentIntent callable');
    assert.ok(src.includes('httpsCallable'), 'packagePaymentsService.ts must use httpsCallable');
    assert.ok(src.includes('getFunctions'), 'packagePaymentsService.ts must use getFunctions');
  });

  it('3. Normalizes Firestore order docs safely (confirmations=0, status=OPEN, never SETTLED or 12)', () => {
    const normalize = (paymentsModule as any).normalizePackageOrderDoc;
    assert.equal(typeof normalize, 'function', 'normalizePackageOrderDoc helper must be exported');

    const minimal = normalize('ord_minimal_1', {
      userId: 'uid_1',
      packageName: 'Minero 1',
      amountUsd: 561.99,
      powerTh: 48,
    });
    assert.equal(minimal.orderId, 'ord_minimal_1');
    assert.equal(minimal.confirmations, 0, 'confirmations must default to 0, never 12');
    assert.equal(minimal.requiredConfirmations, 1, 'requiredConfirmations must default to 1');
    assert.equal(minimal.status, 'OPEN', 'status must default to OPEN, never SETTLED');
    assert.equal(minimal.txHash, undefined, 'missing txHash must remain undefined, never tx_internal');
    assert.equal(minimal.activatedMinerId, undefined, 'missing activatedMinerId must not default to orderId');
  });

  it('4. Computes pure getSummary(payments) KPIs accurately across all 8 states + REVERSED', () => {
    const service = paymentsModule.PackagePaymentsService.getInstance();
    const mk = (id: string, status: OrderPaymentStatus, amountUsd: number, contractedTh: number): PackageOrderPayment => ({
      orderId: id,
      attemptId: `att_${id}`,
      intentId: `pi_${id}`,
      createdAt: '2026-11-22T12:00:00.000Z',
      userId: 'uid_test',
      userEmail: 'user@pouwminer.com',
      userName: 'Test User',
      packageId: 'pkg-1',
      packageName: 'Minero 1',
      contractedTh,
      amountUsd,
      cryptoAsset: 'USDT',
      cryptoAmount: `${amountUsd} USDT`,
      paymentNetwork: 'BSC',
      recipientAddress: '0x1111111111111111111111111111111111111111',
      confirmations: status === 'SETTLED' ? 15 : 0,
      requiredConfirmations: 15,
      status,
      idempotencyKey: `idem_${id}`,
    });

    const sample: PackageOrderPayment[] = [
      mk('o1', 'OPEN', 100, 10),
      mk('o2', 'AWAITING', 200, 20),
      mk('o3', 'PROCESSING', 300, 30),
      mk('o4', 'SETTLED', 561.99, 48),
      mk('o5', 'SETTLED', 744.99, 64),
      mk('o6', 'UNDERPAID', 400, 40),
      mk('o7', 'FAILED', 500, 50),
      mk('o8', 'EXPIRED', 600, 60),
      mk('o9', 'CANCELLED', 700, 70),
      mk('o10', 'REVERSED', 800, 80),
    ];

    const summary = (service as any).getSummary(sample);
    assert.equal(summary.totalOrdersCount, 10);
    assert.equal(summary.settledCount, 2);
    assert.equal(summary.pendingCount, 3, 'pendingCount must equal OPEN + AWAITING + PROCESSING');
    assert.equal(summary.underpaidCount, 1);
    assert.equal(summary.failedCount, 1);
    assert.equal(summary.expiredCount, 1);
    assert.equal(summary.cancelledCount, 1);
    assert.equal(summary.reversedCount, 1);
    assert.equal(Number(summary.totalVolumeUsd.toFixed(2)), 1306.98, 'totalVolumeUsd must sum ONLY SETTLED orders');
    assert.equal(summary.totalThSold, 112, 'totalThSold must sum ONLY SETTLED orders');
  });

  it('5. Hardens PackagePaymentsView.tsx: no CONFIRMED, no manual settle modal, has Re-verificar On-Chain & Paid — Minero Activo', () => {
    const viewSrc = readSource('src/components/admin/PackagePaymentsView.tsx');
    for (const forbidden of [
      "'CONFIRMED'",
      '"CONFIRMED"',
      'settleModalItem',
      'handleConfirmSettle',
      'manualTxHash',
      'confirmAndSettlePayment',
      'BRIDGE_SPEI',
    ]) {
      assert.equal(viewSrc.includes(forbidden), false, `PackagePaymentsView.tsx must not contain ${forbidden}`);
    }
    assert.ok(viewSrc.includes('Paid — Minero Activo'), 'PackagePaymentsView.tsx must label SETTLED as Paid — Minero Activo');
    assert.ok(viewSrc.includes('Re-verificar On-Chain'), 'PackagePaymentsView.tsx must expose Re-verificar On-Chain action');
    assert.ok(viewSrc.includes('reverifyPaymentOnChain'), 'PackagePaymentsView.tsx must call reverifyPaymentOnChain');
    assert.ok(viewSrc.includes('TESTNET'), 'PackagePaymentsView.tsx must display TESTNET/MAINNET badge');
  });

  it('6. Makes AdminOverview.tsx reactive via subscribeToFirestorePayments and adds traceability to ContractsAllocationView.tsx', () => {
    const overviewSrc = readSource('src/components/admin/AdminOverview.tsx');
    assert.equal(
      overviewSrc.includes('useState(paymentsService.getSummary())'),
      false,
      'AdminOverview.tsx must not use static useState(paymentsService.getSummary())',
    );
    assert.ok(overviewSrc.includes('subscribeToFirestorePayments'), 'AdminOverview.tsx must subscribe reactively to payments');
    assert.ok(overviewSrc.includes('fetchFirestorePayments'), 'AdminOverview.tsx must fetch Firestore payments');

    const contractsViewSrc = readSource('src/components/admin/ContractsAllocationView.tsx');
    assert.ok(contractsViewSrc.includes('orderId'), 'ContractsAllocationView.tsx must display orderId traceability');
    assert.ok(contractsViewSrc.includes('activatedMinerId'), 'ContractsAllocationView.tsx must display activatedMinerId traceability');
    assert.match(contractsViewSrc, /async\s*\(\s*contractId/, 'ContractsAllocationView.tsx handlers must be async');
    assert.equal(
      contractsViewSrc.includes('}, [backedCapacity])'),
      false,
      'ContractsAllocationView.tsx must not re-subscribe Firestore when backedCapacity changes',
    );
  });

  it('7. Invokes confirmPaymentIntent payload cleanly in reverifyPaymentOnChain (with optional txHash and empty intentId guard)', async () => {
    const service = paymentsModule.PackagePaymentsService.getInstance();
    const calls: Array<{ intentId: string; txHash?: string }> = [];
    const mockCallable = async (payload: { intentId: string; txHash?: string }) => {
      calls.push(payload);
      return {
        data: {
          outcome: 'SETTLED',
          status: 'SETTLED' as const,
          intentId: payload.intentId,
          confirmations: 15,
          requiredConfirmations: 15,
        },
      };
    };

    await assert.rejects(
      () => service.reverifyPaymentOnChain('   ', undefined, mockCallable),
      /intentId/i,
    );

    const resWithoutHash = await service.reverifyPaymentOnChain('pi_admin_1', undefined, mockCallable);
    assert.equal(resWithoutHash.outcome, 'SETTLED');
    assert.deepEqual(calls[0], { intentId: 'pi_admin_1' });

    await service.reverifyPaymentOnChain('pi_admin_2', ' 0xdeadbeef ', mockCallable);
    assert.deepEqual(calls[1], { intentId: 'pi_admin_2', txHash: '0xdeadbeef' });
  });
});
