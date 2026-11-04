import React, { useState } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { AdminAuditService } from '../../services/admin/adminAuditService';
import type { AdminAuditLog } from '../../types/admin';

interface AuditLogsViewProps {
  isDarkTheme?: boolean;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({
  isDarkTheme = true
}) => {
  const auditService = AdminAuditService.getInstance();
  const [logs, setLogs] = useState<AdminAuditLog[]>(auditService.getLogs());
  const [moduleFilter, setModuleFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const handleRefresh = () => {
    setLogs(auditService.getLogs());
  };

  const filteredLogs = logs.filter((log) => {
    const matchesModule = moduleFilter === 'ALL' || log.module === moduleFilter;
    const matchesSearch = log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.actorEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (log.targetId && log.targetId.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesModule && matchesSearch;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
            Registro Inmutable de Auditoría Administrativa
          </h2>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
            Trazabilidad completa de modificaciones a tasas, variables de mineros, asignaciones y transacciones financieras.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className={`absolute left-3 top-2.5 h-4 w-4 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
            <input
              type="text"
              placeholder="Buscar acción, actor o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-9 pr-3 py-2 rounded-2xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] ${
                isDarkTheme ? 'bg-[#0E1320] border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white placeholder-slate-400'
              }`}
            />
          </div>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className={`px-3 py-2 rounded-2xl text-xs font-mono border focus:outline-none focus:border-[#05DF72] ${
              isDarkTheme ? 'bg-[#0E1320] border-white/10 text-white' : 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
            }`}
          >
            <option value="ALL">Todos los Módulos</option>
            <option value="MINING_ENGINE">MINING_ENGINE</option>
            <option value="COMMERCIAL">COMMERCIAL</option>
            <option value="ALLOCATION">ALLOCATION</option>
            <option value="FINANCE">FINANCE</option>
            <option value="AUTH">AUTH</option>
            <option value="MARKETING">MARKETING</option>
          </select>

          <button
            onClick={handleRefresh}
            className={`p-2 rounded-2xl border transition-all cursor-pointer active:scale-[0.97] ${
              isDarkTheme ? 'bg-[#0E1320] border-white/10 text-slate-300 hover:text-white' : 'bg-slate-100 border-slate-300 text-slate-700 hover:text-slate-900'
            }`}
            title="Refrescar logs"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* AUDIT LOG TABLE */}
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
                <th className="py-3 px-3">FECHA / HORA</th>
                <th className="py-3 px-3">ADMINISTRADOR</th>
                <th className="py-3 px-3">MÓDULO</th>
                <th className="py-3 px-3">ACCIÓN EJECUTADA</th>
                <th className="py-3 px-3">OBJETIVO</th>
                <th className="py-3 px-3 text-right">ESTADO</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkTheme ? 'divide-white/5' : 'divide-slate-100'}`}>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`py-8 text-center ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                    No se registran eventos de auditoría para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className={`transition-colors ${isDarkTheme ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}>
                    <td className="py-3 px-3">
                      <div className={`font-semibold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{new Date(log.timestamp).toLocaleDateString()}</div>
                      <div className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>{new Date(log.timestamp).toLocaleTimeString()}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-cyan-500">{log.actorEmail}</div>
                      <div className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>Rol: {log.actorRole}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700 font-semibold'
                      }`}>
                        {log.module}
                      </span>
                    </td>
                    <td className={`py-3 px-3 font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                      {log.action}
                    </td>
                    <td className={`py-3 px-3 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-800'}`}>
                      {log.targetId || 'N/A'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
