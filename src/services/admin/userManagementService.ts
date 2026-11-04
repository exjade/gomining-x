import { AdminAuditService } from './adminAuditService';

export interface AdminManagedUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  registeredAt: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  activeContractsCount: number;
  totalContractedTh: number;
  walletBalanceUsdt: number;
  totalPrlAccumulated: number;
  membershipPlan: string;
  lastLoginAt: string;
}

const STORAGE_USERS_KEY = 'minerx_admin_managed_users_v2';

export const INITIAL_USERS: AdminManagedUser[] = [
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
    lastLoginAt: '2026-11-04T01:00:00Z'
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
    lastLoginAt: '2026-11-03T19:45:00Z'
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
    lastLoginAt: '2026-11-03T22:15:00Z'
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
    lastLoginAt: '2026-11-02T16:30:00Z'
  }
];

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

  public getUsers(): AdminManagedUser[] {
    try {
      const raw = localStorage.getItem(STORAGE_USERS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return INITIAL_USERS;
  }

  public updateUserStatus(userId: string, newStatus: AdminManagedUser['status'], reason: string): boolean {
    const list = this.getUsers();
    const user = list.find(u => u.id === userId);
    if (!user) return false;

    const prev = user.status;
    user.status = newStatus;
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(list));

    this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'ADMIN', 'AUTH', 'UPDATE_USER_STATUS', userId, {
      previousStatus: prev,
      newStatus,
      reason
    });

    return true;
  }
}
