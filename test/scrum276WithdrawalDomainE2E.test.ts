import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WITHDRAWAL_ASSET,
  MICRO_USDT_SCALE,
  MIN_WITHDRAWAL_USDT,
  MIN_WITHDRAWAL_MICROS,
  USER_BALANCES_COLLECTION,
  WITHDRAWAL_REQUESTS_COLLECTION,
  FINANCIAL_LEDGER_COLLECTION,
  WITHDRAWAL_AUDIT_EVENTS_COLLECTION,
  WITHDRAWAL_NETWORKS_COLLECTION,
  WITHDRAWAL_STATUSES,
  OPEN_WITHDRAWAL_STATUSES,
  TERMINAL_WITHDRAWAL_STATUSES,
  UNLOCK_FUNDS_STATUSES,
  CANONICAL_USDT_NETWORKS,
  WITHDRAWAL_ADMIN_PERMISSIONS,
  canTransitionWithdrawalStatus,
  assertValidWithdrawalTransition,
  isTerminalWithdrawalStatus,
  isOpenWithdrawalStatus,
  doesStatusUnlockFunds,
  isStatusFrozenForFinancialEdits,
  hasWithdrawalPermission,
  resolveMembershipSlaPolicy,
  usdtToMicros,
  microsToUsdt,
  formatMicrosAsUsdt,
  validateDestinationAddress,
  validateBlockchainTxHash,
  calculateWithdrawalQuote,
  calculateMaxWithdrawableMicros,
  applyAtomicWithdrawalLock,
  applyAdminWithdrawalAction,
  type UserFinancialBalance,
} from '../src/types/withdrawal.ts';

describe('SCRUM-276 (W01): Canonical Withdrawal Domain, Indexes & Coupled E2E Lifecycle', () => {
  it('1. enforces canonical constants, collections, and 10 USDT minimum in micro-USDT', () => {
    assert.equal(WITHDRAWAL_ASSET, 'USDT');
    assert.equal(MICRO_USDT_SCALE, 1_000_000);
    assert.equal(MIN_WITHDRAWAL_USDT, 10);
    assert.equal(MIN_WITHDRAWAL_MICROS, 10_000_000);

    assert.equal(USER_BALANCES_COLLECTION, 'userBalances');
    assert.equal(WITHDRAWAL_REQUESTS_COLLECTION, 'withdrawalRequests');
    assert.equal(FINANCIAL_LEDGER_COLLECTION, 'financialLedger');
    assert.equal(WITHDRAWAL_AUDIT_EVENTS_COLLECTION, 'withdrawalAuditEvents');
    assert.equal(WITHDRAWAL_NETWORKS_COLLECTION, 'withdrawalNetworks');

    assert.equal(WITHDRAWAL_STATUSES.length, 8);
    assert.deepEqual(TERMINAL_WITHDRAWAL_STATUSES, ['COMPLETED', 'REJECTED', 'CANCELLED']);
    assert.deepEqual(UNLOCK_FUNDS_STATUSES, ['REJECTED', 'CANCELLED']);
    assert.equal(OPEN_WITHDRAWAL_STATUSES.length, 5);
  });

  it('2. converts between USDT and micro-USDT without IEEE-754 floating-point drift', () => {
    assert.equal(usdtToMicros(10), 10_000_000);
    assert.equal(usdtToMicros('18.99'), 18_990_000);
    assert.equal(usdtToMicros('0.123456'), 123_456);
    assert.equal(microsToUsdt(18_990_000), 18.99);
    assert.equal(formatMicrosAsUsdt(10_500_000, 2), '10.50');

    assert.throws(() => usdtToMicros(-5), /INVALID_USDT_AMOUNT/);
    assert.throws(() => usdtToMicros('10.1234567'), /INVALID_USDT_AMOUNT/);
    assert.throws(() => microsToUsdt(10.5), /INVALID_MICROS_INTEGER/);
  });

  it('3. enforces state transition matrix and blocks illegal transitions from terminal or broadcasted states', () => {
    assert.equal(canTransitionWithdrawalStatus('REQUESTED', 'UNDER_REVIEW'), true);
    assert.equal(canTransitionWithdrawalStatus('REQUESTED', 'APPROVED'), true);
    assert.equal(canTransitionWithdrawalStatus('REQUESTED', 'REJECTED'), true);
    assert.equal(canTransitionWithdrawalStatus('REQUESTED', 'CANCELLED'), true);
    assert.equal(canTransitionWithdrawalStatus('UNDER_REVIEW', 'APPROVED'), true);
    assert.equal(canTransitionWithdrawalStatus('APPROVED', 'PROCESSING'), true);
    assert.equal(canTransitionWithdrawalStatus('PROCESSING', 'BROADCASTED'), true);
    assert.equal(canTransitionWithdrawalStatus('BROADCASTED', 'COMPLETED'), true);

    // Point of no return: BROADCASTED cannot transition to REJECTED or CANCELLED
    assert.equal(canTransitionWithdrawalStatus('BROADCASTED', 'REJECTED'), false);
    assert.equal(canTransitionWithdrawalStatus('BROADCASTED', 'CANCELLED'), false);
    assert.equal(isStatusFrozenForFinancialEdits('BROADCASTED'), true);

    // Terminal states cannot transition anywhere
    for (const term of TERMINAL_WITHDRAWAL_STATUSES) {
      assert.equal(isTerminalWithdrawalStatus(term), true);
      assert.equal(isOpenWithdrawalStatus(term), false);
      for (const next of WITHDRAWAL_STATUSES) {
        assert.equal(canTransitionWithdrawalStatus(term, next), false);
      }
    }

    assert.equal(doesStatusUnlockFunds('REJECTED'), true);
    assert.equal(doesStatusUnlockFunds('CANCELLED'), true);
    assert.equal(doesStatusUnlockFunds('COMPLETED'), false);
    assert.throws(
      () => assertValidWithdrawalTransition('REQUESTED', 'COMPLETED'),
      /INVALID_STATUS_TRANSITION/,
    );
  });

  it('4. enforces fail-closed granular RBAC permissions and SLA policies by membership tier', () => {
    assert.equal(WITHDRAWAL_ADMIN_PERMISSIONS.length, 9);
    assert.equal(hasWithdrawalPermission(undefined, 'withdrawals.read'), false);
    assert.equal(hasWithdrawalPermission([], 'withdrawals.approve'), false);
    assert.equal(hasWithdrawalPermission(['SUPER_ADMIN'], 'withdrawals.approve'), false);
    assert.equal(
      hasWithdrawalPermission(['withdrawals.read', 'withdrawals.approve'], 'withdrawals.approve'),
      true,
    );

    const noMemberSla = resolveMembershipSlaPolicy('NONE');
    assert.equal(noMemberSla.hasActiveMembership, false);
    assert.equal(noMemberSla.maxHours, 24);

    const proSla = resolveMembershipSlaPolicy('PRO');
    assert.equal(proSla.hasActiveMembership, true);
    assert.equal(proSla.minHours, 1);
    assert.equal(proSla.maxHours, 5);
  });

  it('5. validates destination addresses and blocks synthetic/random txHashes across EVM, TRON, and SOLANA', () => {
    // EVM
    assert.equal(
      validateDestinationAddress('0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'EVM').valid,
      true,
    );
    assert.equal(validateDestinationAddress('0x12345', 'EVM').valid, false);

    // TRON
    assert.equal(
      validateDestinationAddress('TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL', 'TRON').valid,
      true,
    );
    assert.equal(
      validateDestinationAddress('0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'TRON').valid,
      false,
    );

    // SOLANA
    assert.equal(
      validateDestinationAddress('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', 'SOLANA').valid,
      true,
    );

    // txHash validation: reject empty and reject short Math.random() hashes
    assert.equal(validateBlockchainTxHash('', 'EVM').valid, false);
    assert.equal(validateBlockchainTxHash('0x9a8b7c6d19283746', 'EVM').valid, false);
    assert.equal(
      validateBlockchainTxHash(
        '0x5f9d8a7b6c5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f1a',
        'EVM',
      ).valid,
      true,
    );
  });

  it('6. computes authoritative quotes and MAX withdrawable amount without exceeding availableBalanceMicros', () => {
    const bscNetwork = CANONICAL_USDT_NETWORKS.find((n) => n.id === 'usdt-bsc')!;
    const availableMicros = usdtToMicros(100); // 100 USDT

    // Below minimum (9.99 USDT)
    const belowMinQuote = calculateWithdrawalQuote(
      usdtToMicros('9.99'),
      bscNetwork,
      availableMicros,
    );
    assert.equal(belowMinQuote.meetsMinimum, false);

    // Valid 50 USDT request on BSC (0.50 USDT network fee + 1% = 0.50 USDT platform fee = 51.00 USDT total debit)
    const validQuote = calculateWithdrawalQuote(
      usdtToMicros(50),
      bscNetwork,
      availableMicros,
    );
    assert.equal(validQuote.meetsMinimum, true);
    assert.equal(validQuote.withinAvailableBalance, true);
    assert.equal(validQuote.networkFeeMicros, 500_000);
    assert.equal(validQuote.platformFeeMicros, 500_000);
    assert.equal(validQuote.totalDebitMicros, 51_000_000);
    assert.equal(validQuote.netAmountMicros, 50_000_000);

    // MAX quote for 100 USDT on BSC
    const maxQuote = calculateMaxWithdrawableMicros(availableMicros, bscNetwork);
    assert.equal(maxQuote.withinAvailableBalance, true);
    assert.equal(maxQuote.meetsMinimum, true);
    assert.ok(maxQuote.totalDebitMicros <= availableMicros);
    // Adding 1 micro-USDT more to requestedAmount would exceed availableBalanceMicros or equal boundary
    assert.ok(availableMicros - maxQuote.totalDebitMicros <= 2);
  });

  it('7. E2E COUPLED LIFECYCLE (Happy Path): Quote -> Atomic Lock -> Review -> Edit -> Approve -> Process -> Broadcast -> Complete', () => {
    const bscNetwork = CANONICAL_USDT_NETWORKS.find((n) => n.id === 'usdt-bsc')!;
    const initialBalance: UserFinancialBalance = {
      uid: 'user-pouw-001',
      email: 'miner@pouw.io',
      membershipTier: 'PRO',
      availableBalanceMicros: usdtToMicros(100), // 100.00 USDT
      lockedBalanceMicros: 0,
      totalWithdrawnMicros: 0,
      version: 1,
      updatedAt: '2026-11-18T01:00:00.000Z',
    };

    // Step 1: Client submits withdrawal request for 50 USDT -> Server executes Atomic Lock
    const lockResult = applyAtomicWithdrawalLock(
      initialBalance,
      {
        networkId: bscNetwork.id,
        destinationAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
        requestedAmountMicros: usdtToMicros(50),
        idempotencyKey: 'idem-user-pouw-001-req-01',
      },
      bscNetwork,
      {
        withdrawalId: 'wth-e2e-001',
        ledgerEntryId: 'led-lock-001',
        auditEventId: 'aud-create-001',
        nowIso: '2026-11-18T01:01:00.000Z',
      },
    );

    assert.equal(lockResult.withdrawalRequest.status, 'REQUESTED');
    assert.equal(lockResult.updatedBalance.availableBalanceMicros, 49_000_000);
    assert.equal(lockResult.updatedBalance.lockedBalanceMicros, 51_000_000);
    assert.equal(lockResult.syncedUserBalanceUsdt, 49);
    assert.equal(lockResult.ledgerEntry.type, 'WITHDRAWAL_LOCK');
    assert.equal(lockResult.ledgerEntry.direction, 'DEBIT');
    assert.equal(lockResult.ledgerEntry.balanceBeforeMicros, 100_000_000);
    assert.equal(lockResult.ledgerEntry.balanceAfterMicros, 49_000_000);

    const adminPerms = [...WITHDRAWAL_ADMIN_PERMISSIONS];

    // Step 2: Admin starts review (REQUESTED -> UNDER_REVIEW)
    const reviewStep = applyAdminWithdrawalAction(
      lockResult.withdrawalRequest,
      lockResult.updatedBalance,
      { action: 'REVIEW', dto: { expectedStatus: 'REQUESTED', reason: 'KYC y origen de saldo verificados' } },
      {
        operatorUid: 'admin-01',
        operatorEmail: 'finance@pouw.io',
        grantedPermissions: adminPerms,
        auditEventId: 'aud-review-001',
        nowIso: '2026-11-18T01:02:00.000Z',
      },
    );
    assert.equal(reviewStep.withdrawalRequest.status, 'UNDER_REVIEW');
    assert.equal(reviewStep.withdrawalRequest.reviewedBy, 'admin-01');

    // Step 3: Admin edits internalNotes before broadcast (audit trail captures diff)
    const editStep = applyAdminWithdrawalAction(
      reviewStep.withdrawalRequest,
      lockResult.updatedBalance,
      {
        action: 'EDIT',
        dto: {
          expectedStatus: 'UNDER_REVIEW',
          internalNotes: 'Verificado lote minero activo',
          reason: 'Agregar nota de verificación operativa',
        },
      },
      {
        operatorUid: 'admin-01',
        operatorEmail: 'finance@pouw.io',
        grantedPermissions: adminPerms,
        auditEventId: 'aud-edit-001',
        nowIso: '2026-11-18T01:03:00.000Z',
      },
    );
    assert.equal(editStep.withdrawalRequest.status, 'UNDER_REVIEW');
    assert.equal(editStep.withdrawalRequest.internalNotes, 'Verificado lote minero activo');
    assert.equal(editStep.auditEvent.action, 'EDIT');

    // Step 4: Admin approves (UNDER_REVIEW -> APPROVED)
    const approveStep = applyAdminWithdrawalAction(
      editStep.withdrawalRequest,
      lockResult.updatedBalance,
      { action: 'APPROVE', dto: { expectedStatus: 'UNDER_REVIEW', reason: 'Aprobado para tesorería' } },
      {
        operatorUid: 'admin-01',
        operatorEmail: 'finance@pouw.io',
        grantedPermissions: adminPerms,
        auditEventId: 'aud-approve-001',
        nowIso: '2026-11-18T01:04:00.000Z',
      },
    );
    assert.equal(approveStep.withdrawalRequest.status, 'APPROVED');

    // Step 5: Admin marks processing (APPROVED -> PROCESSING)
    const processStep = applyAdminWithdrawalAction(
      approveStep.withdrawalRequest,
      lockResult.updatedBalance,
      { action: 'PROCESS', dto: { expectedStatus: 'APPROVED', providerTransactionId: 'payout-batch-77' } },
      {
        operatorUid: 'admin-01',
        operatorEmail: 'finance@pouw.io',
        grantedPermissions: adminPerms,
        auditEventId: 'aud-process-001',
        nowIso: '2026-11-18T01:05:00.000Z',
      },
    );
    assert.equal(processStep.withdrawalRequest.status, 'PROCESSING');

    // Step 6: Admin registers real on-chain txHash (PROCESSING -> BROADCASTED)
    const realTxHash =
      '0x5f9d8a7b6c5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f1a';
    const broadcastStep = applyAdminWithdrawalAction(
      processStep.withdrawalRequest,
      lockResult.updatedBalance,
      {
        action: 'BROADCAST',
        dto: {
          expectedStatus: 'PROCESSING',
          txHash: realTxHash,
          confirmations: 3,
        },
      },
      {
        operatorUid: 'admin-01',
        operatorEmail: 'finance@pouw.io',
        grantedPermissions: adminPerms,
        auditEventId: 'aud-broadcast-001',
        nowIso: '2026-11-18T01:06:00.000Z',
      },
    );
    assert.equal(broadcastStep.withdrawalRequest.status, 'BROADCASTED');
    assert.equal(broadcastStep.withdrawalRequest.txHash, realTxHash);
    assert.equal(broadcastStep.withdrawalRequest.confirmations, 3);

    // Step 7: Verify post-broadcast immutability (EDIT must be rejected in BROADCASTED)
    assert.throws(
      () =>
        applyAdminWithdrawalAction(
          broadcastStep.withdrawalRequest,
          lockResult.updatedBalance,
          {
            action: 'EDIT',
            dto: {
              expectedStatus: 'BROADCASTED',
              destinationAddress: '0x000000000000000000000000000000000000dead',
              reason: 'Intento de cambio post-broadcast',
            },
          },
          {
            operatorUid: 'admin-01',
            operatorEmail: 'finance@pouw.io',
            grantedPermissions: adminPerms,
            auditEventId: 'aud-edit-fail',
            nowIso: '2026-11-18T01:06:30.000Z',
          },
        ),
      /IMMUTABLE_BROADCASTED_WITHDRAWAL/,
    );

    // Step 8: Verify COMPLETE is blocked when confirmations < requiredConfirmations (15 for BSC)
    assert.throws(
      () =>
        applyAdminWithdrawalAction(
          broadcastStep.withdrawalRequest,
          lockResult.updatedBalance,
          {
            action: 'COMPLETE',
            dto: { expectedStatus: 'BROADCASTED', confirmations: 14 },
          },
          {
            operatorUid: 'admin-01',
            operatorEmail: 'finance@pouw.io',
            grantedPermissions: adminPerms,
            auditEventId: 'aud-complete-early',
            ledgerEntryId: 'led-settle-early',
            nowIso: '2026-11-18T01:07:00.000Z',
          },
        ),
      /INSUFFICIENT_CONFIRMATIONS/,
    );

    // Step 9: Complete settlement once confirmations >= 15
    const completeStep = applyAdminWithdrawalAction(
      broadcastStep.withdrawalRequest,
      lockResult.updatedBalance,
      {
        action: 'COMPLETE',
        dto: {
          expectedStatus: 'BROADCASTED',
          confirmations: 18,
          reason: 'Confirmaciones verificadas en BscScan (>= 15)',
        },
      },
      {
        operatorUid: 'admin-01',
        operatorEmail: 'finance@pouw.io',
        grantedPermissions: adminPerms,
        auditEventId: 'aud-complete-001',
        ledgerEntryId: 'led-settle-001',
        nowIso: '2026-11-18T01:08:00.000Z',
      },
    );

    assert.equal(completeStep.withdrawalRequest.status, 'COMPLETED');
    assert.equal(completeStep.updatedBalance!.availableBalanceMicros, 49_000_000);
    assert.equal(completeStep.updatedBalance!.lockedBalanceMicros, 0);
    assert.equal(completeStep.updatedBalance!.totalWithdrawnMicros, 50_000_000);
    assert.equal(completeStep.syncedUserBalanceUsdt, 49);
    assert.equal(completeStep.ledgerEntry!.type, 'WITHDRAWAL');
    assert.equal(completeStep.ledgerEntry!.lockedBeforeMicros, 51_000_000);
    assert.equal(completeStep.ledgerEntry!.lockedAfterMicros, 0);
  });

  it('8. E2E COUPLED LIFECYCLE (Reject & Adversarial Concurrency): Unlocks funds exactly once and prevents overdraft', () => {
    const tronNetwork = CANONICAL_USDT_NETWORKS.find((n) => n.id === 'usdt-tron')!;
    const startBalance: UserFinancialBalance = {
      uid: 'user-pouw-002',
      email: 'trader@pouw.io',
      membershipTier: 'NONE',
      availableBalanceMicros: usdtToMicros(25), // 25.00 USDT
      lockedBalanceMicros: 0,
      totalWithdrawnMicros: 0,
      version: 1,
      updatedAt: '2026-11-18T02:00:00.000Z',
    };

    // Request 20 USDT on Tron (1.00 network fee + 0.20 platform fee = 21.20 USDT totalDebit)
    const lockStep = applyAtomicWithdrawalLock(
      startBalance,
      {
        networkId: tronNetwork.id,
        destinationAddress: 'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL',
        requestedAmountMicros: usdtToMicros(20),
        idempotencyKey: 'idem-user-pouw-002-req-01',
      },
      tronNetwork,
      {
        withdrawalId: 'wth-e2e-002',
        ledgerEntryId: 'led-lock-002',
        auditEventId: 'aud-create-002',
        nowIso: '2026-11-18T02:01:00.000Z',
      },
    );

    assert.equal(lockStep.updatedBalance.availableBalanceMicros, 3_800_000); // 3.80 USDT remaining
    assert.equal(lockStep.updatedBalance.lockedBalanceMicros, 21_200_000);

    // Concurrent second request of 10 USDT must fail closed (only 3.80 USDT available)
    assert.throws(
      () =>
        applyAtomicWithdrawalLock(
          lockStep.updatedBalance,
          {
            networkId: tronNetwork.id,
            destinationAddress: 'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL',
            requestedAmountMicros: usdtToMicros(10),
            idempotencyKey: 'idem-user-pouw-002-req-02',
          },
          tronNetwork,
          {
            withdrawalId: 'wth-e2e-003',
            ledgerEntryId: 'led-lock-003',
            auditEventId: 'aud-create-003',
            nowIso: '2026-11-18T02:01:05.000Z',
          },
        ),
      /INSUFFICIENT_AVAILABLE_BALANCE/,
    );

    // Reject without reason must fail
    assert.throws(
      () =>
        applyAdminWithdrawalAction(
          lockStep.withdrawalRequest,
          lockStep.updatedBalance,
          { action: 'REJECT', dto: { expectedStatus: 'REQUESTED', rejectionReason: '   ' } },
          {
            operatorUid: 'admin-02',
            operatorEmail: 'risk@pouw.io',
            grantedPermissions: ['withdrawals.reject'],
            auditEventId: 'aud-reject-empty',
            ledgerEntryId: 'led-unlock-empty',
            nowIso: '2026-11-18T02:02:00.000Z',
          },
        ),
      /REASON_REQUIRED/,
    );

    // Valid Reject restores full 25.00 USDT to availableBalanceMicros and sets lockedBalanceMicros to 0
    const rejectStep = applyAdminWithdrawalAction(
      lockStep.withdrawalRequest,
      lockStep.updatedBalance,
      {
        action: 'REJECT',
        dto: {
          expectedStatus: 'REQUESTED',
          rejectionReason: 'Dirección reportada por usuario como incorrecta',
        },
      },
      {
        operatorUid: 'admin-02',
        operatorEmail: 'risk@pouw.io',
        grantedPermissions: ['withdrawals.reject'],
        auditEventId: 'aud-reject-002',
        ledgerEntryId: 'led-unlock-002',
        nowIso: '2026-11-18T02:03:00.000Z',
      },
    );

    assert.equal(rejectStep.withdrawalRequest.status, 'REJECTED');
    assert.equal(rejectStep.updatedBalance!.availableBalanceMicros, 25_000_000);
    assert.equal(rejectStep.updatedBalance!.lockedBalanceMicros, 0);
    assert.equal(rejectStep.syncedUserBalanceUsdt, 25);
    assert.equal(rejectStep.ledgerEntry!.type, 'WITHDRAWAL_UNLOCK');
    assert.equal(rejectStep.ledgerEntry!.direction, 'CREDIT');

    // Replay of reject must fail closed (preventing double credit)
    assert.throws(
      () =>
        applyAdminWithdrawalAction(
          rejectStep.withdrawalRequest,
          rejectStep.updatedBalance!,
          {
            action: 'REJECT',
            dto: {
              expectedStatus: 'REJECTED',
              rejectionReason: 'Intento duplicado',
            },
          },
          {
            operatorUid: 'admin-02',
            operatorEmail: 'risk@pouw.io',
            grantedPermissions: ['withdrawals.reject'],
            auditEventId: 'aud-reject-dup',
            ledgerEntryId: 'led-unlock-dup',
            nowIso: '2026-11-18T02:04:00.000Z',
          },
        ),
      /INVALID_STATUS_TRANSITION/,
    );
  });

  it('9. verifies composite Firestore indexes in firestore.indexes.json and byte-parity across isolated folders', () => {
    const indexesPath = resolve(process.cwd(), 'firestore.indexes.json');
    const rawIndexes = JSON.parse(readFileSync(indexesPath, 'utf8'));
    assert.ok(Array.isArray(rawIndexes.indexes));

    const withdrawalIndexes = rawIndexes.indexes.filter(
      (idx: any) => idx.collectionGroup === 'withdrawalRequests',
    );
    assert.ok(
      withdrawalIndexes.length >= 6,
      'Must define composite indexes for withdrawalRequests (userId+requestedAt, status+requestedAt, network+requestedAt, status+network+requestedAt, membershipTierSnapshot+requestedAt, userId+idempotencyKey)',
    );

    const ledgerIndexes = rawIndexes.indexes.filter(
      (idx: any) => idx.collectionGroup === 'financialLedger',
    );
    assert.ok(ledgerIndexes.length >= 2, 'Must define composite indexes for financialLedger');

    const auditIndexes = rawIndexes.indexes.filter(
      (idx: any) => idx.collectionGroup === 'withdrawalAuditEvents',
    );
    assert.ok(auditIndexes.length >= 1, 'Must define composite index for withdrawalAuditEvents');

    // Verify byte-for-byte identity between retiros-cliente-main and retiros-admin-backend when both exist
    const clientTypesPath = resolve(
      process.cwd(),
      '../retiros-cliente-main/src/types/withdrawal.ts',
    );
    const adminTypesPath = resolve(
      process.cwd(),
      '../retiros-admin-backend/src/types/withdrawal.ts',
    );
    if (existsSync(clientTypesPath) && existsSync(adminTypesPath)) {
      const clientBytes = readFileSync(clientTypesPath, 'utf8');
      const adminBytes = readFileSync(adminTypesPath, 'utf8');
      assert.equal(
        clientBytes,
        adminBytes,
        'src/types/withdrawal.ts MUST be byte-identical across Client and Admin/Backend isolated folders',
      );
    }
  });
});
