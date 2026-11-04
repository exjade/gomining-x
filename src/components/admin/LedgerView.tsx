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
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
            Libro Contable & Ledger Financiero Inmutable
          </h2>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Registro inmutable de movimientos financieros, liquidaciones de minería y gestión de retiros.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className={`absolute left-3 top-2.5 h-4 w-4 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              type="text"
              placeholder="Buscar ID, usuario o detalle..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-9 pr-3 py-2 rounded-2xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] ${
                isDarkTheme ? 'bg-[#0E1320] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white placeholder-slate-400'
              }`}
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className={`px-3 py-2 rounded-2xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] ${
              isDarkTheme ? 'bg-[#0E1320] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
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
        className={`p-6 rounded-3xl border transition-all ${
          isDarkTheme
            ? 'bg-[#0E1320]/80 border-white/[0.08] backdrop-blur-xl text-white'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-[11px] ${
                isDarkTheme ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-700 font-bold'
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
            <tbody className={`divide-y ${isDarkTheme ? 'divide-white/5' : 'divide-slate-100'}`}>
              {filteredEntries.map((e) => {
                const isCredit = e.direction === 'CREDIT';
                return (
                  <tr key={e.id} className={`transition-colors ${isDarkTheme ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}>
                    <td className="py-3 px-3">
                      <div className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{e.id}</div>
                      <div className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{new Date(e.timestamp).toLocaleString()}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className={`font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{e.userEmail || e.userId}</div>
                      <div className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>{e.description}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700 font-semibold'
                      }`}>
                        {e.transactionType}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold">
                      <span className={`flex items-center gap-1 ${isCredit ? 'text-[#05DF72]' : 'text-rose-500'}`}>
                        {isCredit ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                        {isCredit ? '+' : '-'}{e.amount.toLocaleString()} {e.currency}
                      </span>
                    </td>
                    <td className={`py-3 px-3 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-900'}`}>
                      ${e.balanceAfter.toLocaleString()} {e.currency}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          e.status === 'CONFIRMED' || e.status === 'SETTLED'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : e.status === 'PENDING'
                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
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
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-[11px] font-mono font-bold transition-all active:scale-[0.97] cursor-pointer"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => handleReject(e.id)}
                            className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 text-[11px] font-mono font-bold transition-all active:scale-[0.97] cursor-pointer"
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
