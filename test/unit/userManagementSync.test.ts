// In-memory localStorage polyfill for Node.js test runner
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
import {
  UserManagementService,
  INITIAL_ADMIN_USERS,
  INITIAL_CLIENT_USERS,
  INITIAL_USERS,
  normalizeUserDoc,
  type AdminManagedUser
} from '../../src/services/admin/userManagementService.js';
import {
  FIRESTORE_COLLECTIONS,
  ADMIN_COLLECTIONS
} from '../../src/utils/firebaseAuth.js';
import { resolveTabFromUrl } from '../../src/utils/urlRouting.js';

describe('User Management & Firestore Collections (/admin_users and /users) Unit Tests', () => {
  const userService = UserManagementService.getInstance();

  it('exports correct Firestore collection identifiers matching Firestore rules and backend', () => {
    assert.equal(FIRESTORE_COLLECTIONS.ADMIN_USERS, 'admin_users');
    assert.equal(FIRESTORE_COLLECTIONS.USERS, 'users');
    assert.equal(ADMIN_COLLECTIONS.USERS, 'admin_users');
  });

  it('provides initial admin and client users with required structure', () => {
    assert.ok(Array.isArray(INITIAL_ADMIN_USERS));
    assert.ok(INITIAL_ADMIN_USERS.length >= 4);
    assert.ok(Array.isArray(INITIAL_CLIENT_USERS));
    assert.ok(INITIAL_CLIENT_USERS.length >= 4);
    assert.equal(INITIAL_USERS.length, INITIAL_ADMIN_USERS.length + INITIAL_CLIENT_USERS.length);

    for (const u of INITIAL_ADMIN_USERS) {
      assert.ok(u.id);
      assert.ok(u.email);
      assert.equal(u.sourceCollection, 'admin_users');
      assert.equal(u.isPlatformAdmin, true);
    }

    for (const u of INITIAL_CLIENT_USERS) {
      assert.ok(u.id);
      assert.ok(u.email);
      assert.equal(u.sourceCollection, 'users');
      assert.equal(u.isPlatformAdmin, false);
    }
  });

  it('correctly normalizes /admin_users documents from Cloud Firestore', () => {
    const rawAdminDoc = {
      uid: 'adm_firestore_99',
      email: 'chief@minerx.cloud',
      fullName: 'Chief Mining Officer',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      membershipPlan: 'VIP Master 365',
      activeContractsCount: 5,
      totalContractedTh: 640,
      walletBalanceUsdt: 1250.75,
      totalPrlAccumulated: 2400.50
    };

    const normalized = normalizeUserDoc(rawAdminDoc, 'admin_users');
    assert.equal(normalized.id, 'adm_firestore_99');
    assert.equal(normalized.email, 'chief@minerx.cloud');
    assert.equal(normalized.fullName, 'Chief Mining Officer');
    assert.equal(normalized.status, 'ACTIVE');
    assert.equal(normalized.sourceCollection, 'admin_users');
    assert.equal(normalized.isPlatformAdmin, true);
    assert.equal(normalized.activeContractsCount, 5);
    assert.equal(normalized.totalContractedTh, 640);
    assert.equal(normalized.walletBalanceUsdt, 1250.75);
  });

  it('correctly normalizes /users documents from Cloud Firestore with alternative field names', () => {
    const rawClientDoc = {
      id: 'usr_client_gomin_77',
      email: 'client77@gomining.com',
      displayName: 'Alejandro GoMining',
      rank: 'Standard Pro',
      status: 'active',
      contracts: 2,
      powerTh: 96,
      balanceUsdt: 310.20,
      prlBalance: 450.00
    };

    const normalized = normalizeUserDoc(rawClientDoc, 'users');
    assert.equal(normalized.id, 'usr_client_gomin_77');
    assert.equal(normalized.email, 'client77@gomining.com');
    assert.equal(normalized.fullName, 'Alejandro GoMining');
    assert.equal(normalized.status, 'ACTIVE');
    assert.equal(normalized.sourceCollection, 'users');
    assert.equal(normalized.isPlatformAdmin, false);
    assert.equal(normalized.membershipPlan, 'Standard Pro');
    assert.equal(normalized.activeContractsCount, 2);
    assert.equal(normalized.totalContractedTh, 96);
    assert.equal(normalized.walletBalanceUsdt, 310.20);
    assert.equal(normalized.totalPrlAccumulated, 450.00);
  });

  it('allows fetching users filtered by collection (admin_users vs users vs all)', () => {
    const allUsers = userService.getUsers('all');
    const adminUsers = userService.getUsers('admin_users');
    const clientUsers = userService.getUsers('users');

    assert.ok(allUsers.length >= 8);
    assert.ok(adminUsers.length >= 4);
    assert.ok(clientUsers.length >= 4);

    for (const au of adminUsers) {
      assert.equal(au.sourceCollection, 'admin_users');
    }
    for (const cu of clientUsers) {
      assert.equal(cu.sourceCollection, 'users');
    }
  });

  it('allows saving and modifying all editable user fields: Name, Email, Role/Rank, Contracts, Power, Balance, Status, Collection', async () => {
    const userToSave: AdminManagedUser = {
      id: 'usr_test_edit_100',
      email: 'test.operator@minerx.cloud',
      username: 'test_operator',
      fullName: 'Test Operator Renamed',
      registeredAt: new Date().toISOString(),
      status: 'SUSPENDED',
      activeContractsCount: 7,
      totalContractedTh: 896,
      walletBalanceUsdt: 4500.50,
      totalPrlAccumulated: 1200.00,
      membershipPlan: 'VIP Whales Elite',
      role: 'SUPER_ADMIN',
      lastLoginAt: new Date().toISOString(),
      sourceCollection: 'admin_users',
      isPlatformAdmin: true
    };

    const saved = await userService.saveUser(userToSave, 'admin_users');
    assert.equal(saved.id, 'usr_test_edit_100');
    assert.equal(saved.fullName, 'Test Operator Renamed');
    assert.equal(saved.email, 'test.operator@minerx.cloud');
    assert.equal(saved.membershipPlan, 'VIP Whales Elite');
    assert.equal(saved.activeContractsCount, 7);
    assert.equal(saved.totalContractedTh, 896);
    assert.equal(saved.walletBalanceUsdt, 4500.50);
    assert.equal(saved.status, 'SUSPENDED');
    assert.equal(saved.sourceCollection, 'admin_users');

    // Retrieve via getUserById
    const fetched = userService.getUserById('usr_test_edit_100');
    assert.ok(fetched);
    assert.equal(fetched.fullName, 'Test Operator Renamed');
    assert.equal(fetched.totalContractedTh, 896);
  });

  it('allows partial updating of user fields via updateUser', async () => {
    const updated = await userService.updateUser('usr_test_edit_100', {
      walletBalanceUsdt: 9999.99,
      status: 'ACTIVE',
      membershipPlan: 'Super Admin Master'
    });

    assert.ok(updated);
    assert.equal(updated.walletBalanceUsdt, 9999.99);
    assert.equal(updated.status, 'ACTIVE');
    assert.equal(updated.membershipPlan, 'Super Admin Master');
  });

  it('allows toggling user status (ACTIVE <-> SUSPENDED)', () => {
    const initialStatus = userService.getUserById('usr_roman_01')?.status || 'ACTIVE';
    const toggled = initialStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';

    const ok = userService.updateUserStatus('usr_roman_01', toggled, 'Test unit toggling');
    assert.equal(ok, true);

    const after = userService.getUserById('usr_roman_01');
    assert.equal(after?.status, toggled);

    // Revert back
    userService.updateUserStatus('usr_roman_01', initialStatus, 'Reverting');
  });

  it('correctly maps URL query params for ?tab=admin_users and ?tab=users to admin suite', () => {
    const res1 = resolveTabFromUrl('?tab=admin_users', '/');
    assert.deepEqual(res1, { tab: 'admin_users', suite: 'admin' });

    const res2 = resolveTabFromUrl('?tab=users', '/');
    assert.deepEqual(res2, { tab: 'admin_users', suite: 'admin' });

    const res3 = resolveTabFromUrl('?tab=usuarios', '/');
    assert.deepEqual(res3, { tab: 'admin_users', suite: 'admin' });

    const resPath = resolveTabFromUrl('', '/users');
    assert.deepEqual(resPath, { tab: 'admin_users', suite: 'admin' });
  });
});
