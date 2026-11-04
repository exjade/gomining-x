import type { LedgerEntry } from '../../types/admin';
import { AdminAuditService } from './adminAuditService';

const STORAGE_LEDGER_KEY = 'minerx_admin_financial_ledger_v2';

export const INITIAL_LEDGER_ENTRIES: LedgerEntry[] = [
  {
    id: 'tx_ledg_101',
    timestamp: '2026-10-15T12:00:00Z',
    userId: 'usr_roman_01',
    userEmail: 'roman@minerx.cloud',
    transactionType: 'DEPOSIT',
    direction: 'CREDIT',
    amount: 2500.00,
    currency: 'USDT',
    status: 'CONFIRMED',
    referenceId: 'dep_usdt_trc20_9831',
    description: 'Depósito confirmado en USDT TRC20',
    balanceAfter: 2500.00,
    provenance: 'FINANCIAL_REALIZED'
  },
  {
    id: 'tx_ledg_102',
    timestamp: '2026-10-15T12:05:00Z',
    userId: 'usr_roman_01',
    userEmail: 'roman@minerx.cloud',
    transactionType: 'PACKAGE_PURCHASE',
    direction: 'DEBIT',
    amount: 2201.99,
    currency: 'USDT',
    status: 'SETTLED',
    referenceId: 'ctr-1001',
    description: 'Compra de contrato Minero 5 Enterprise (192 TH/s)',
    balanceAfter: 298.01,
    provenance: 'FINANCIAL_REALIZED'
  },
  {
    id: 'tx_ledg_103',
    timestamp: '2026-10-18T09:30:00Z',
    userId: 'usr_alpha_99',
    userEmail: 'operator.alpha@minerx.cloud',
    transactionType: 'PACKAGE_PURCHASE',
    direction: 'DEBIT',
    amount: 1474.99,
    currency: 'USDT',
    status: 'SETTLED',
    referenceId: 'ctr-1002',
    description: 'Compra de contrato Minero 4 Master (128 TH/s)',
    balanceAfter: 125.01,
    provenance: 'FINANCIAL_REALIZED'
  },
  {
    id: 'tx_ledg_104',
    timestamp: '2026-11-01T00:00:00Z',
    userId: 'usr_roman_01',
    userEmail: 'roman@minerx.cloud',
    transactionType: 'MINING_YIELD',
    direction: 'CREDIT',
    amount: 552.84,
    currency: 'PRL',
    status: 'SETTLED',
    referenceId: 'settle_oct2026_ctr1001',
    description: 'Liquidación de producción acumulada de Octubre',
    balanceAfter: 552.84,
    provenance: 'POOL_OBSERVED'
  },
  {
    id: 'tx_ledg_105',
    timestamp: '2026-11-03T18:20:00Z',
    userId: 'usr_beta_04',
    userEmail: 'investor.beta@gmail.com',
    transactionType: 'WITHDRAWAL',
    direction: 'DEBIT',
    amount: 150.00,
    currency: 'USDT',
    status: 'PENDING',
    referenceId: 'wth_req_8921',
    description: 'Solicitud de retiro USDT BEP-20',
    balanceAfter: 184.20,
    provenance: 'FINANCIAL_REALIZED'
  }
];

export class FinancialLedgerService {
  private static instance: FinancialLedgerService;
  private audit = AdminAuditService.getInstance();

  private constructor() {}

  public static getInstance(): FinancialLedgerService {
    if (!FinancialLedgerService.instance) {
      FinancialLedgerService.instance = new FinancialLedgerService();
    }
    return FinancialLedgerService.instance;
  }

  public getEntries(): LedgerEntry[] {
    try {
      const raw = localStorage.getItem(STORAGE_LEDGER_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return INITIAL_LEDGER_ENTRIES;
  }

  public addEntry(entry: Omit<LedgerEntry, 'id' | 'timestamp'>): LedgerEntry {
    const list = this.getEntries();
    const newEntry: LedgerEntry = {
      ...entry,
      id: `tx_ledg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString()
    };
    list.unshift(newEntry);
    localStorage.setItem(STORAGE_LEDGER_KEY, JSON.stringify(list));

    this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'FINANCE_ADMIN', 'FINANCE', 'CREATE_LEDGER_ENTRY', newEntry.id, {
      type: newEntry.transactionType,
      amount: newEntry.amount,
      currency: newEntry.currency,
      userId: newEntry.userId
    });

    return newEntry;
  }

  public updateEntryStatus(entryId: string, status: LedgerEntry['status'], reason: string): boolean {
    const list = this.getEntries();
    const entry = list.find(e => e.id === entryId);
    if (!entry) return false;

    const prev = entry.status;
    entry.status = status;
    localStorage.setItem(STORAGE_LEDGER_KEY, JSON.stringify(list));

    this.audit.logAction('admin_sys', 'admin@minerx.cloud', 'FINANCE_ADMIN', 'FINANCE', 'UPDATE_TRANSACTION_STATUS', entryId, {
      previousStatus: prev,
      newStatus: status,
      reason
    });

    return true;
  }
}
