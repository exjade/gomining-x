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
    <div className="minerx-admin-view space-y-6 pb-12">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
            Registro Inmutable de Auditoría Administrativa
          </h2>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
            Trazabilidad completa de modificaciones a tasas, variables de mineros, asignaciones y transacciones financieras.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className={`absolute left-3 top-2.5 h-4 w-4 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
            <input
              type="text"
              placeholder="Buscar acción, actor o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`pl-9 pr-3 py-2 admin-radius-card text-xs font-mono border ${
                isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary placeholder-slate-500' : ' admin-bg-surface admin-border admin-text-primary placeholder-slate-400'
              }`}
            />
          </div>

          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className={`px-3 py-2 admin-radius-card text-xs font-mono border ${
              isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
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
            className={`p-2 admin-radius-control border cursor-pointer active:scale-[0.97] ${
              isDarkTheme ? ' admin-bg-surface admin-border admin-text-secondary' : ' admin-bg-surface admin-border admin-text-primary'
            }`}
            title="Refrescar logs"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* AUDIT LOG TABLE */}
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
                <th className="py-3 px-3">FECHA / HORA</th>
                <th className="py-3 px-3">ADMINISTRADOR</th>
                <th className="py-3 px-3">MÓDULO</th>
                <th className="py-3 px-3">ACCIÓN EJECUTADA</th>
                <th className="py-3 px-3">OBJETIVO</th>
                <th className="py-3 px-3 text-right">ESTADO</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkTheme ? ' divide-white/5' : ' divide-slate-100'}`}>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`py-8 text-center ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                    No se registran eventos de auditoría para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className={`${isDarkTheme ? '' : ''}`}>
                    <td className="py-3 px-3">
                      <div className={`font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{new Date(log.timestamp).toLocaleDateString()}</div>
                      <div className={`text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>{new Date(log.timestamp).toLocaleTimeString()}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-semibold admin-text-accent">{log.actorEmail}</div>
                      <div className={`text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Rol: {log.actorRole}</div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`admin-badge px-2 py-0.5 admin-radius-control text-xs font-semibold border ${
                        isDarkTheme ? ' admin-bg-surface admin-border admin-text-secondary' : ' admin-bg-surface admin-border admin-text-primary font-semibold'
                      }`}>
                        {log.module}
                      </span>
                    </td>
                    <td className={`py-3 px-3 font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
                      {log.action}
                    </td>
                    <td className={`py-3 px-3 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                      {log.targetId || 'N/A'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={`admin-badge px-2 py-0.5 admin-radius-control text-xs font-semibold ${
                          log.status === 'SUCCESS'
                            ? ' admin-bg-success admin-text-success border admin-border-success'
                            : ' admin-bg-danger admin-text-danger border admin-border-danger'
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
