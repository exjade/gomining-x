import { AdminAuditService } from './adminAuditService';
import {
  fetchFirestoreAdminUsers,
  fetchFirestoreStandardUsers,
  saveFirestoreUser,
  deleteFirestoreUser,
  queryFirestoreUsers,
  subscribeToFirestoreUsers,
  seedInitialAdminUsers as seedAdminInDb,
  seedInitialStandardUsers as seedClientInDb
} from '../../utils/firebaseAuth';

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'INACTIVE' | 'BLOCKED';
export type UserSourceCollection = 'admin_users' | 'users';

export interface AdminManagedUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  registeredAt: string;
  status: UserStatus;
  activeContractsCount: number;
  totalContractedTh: number;
  walletBalanceUsdt: number;
  totalPrlAccumulated: number;
  membershipPlan: string;
  role?: string;
  lastLoginAt: string;
  sourceCollection?: UserSourceCollection;
  isPlatformAdmin?: boolean;
}

const STORAGE_USERS_KEY = 'minerx_admin_managed_users_v3';

export const INITIAL_ADMIN_USERS: AdminManagedUser[] = [
  {
    id: 'usr_roman_01',
    email: 'roman@minerx.cloud',
    username: 'roman',
    fullName: 'Roman Master Admin',
    registeredAt: '2026-10-01T00:00:00Z',
    status: 'ACTIVE',
    activeContractsCount: 1,
    totalContractedTh: 192,
    walletBalanceUsdt: 298.01,
    totalPrlAccumulated: 552.84,
    membershipPlan: 'VIP Master 365',
    role: 'SUPER_ADMIN',
    lastLoginAt: '2026-11-04T01:00:00Z',
    sourceCollection: 'admin_users',
    isPlatformAdmin: true
  },
  {
    id: 'usr_alpha_99',
    email: 'operator.alpha@minerx.cloud',
    username: 'operator_alpha',
    fullName: 'Carlos Alpha Rodriguez',
    registeredAt: '2026-10-10T14:20:00Z',
    status: 'ACTIVE',
    activeContractsCount: 1,
    totalContractedTh: 128,
    walletBalanceUsdt: 125.01,
    totalPrlAccumulated: 341.20,
    membershipPlan: 'Standard Pro',
    role: 'OPERATOR',
    lastLoginAt: '2026-11-03T19:45:00Z',
    sourceCollection: 'admin_users',
    isPlatformAdmin: true
  },
  {
    id: 'usr_beta_04',
    email: 'investor.beta@gmail.com',
    username: 'investor_beta',
    fullName: 'Elena Beta Martinez',
    registeredAt: '2026-10-20T11:10:00Z',
    status: 'ACTIVE',
    activeContractsCount: 1,
    totalContractedTh: 96,
    walletBalanceUsdt: 184.20,
    totalPrlAccumulated: 184.60,
    membershipPlan: 'Standard Pro',
    role: 'OPERATOR',
    lastLoginAt: '2026-11-03T22:15:00Z',
    sourceCollection: 'admin_users',
    isPlatformAdmin: true
  },
  {
    id: 'usr_gamma_12',
    email: 'miner.gamma@proton.me',
    username: 'miner_gamma',
    fullName: 'David Gamma Silva',
    registeredAt: '2026-10-27T08:50:00Z',
    status: 'ACTIVE',
    activeContractsCount: 1,
    totalContractedTh: 64,
    walletBalanceUsdt: 50.00,
    totalPrlAccumulated: 96.12,
    membershipPlan: 'Entry Basic',
    role: 'OPERATOR',
    lastLoginAt: '2026-11-02T16:30:00Z',
    sourceCollection: 'admin_users',
    isPlatformAdmin: true
  }
];

export const INITIAL_CLIENT_USERS: AdminManagedUser[] = [
  {
    id: 'usr_client_lucas_01',
    email: 'lucas.mining@gomining.com',
    username: 'lucas_miner',
    fullName: 'Lucas V. Mendez',
    registeredAt: '2026-10-15T10:00:00Z',
    status: 'ACTIVE',
    activeContractsCount: 3,
    totalContractedTh: 240,
    walletBalanceUsdt: 450.50,
    totalPrlAccumulated: 890.15,
    membershipPlan: 'VIP Master 365',
    role: 'CLIENT_VIP',
    lastLoginAt: '2026-11-05T18:20:00Z',
    sourceCollection: 'users',
    isPlatformAdmin: false
  },
  {
    id: 'usr_client_sofia_02',
    email: 'sofia.invest@gmail.com',
    username: 'sofia_invest',
    fullName: 'Sofia Alarcon',
    registeredAt: '2026-10-18T14:30:00Z',
    status: 'ACTIVE',
    activeContractsCount: 2,
    totalContractedTh: 144,
    walletBalanceUsdt: 210.00,
    totalPrlAccumulated: 420.30,
    membershipPlan: 'Standard Pro',
    role: 'CLIENT_PRO',
    lastLoginAt: '2026-11-04T12:00:00Z',
    sourceCollection: 'users',
    isPlatformAdmin: false
  },
  {
    id: 'usr_client_mateo_03',
    email: 'mateo.crypto@outlook.com',
    username: 'mateo_c',
    fullName: 'Mateo C. Valenzuela',
    registeredAt: '2026-10-25T09:15:00Z',
    status: 'ACTIVE',
    activeContractsCount: 1,
    totalContractedTh: 48,
    walletBalanceUsdt: 85.75,
    totalPrlAccumulated: 154.20,
    membershipPlan: 'Entry Basic',
    role: 'CLIENT_BASIC',
    lastLoginAt: '2026-11-03T20:10:00Z',
    sourceCollection: 'users',
    isPlatformAdmin: false
  },
  {
    id: 'usr_client_valeria_04',
    email: 'valeria.block@proton.me',
    username: 'valeria_b',
    fullName: 'Valeria Benitez',
    registeredAt: '2026-10-29T16:45:00Z',
    status: 'SUSPENDED',
    activeContractsCount: 0,
    totalContractedTh: 0,
    walletBalanceUsdt: 12.30,
    totalPrlAccumulated: 38.50,
    membershipPlan: 'Entry Basic',
    role: 'CLIENT_BASIC',
    lastLoginAt: '2026-10-31T11:00:00Z',
    sourceCollection: 'users',
    isPlatformAdmin: false
  }
];

export const INITIAL_USERS: AdminManagedUser[] = [
  ...INITIAL_ADMIN_USERS,
  ...INITIAL_CLIENT_USERS
];

/**
 * Robust numeric parser supporting string numbers, commas, currency signs, and fallbacks
 */
export function parseNumericValue(val: unknown, fallback: number = 0): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : fallback;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[$€£\s]/g, '').trim();
    if (!cleaned) return fallback;
    let normalized = cleaned;
    if (cleaned.includes(',') && cleaned.includes('.')) {
      if (cleaned.indexOf(',') < cleaned.indexOf('.')) {
        normalized = cleaned.replace(/,/g, '');
      } else {
        normalized = cleaned.replace(/\./g, '').replace(',', '.');
      }
    } else if (cleaned.includes(',')) {
      normalized = cleaned.replace(',', '.');
    }
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * Normalizes any raw document from Firestore `/admin_users` or `/users`
 * into a typed AdminManagedUser object.
 */
export function normalizeUserDoc(
  docData: Record<string, any>,
  source: UserSourceCollection
): AdminManagedUser {
  const id = String(docData.id || docData.uid || docData.user_id || docData._id || `usr_${Date.now()}`);
  const email = String(docData.email || 'user@minerx.cloud');
  const username = String(docData.username || docData.name || docData.displayName || email.split('@')[0] || 'usuario');
  const fullName = String(docData.fullName || docData.displayName || docData.name || username);
  const registeredAt = String(docData.registeredAt || docData.createdAt || docData.created_at || new Date().toISOString());

  let status: UserStatus = 'ACTIVE';
  const rawStatus = String(docData.status || '').toUpperCase();
  if (rawStatus === 'SUSPENDED') status = 'SUSPENDED';
  else if (rawStatus === 'INACTIVE') status = 'INACTIVE';
  else if (rawStatus === 'BLOCKED') status = 'BLOCKED';
  else status = 'ACTIVE';

  const activeContractsCount = Math.max(0, Math.round(parseNumericValue(
    docData.activeContractsCount ?? docData.contractsCount ?? docData.contracts ?? docData.active_contracts ?? docData.contracts_count
  )));

  const totalContractedTh = Math.max(0, parseNumericValue(
    docData.totalContractedTh ?? docData.hashrateTh ?? docData.powerTh ?? docData.totalTh ?? docData.hashrate ?? docData.power_th ?? docData.th
  ));

  const walletBalanceUsdt = Math.max(0, parseNumericValue(
    docData.walletBalanceUsdt ?? docData.balanceUsdt ?? docData.walletBalance ?? docData.balance ?? docData.wallet_balance ?? docData.balance_usdt
  ));

  const totalPrlAccumulated = Math.max(0, parseNumericValue(
    docData.totalPrlAccumulated ?? docData.prlAccumulated ?? docData.prlBalance ?? docData.prl ?? docData.prl_balance
  ));

  const membershipPlan = String(
    docData.membershipPlan ||
    docData.plan ||
    docData.rank ||
    docData.tier ||
    (source === 'admin_users' ? 'VIP Master 365' : 'Standard Pro')
  );

  const role = String(docData.role || (source === 'admin_users' ? 'SUPER_ADMIN' : 'CLIENT'));
  const lastLoginAt = String(docData.lastLoginAt || docData.updatedAt || docData.updated_at || registeredAt);
  const isPlatformAdmin = source === 'admin_users' || Boolean(docData.isPlatformAdmin || role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'OPERATOR');

  return {
    id,
    email,
    username,
    fullName,
    registeredAt,
    status,
    activeContractsCount,
    totalContractedTh,
    walletBalanceUsdt,
    totalPrlAccumulated,
    membershipPlan,
    role,
    lastLoginAt,
    sourceCollection: source,
    isPlatformAdmin
  };
}

export class UserManagementService {
  private static instance: UserManagementService;
  private audit = AdminAuditService.getInstance();

  private constructor() {}

  public static getInstance(): UserManagementService {
    if (!UserManagementService.instance) {
      UserManagementService.instance = new UserManagementService();
    }
    return UserManagementService.instance;
  }

  public getUsers(filterSource?: 'all' | UserSourceCollection): AdminManagedUser[] {
    let list: AdminManagedUser[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_USERS_KEY);
      if (raw) {
        list = JSON.parse(raw);
      }
    } catch {}

    if (!list || list.length === 0) {
      // Legacy fallback check
      try {
        const legacyRaw = localStorage.getItem('minerx_admin_managed_users_v2');
        if (legacyRaw) {
          const parsed: AdminManagedUser[] = JSON.parse(legacyRaw);
          list = parsed.map(u => ({ ...u, sourceCollection: u.sourceCollection || 'admin_users' }));
        }
      } catch {}
    }

    if (!list || list.length === 0) {
      list = [...INITIAL_USERS];
      try {
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(list));
      } catch {}
    }

    if (filterSource && filterSource !== 'all') {
      return list.filter(u => u.sourceCollection === filterSource);
    }
    return list;
  }

  public getUserById(userId: string): AdminManagedUser | undefined {
    return this.getUsers().find(u => u.id === userId);
  }

  public async saveUser(
    user: AdminManagedUser,
    targetCollection?: UserSourceCollection
  ): Promise<AdminManagedUser> {
    const coll: UserSourceCollection =
      targetCollection || user.sourceCollection || (user.isPlatformAdmin ? 'admin_users' : 'users');

    const finalizedUser: AdminManagedUser = {
      ...user,
      sourceCollection: coll,
      isPlatformAdmin: coll === 'admin_users' || Boolean(user.isPlatformAdmin)
    };

    const currentList = this.getUsers();
    const idx = currentList.findIndex(u => u.id === finalizedUser.id);
    const prevCollection = idx >= 0 ? currentList[idx].sourceCollection : undefined;

    if (idx >= 0) {
      currentList[idx] = finalizedUser;
    } else {
      currentList.unshift(finalizedUser);
    }

    try {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(currentList));
    } catch {}

    // Save to Firestore asynchronously
    try {
      await saveFirestoreUser(coll, finalizedUser);
      // Clean up previous collection document if moved across collections
      if (prevCollection && prevCollection !== coll) {
        await deleteFirestoreUser(prevCollection, finalizedUser.id);
      }
    } catch (err) {
      console.warn(`[UserManagementService] Could not persist user ${finalizedUser.id} to Firestore /${coll}:`, err);
    }

    this.audit.logAction(
      'admin_sys',
      'admin@minerx.cloud',
      'SUPER_ADMIN',
      'AUTH',
      'SAVE_USER',
      finalizedUser.id,
      {
        collection: coll,
        email: finalizedUser.email,
        status: finalizedUser.status,
        membershipPlan: finalizedUser.membershipPlan,
        powerTh: finalizedUser.totalContractedTh,
        walletBalanceUsdt: finalizedUser.walletBalanceUsdt
      }
    );

    return finalizedUser;
  }

  public async updateUser(
    userId: string,
    updates: Partial<AdminManagedUser>,
    reason: string = 'Modificación de usuario desde el panel'
  ): Promise<AdminManagedUser | null> {
    const list = this.getUsers();
    const existing = list.find(u => u.id === userId);
    if (!existing) return null;

    const targetCollection = (updates.sourceCollection || existing.sourceCollection || 'admin_users') as UserSourceCollection;

    const merged: AdminManagedUser = {
      ...existing,
      ...updates,
      id: existing.id,
      sourceCollection: targetCollection,
      isPlatformAdmin: targetCollection === 'admin_users' || Boolean(updates.isPlatformAdmin ?? existing.isPlatformAdmin)
    };

    const saved = await this.saveUser(merged, targetCollection);

    this.audit.logAction(
      'admin_sys',
      'admin@minerx.cloud',
      'SUPER_ADMIN',
      'AUTH',
      'UPDATE_USER',
      userId,
      {
        previous: existing,
        updates,
        reason
      }
    );

    return saved;
  }

  public async deleteUser(userId: string): Promise<boolean> {
    const list = this.getUsers();
    const existing = list.find(u => u.id === userId);
    if (!existing) return false;

    const filtered = list.filter(u => u.id !== userId);
    try {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(filtered));
    } catch {}

    const coll = existing.sourceCollection || (existing.isPlatformAdmin ? 'admin_users' : 'users');
    try {
      await deleteFirestoreUser(coll, userId);
    } catch (err) {
      console.warn(`[UserManagementService] Could not delete user ${userId} from Firestore:`, err);
    }

    this.audit.logAction(
      'admin_sys',
      'admin@minerx.cloud',
      'SUPER_ADMIN',
      'AUTH',
      'DELETE_USER',
      userId,
      {
        collection: coll,
        email: existing.email,
        fullName: existing.fullName
      }
    );

    return true;
  }

  public updateUserStatus(
    userId: string,
    newStatus: UserStatus,
    reason: string = 'Cambio de estado administrativo'
  ): boolean {
    const list = this.getUsers();
    const user = list.find(u => u.id === userId);
    if (!user) return false;

    const prev = user.status;
    user.status = newStatus;

    try {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(list));
    } catch {}

    const coll = user.sourceCollection || (user.isPlatformAdmin ? 'admin_users' : 'users');
    saveFirestoreUser(coll, user).catch(() => {});

    this.audit.logAction(
      'admin_sys',
      'admin@minerx.cloud',
      'ADMIN',
      'AUTH',
      'UPDATE_USER_STATUS',
      userId,
      {
        collection: coll,
        previousStatus: prev,
        newStatus,
        reason
      }
    );

    return true;
  }

  /**
   * Real-time subscription to both `/admin_users` and `/users` in Cloud Firestore
   */
  public subscribeToUsers(
    callback: (result: { adminUsers: AdminManagedUser[]; clientUsers: AdminManagedUser[]; all: AdminManagedUser[] }) => void
  ): () => void {
    return subscribeToFirestoreUsers(({ adminUsers, clientUsers }) => {
      const normalizedAdmins = adminUsers.map(d => normalizeUserDoc(d, 'admin_users'));
      const normalizedClients = clientUsers.map(d => normalizeUserDoc(d, 'users'));

      if (normalizedAdmins.length === 0 && normalizedClients.length === 0) {
        return;
      }

      const mergedMap = new Map<string, AdminManagedUser>();
      for (const au of normalizedAdmins) {
        mergedMap.set(au.id, au);
      }
      for (const cu of normalizedClients) {
        if (!mergedMap.has(cu.id)) {
          mergedMap.set(cu.id, cu);
        } else {
          const existing = mergedMap.get(cu.id)!;
          if (new Date(cu.lastLoginAt).getTime() > new Date(existing.lastLoginAt).getTime()) {
            mergedMap.set(cu.id, cu);
          }
        }
      }

      const local = this.getUsers();
      for (const lu of local) {
        if (!mergedMap.has(lu.id)) {
          mergedMap.set(lu.id, lu);
        }
      }

      const all = Array.from(mergedMap.values());
      try {
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(all));
      } catch {}

      callback({
        adminUsers: all.filter(u => u.sourceCollection === 'admin_users'),
        clientUsers: all.filter(u => u.sourceCollection === 'users'),
        all
      });
    });
  }

  /**
   * Directly query Firestore with compound index filters
   */
  public async queryUsers(
    collectionName: UserSourceCollection,
    filters: { status?: UserStatus; limitCount?: number } = {}
  ): Promise<AdminManagedUser[]> {
    const rawDocs = await queryFirestoreUsers(collectionName, filters);
    return rawDocs.map(d => normalizeUserDoc(d, collectionName));
  }

  public async fetchFromFirestore(): Promise<{
    adminUsers: AdminManagedUser[];
    clientUsers: AdminManagedUser[];
    all: AdminManagedUser[];
  }> {
    const [rawAdmins, rawClients] = await Promise.all([
      fetchFirestoreAdminUsers(),
      fetchFirestoreStandardUsers()
    ]);

    const adminUsers = rawAdmins.map(d => normalizeUserDoc(d, 'admin_users'));
    const clientUsers = rawClients.map(d => normalizeUserDoc(d, 'users'));

    const firestoreCombined = [...adminUsers, ...clientUsers];

    if (firestoreCombined.length > 0) {
      const mergedMap = new Map<string, AdminManagedUser>();

      for (const au of adminUsers) {
        mergedMap.set(au.id, au);
      }
      for (const cu of clientUsers) {
        if (!mergedMap.has(cu.id)) {
          mergedMap.set(cu.id, cu);
        } else {
          const existing = mergedMap.get(cu.id)!;
          if (new Date(cu.lastLoginAt).getTime() > new Date(existing.lastLoginAt).getTime()) {
            mergedMap.set(cu.id, cu);
          }
        }
      }

      // Preserve local-only accounts if any
      const local = this.getUsers();
      for (const lu of local) {
        if (!mergedMap.has(lu.id)) {
          mergedMap.set(lu.id, lu);
        }
      }

      const mergedList = Array.from(mergedMap.values());
      try {
        localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(mergedList));
      } catch {}

      return {
        adminUsers: mergedList.filter(u => u.sourceCollection === 'admin_users'),
        clientUsers: mergedList.filter(u => u.sourceCollection === 'users'),
        all: mergedList
      };
    }

    const currentLocal = this.getUsers();
    return {
      adminUsers: currentLocal.filter(u => u.sourceCollection === 'admin_users'),
      clientUsers: currentLocal.filter(u => u.sourceCollection === 'users'),
      all: currentLocal
    };
  }

    const currentLocal = this.getUsers();
    return {
      adminUsers: currentLocal.filter(u => u.sourceCollection === 'admin_users'),
      clientUsers: currentLocal.filter(u => u.sourceCollection === 'users'),
      all: currentLocal
    };
  }

  public async seedInitialAdminUsers(): Promise<number> {
    const count = await seedAdminInDb(INITIAL_ADMIN_USERS);
    await this.fetchFromFirestore();
    return count;
  }

  public async seedInitialClientUsers(): Promise<number> {
    const count = await seedClientInDb(INITIAL_CLIENT_USERS);
    await this.fetchFromFirestore();
    return count;
  }

  public async seedAll(): Promise<{ adminCount: number; clientCount: number }> {
    const [adminCount, clientCount] = await Promise.all([
      seedAdminInDb(INITIAL_ADMIN_USERS),
      seedClientInDb(INITIAL_CLIENT_USERS)
    ]);
    await this.fetchFromFirestore();
    return { adminCount, clientCount };
  }
}
