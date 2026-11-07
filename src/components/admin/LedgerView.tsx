import React, { useState } from 'react';
import { 
  ArrowDownLeft, 
  ArrowUpRight, 
  Search 
} from 'lucide-react';
import { FinancialLedgerService } from '../../services/admin/financialLedgerService';
import type { LedgerEntry } from '../../types/admin';

interface LedgerViewProps {
  isDarkTheme?: boolean;
}

export const LedgerView: React.FC<LedgerViewProps> = ({
  isDarkTheme = true
}) => {
  const ledgerService = FinancialLedgerService.getInstance();
  const [entries, setEntries] = useState<LedgerEntry[]>(ledgerService.getEntries());
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const handleApprove = (id: string) => {
    ledgerService.updateEntryStatus(id, 'CONFIRMED', 'Aprobación financiera autorizada por admin');
    setEntries(ledgerService.getEntries());
  };

  const handleReject = (id: string) => {
    ledgerService.updateEntryStatus(id, 'REJECTED', 'Rechazo de operación por discrepancia de conciliación');
    setEntries(ledgerService.getEntries());
  };

  const filteredEntries = entries.filter((e) => {
    const matchesFilter = filterType === 'ALL' || e.transactionType === filterType;
    const matchesSearch = e.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (e.userEmail && e.userEmail.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="minerx-admin-view space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
            Libro Contable & Ledger Financiero Inmutable
          </h2>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
            Registro inmutable de movimientos financieros, liquidaciones de minería y gestión de retiros.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className={`absolute left-3 top-2.5 h-4 w-4 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
            <input
              type="text"
              placeholder="Buscar ID, usuario o detalle..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-9 pr-3 py-2 admin-radius-card text-xs font-mono border ${
                isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary placeholder-slate-500' : ' admin-bg-surface admin-border admin-text-primary placeholder-slate-400'
              }`}
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={`px-3 py-2 admin-radius-card text-xs font-mono border ${
              isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
            }`}
          >
            <option value="ALL">Todos los Movimientos</option>
            <option value="DEPOSIT">Depósitos</option>
            <option value="PACKAGE_PURCHASE">Compras de Contratos</option>
            <option value="MINING_YIELD">Liquidación de Minería</option>
            <option value="WITHDRAWAL">Retiros</option>
          </select>
        </div>
      </div>

      {/* LEDGER TABLE */}
      <div
        className={`admin-card p-6 admin-radius-card border ${
          isDarkTheme
            ? ' admin-bg-surface admin-border admin-text-primary'
            : ' admin-bg-surface admin-border admin-text-primary'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-xs ${
                isDarkTheme ? ' admin-border admin-text-secondary' : ' admin-border admin-text-primary font-semibold'
              }`}>
                <th className="py-3 px-3">FECHA / ID</th>
                <th className="py-3 px-3">USUARIO</th>
                <th className="py-3 px-3">TIPO</th>
                <th className="py-3 px-3">MONTO & DIRECCIÓN</th>
                <th className="py-3 px-3">SALDO POSTERIOR</th>
                <th className="py-3 px-3">ESTADO</th>
                <th className="py-3 px-3 text-right">ACCIONES</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkTheme ? ' divide-white/5' : ' divide-slate-100'}`}>
              {filteredEntries.map((e) => {
                const isCredit = e.direction === 'CREDIT';
                return (
                  <tr key={e.id} className={`${isDarkTheme ? '' : ''}`}>
                    <td className="py-3 px-3">
                      <div className={`font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{e.id}</div>
                      <div className={`text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>{new Date(e.timestamp).toLocaleString()}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className={`font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{e.userEmail || e.userId}</div>
                      <div className={`text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>{e.description}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`admin-badge px-2 py-0.5 admin-radius-control text-xs font-semibold border ${
                        isDarkTheme ? ' admin-bg-surface admin-border admin-text-secondary' : ' admin-bg-surface admin-border admin-text-primary font-semibold'
                      }`}>
                        {e.transactionType}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold">
                      <span className={`flex items-center gap-1 ${isCredit ? ' admin-text-success' : ' admin-text-danger'}`}>
                        {isCredit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                        {isCredit ? '+' : '-'}{e.amount.toLocaleString()} {e.currency}
                      </span>
                    </td>
                    <td className={`py-3 px-3 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                      ${e.balanceAfter.toLocaleString()} {e.currency}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`admin-badge px-2 py-0.5 admin-radius-control text-xs font-semibold ${
                          e.status === 'CONFIRMED' || e.status === 'SETTLED'
                            ? ' admin-bg-success admin-text-success border admin-border-success'
                            : e.status === 'PENDING'
                            ? ' admin-bg-warning admin-text-warning border admin-border-warning'
                            : ' admin-bg-danger admin-text-danger border admin-border-danger'
                        }`}
                      >
                        {e.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      {e.status === 'PENDING' && (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleApprove(e.id)}
                            className="px-2.5 py-1 admin-radius-control admin-bg-primary admin-text-success border admin-border-success text-xs font-mono font-semibold active:scale-[0.97] cursor-pointer"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => handleReject(e.id)}
                            className="px-2.5 py-1 admin-radius-control admin-bg-danger admin-text-danger border admin-border-danger text-xs font-mono font-semibold active:scale-[0.97] cursor-pointer"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
