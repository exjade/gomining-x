/**
 * SCRUM-275 / SCRUM-289 / SCRUM-287 (W12)
 * Client Production Cutover Verification:
 * - Verifies complete removal of `simulateDemoWithdrawal` (`demoStore.ts` & `App.tsx`)
 * - Verifies complete removal of `executeReferralWithdrawal` (`firebase.ts` & `ReferralPage.tsx`)
 *   and `renderWithdrawalModal` duplicate withdrawal workflow
 * - Verifies `App.tsx` `/withdraw/GOMINING` routes exclusively to W02..W07 `<WithdrawalForm />` + `<WithdrawalHistoryPanel />`
 * - Verifies adjacent demo/referral/unilevel/mining functions remain intact
 * - Verifies W01..W11 immutable contract SHA-256 hashes
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..');

const BASELINE_HASHES = {
  withdrawalTs: 'B5362F9A09B8CBE9EE6DE71D7C3AAAD22EAE69054DB28E86C2E4B19792611B0E',
  firestoreRules: '3422F1E051904328C791377B6BE4DB34269AFC9AA7D3FF0E00C59677503F6C8C',
  firestoreIndexes: '39990B1AA0F47F15652DCC6AA3BE6DC844C78EE4D1D9C9A86925F28CEBE33E9D',
};

function readSrc(relPath: string): string {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
}

describe('SCRUM-287 (W12): Client Production Cutover — Single Authoritative Withdrawal Path', () => {
  it('elimina simulateDemoWithdrawal de demoStore.ts y App.tsx preservando otras funciones demo', () => {
    const demoStoreSrc = readSrc('src/demoStore.ts');
    const appSrc = readSrc('src/App.tsx');

    assert.equal(demoStoreSrc.includes('simulateDemoWithdrawal'), false);
    assert.equal(appSrc.includes('simulateDemoWithdrawal'), false);

    // Adjacent non-withdrawal helpers preserved
    assert.ok(demoStoreSrc.includes('export function simulateDemoPresale'));
    assert.ok(demoStoreSrc.includes('export function addDemoBalance'));
    assert.ok(demoStoreSrc.includes('export function getDemoMiningPower'));
  });

  it('elimina executeReferralWithdrawal y renderWithdrawalModal de firebase.ts y ReferralPage.tsx sin romper referidos/unilevel', () => {
    const firebaseSrc = readSrc('src/firebase.ts');
    const referralSrc = readSrc('src/ReferralPage.tsx');

    assert.equal(firebaseSrc.includes('executeReferralWithdrawal'), false);
    assert.equal(referralSrc.includes('executeReferralWithdrawal'), false);
    assert.equal(referralSrc.includes('renderWithdrawalModal'), false);
    assert.equal(referralSrc.includes('handleExecuteWithdrawal'), false);
    assert.equal(referralSrc.includes('withdrawalModalOpen'), false);

    // ReferralPage redirects solely to unified route
    assert.ok(referralSrc.includes('to="/withdraw/GOMINING"'));
    assert.ok(referralSrc.includes('referral-unified-withdraw-link'));

    // Adjacent referral / unilevel functions preserved
    assert.ok(firebaseSrc.includes('export async function getReferralAccount'));
    assert.ok(firebaseSrc.includes('export async function getReferralTransactions'));
    assert.ok(firebaseSrc.includes('export async function getUnilevelAccount'));
    assert.ok(firebaseSrc.includes('export async function assignSponsorToUser'));
  });

  it('cablea /withdraw/GOMINING exclusivamente a <WithdrawalForm /> (W05) + <WithdrawalHistoryPanel /> (W07)', () => {
    const appSrc = readSrc('src/App.tsx');

    assert.ok(appSrc.includes("from './components/withdrawals/WithdrawalForm'"));
    assert.ok(appSrc.includes("from './components/withdrawals/WithdrawalHistoryPanel'"));
    assert.ok(appSrc.includes('<WithdrawalForm'));
    assert.ok(appSrc.includes('<WithdrawalHistoryPanel'));
    assert.ok(appSrc.includes('AuthorizedWithdrawalView'));
    assert.equal(appSrc.includes('Registrar solicitud local'), false);
  });

  it('mantiene intactos los hashes SHA-256 congelados de W01..W11', () => {
    const sha = (relPath: string) =>
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(projectRoot, relPath)))
        .digest('hex')
        .toUpperCase();

    assert.equal(sha('src/types/withdrawal.ts'), BASELINE_HASHES.withdrawalTs);
    assert.equal(sha('firestore.rules'), BASELINE_HASHES.firestoreRules);
    assert.equal(sha('firestore.indexes.json'), BASELINE_HASHES.firestoreIndexes);
  });
});
