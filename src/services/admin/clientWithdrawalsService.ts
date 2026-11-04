import type { ClientWithdrawalRequest } from '../../types/admin';
import { AdminAuditService } from './adminAuditService';
import { FinancialLedgerService } from './financialLedgerService';

const STORAGE_WITHDRAWALS_KEY = 'minerx_client_withdrawals_v2';

export const INITIAL_WITHDRAWALS: ClientWithdrawalRequest[] = [
  {
    id: 'wth_req_8921',
    createdAt: '2026-11-03T18:20:00Z',
    userId: 'usr_beta_04',
    userEmail: 'investor.beta@gmail.com',
    userName: 'Carlos Méndez',
    amount: 150.00,
    currency: 'USDT',
    network: 'TRC20',
    destinationAddress: 'TYDzpFs8XzQ3Y9aP1mXk9Vn5B3LmQ819aa',
    fee: 1.00,
    netAmount: 149.00,
    status: 'PENDING',
    riskScore: 'LOW',
    kycVerified: true,
    source: 'MINING_YIELD'
  },
  {
    id: 'wth_req_8922',
    createdAt: '2026-11-02T14:15:00Z',
    userId: 'usr_roman_01',
    userEmail: 'roman@minerx.cloud',
    userName: 'Román Martínez',
    amount: 250.00,
    currency: 'PRL',
    network: 'PEARL',
    destinationAddress: 'prl1qy7997hvd3l0628e3k4mfx5z4ptslqgww99d8v9',
    fee: 0.50,
    netAmount: 249.50,
    status: 'COMPLETED',
    txHash: '0x7a91fc3820ba982341cf98231490218390124810294812049182309182341234',
    processedAt: '2026-11-02T14:28:00Z',
    processedBy: 'admin_sys',
    riskScore: 'LOW',
    kycVerified: true,
    source: 'MINING_YIELD'
  },
  {
    id: 'wth_req_8923',
    createdAt: '2026-11-03T21:40:00Z',
    userId: 'usr_ana_02',
    userEmail: 'ana.soto@minerx.org',
    userName: 'Ana Soto',
    amount: 420.00,
    currency: 'USDT',
    network: 'ERC20',
    destinationAddress: '0x9482104912049182049182049182049182049182',
    fee: 3.50,
    netAmount: 416.50,
    status: 'PROCESSING',
    riskScore: 'LOW',
    kycVerified: true,
    source: 'REFERRAL_COMMISSIONS'
  },
  {
    id: 'wth_req_8924',
    createdAt: '2026-11-01T08:10:00Z',
    userId: 'usr_luis_03',
    userEmail: 'luis.miner@crypto.io',
    userName: 'Luis Navarro',
    amount: 0.0042,
    currency: 'BTC',
    network: 'BITCOIN',
    destinationAddress: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    fee: 0.0001,
    netAmount: 0.0041,
    status: 'COMPLETED',
    txHash: '8f9210c491823901294812049182309182309128309128309128309128309128',
    processedAt: '2026-11-01T08:45:00Z',
    processedBy: 'admin_sys',
    riskScore: 'LOW',
    kycVerified: true,
    source: 'MINING_YIELD'
  },
  {
    id: 'wth_req_8925',
    createdAt: '2026-11-04T09:12:00Z',
    userId: 'usr_diego_05',
    userEmail: 'diego.invest@valle.net',
    userName: 'Diego Ruiz',
    amount: 85.00,
    currency: 'USDT',
    network: 'SOLANA',
    destinationAddress: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK',
    fee: 0.80,
    netAmount: 84.20,
    status: 'PENDING',
    riskScore: 'LOW',
    kycVerified: true,
    source: 'REFERRAL_COMMISSIONS'
  },
  {
    id: 'wth_req_8926',
    createdAt: '2026-10-29T11:00:00Z',
    userId: 'usr_elena_06',
    userEmail: 'elena.v@quantum.tech',
    userName: 'Elena Vega',
    amount: 310.00,
    currency: 'USDT',
    network: 'TRC20',
    destinationAddress: 'TX928104912049182049182049182049182',
    fee: 1.00,
    netAmount: 309.00,
    status: 'REJECTED',
    rejectionReason: 'Falta validación de doble factor 2FA y dirección de wallet no confirmada',
    riskScore: 'MEDIUM',
    kycVerified: false,
    source: 'BALANCE'
  }
];

export class ClientWithdrawalsService {
  private static instance: ClientWithdrawalsService;
  private audit = AdminAuditService.getInstance();
  private ledger = FinancialLedgerService.getInstance();

  private constructor() {}

  public static getInstance(): ClientWithdrawalsService {
    if (!ClientWithdrawalsService.instance) {
      ClientWithdrawalsService.instance = new ClientWithdrawalsService();
    }
    return ClientWithdrawalsService.instance;
  }

  public getWithdrawals(): ClientWithdrawalRequest[] {
    try {
      const raw = localStorage.getItem(STORAGE_WITHDRAWALS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return INITIAL_WITHDRAWALS;
  }

  public approveWithdrawal(id: string, operatorUid = 'admin_sys'): boolean {
    const list = this.getWithdrawals();
    const item = list.find(w => w.id === id);
    if (!item) return false;

    item.status = 'APPROVED';
    item.processedBy = operatorUid;
    localStorage.setItem(STORAGE_WITHDRAWALS_KEY, JSON.stringify(list));

    this.audit.logAction(operatorUid, 'admin@minerx.cloud', 'FINANCE_ADMIN', 'FINANCE', 'APPROVE_WITHDRAWAL', id, {
      amount: item.amount,
      currency: item.currency,
      userId: item.userId,
      destination: item.destinationAddress
    });

    return true;
  }

  public rejectWithdrawal(id: string, reason: string, operatorUid = 'admin_sys'): boolean {
    const list = this.getWithdrawals();
    const item = list.find(w => w.id === id);
    if (!item) return false;

    item.status = 'REJECTED';
    item.rejectionReason = reason;
    item.processedBy = operatorUid;
    localStorage.setItem(STORAGE_WITHDRAWALS_KEY, JSON.stringify(list));

    this.audit.logAction(operatorUid, 'admin@minerx.cloud', 'FINANCE_ADMIN', 'FINANCE', 'REJECT_WITHDRAWAL', id, {
      amount: item.amount,
      currency: item.currency,
      userId: item.userId,
      reason
    });

    return true;
  }

  public completeWithdrawal(id: string, txHash: string, operatorUid = 'admin_sys'): boolean {
    const list = this.getWithdrawals();
    const item = list.find(w => w.id === id);
    if (!item) return false;

    item.status = 'COMPLETED';
    item.txHash = txHash;
    item.processedAt = new Date().toISOString();
    item.processedBy = operatorUid;
    localStorage.setItem(STORAGE_WITHDRAWALS_KEY, JSON.stringify(list));

    // Reflejar en el Libro Contable (Ledger)
    this.ledger.addEntry({
      userId: item.userId,
      userEmail: item.userEmail,
      transactionType: 'WITHDRAWAL',
      direction: 'DEBIT',
      amount: item.amount,
      currency: item.currency === 'PRL' ? 'PRL' : 'USDT',
      status: 'SETTLED',
      referenceId: item.id,
      description: `Retiro on-chain ${item.currency} a ${item.destinationAddress.slice(0, 8)}... (tx: ${txHash.slice(0, 10)}...)`,
      balanceAfter: 0,
      provenance: 'FINANCIAL_REALIZED'
    });

    this.audit.logAction(operatorUid, 'admin@minerx.cloud', 'FINANCE_ADMIN', 'FINANCE', 'COMPLETE_WITHDRAWAL_ONCHAIN', id, {
      amount: item.amount,
      currency: item.currency,
      txHash,
      destination: item.destinationAddress
    });

    return true;
  }

  public getSummary() {
    const list = this.getWithdrawals();
    const pendingList = list.filter(w => w.status === 'PENDING' || w.status === 'PROCESSING');
    const completedList = list.filter(w => w.status === 'COMPLETED');
    
    const pendingUsd = pendingList.reduce((acc, w) => acc + (w.currency === 'PRL' ? w.amount * 1.47 : w.currency === 'BTC' ? w.amount * 68000 : w.amount), 0);
    const totalCompletedUsd = completedList.reduce((acc, w) => acc + (w.currency === 'PRL' ? w.amount * 1.47 : w.currency === 'BTC' ? w.amount * 68000 : w.amount), 0);

    return {
      totalCount: list.length,
      pendingCount: pendingList.length,
      completedCount: completedList.length,
      rejectedCount: list.filter(w => w.status === 'REJECTED').length,
      pendingUsd,
      totalCompletedUsd
    };
  }
}
