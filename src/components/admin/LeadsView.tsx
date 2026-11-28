import React, { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  RefreshCw,
  Search,
  Send,
  CheckCircle2,
  Clock,
  Users,
  ShoppingBag,
  Sliders,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../../utils/apiConfig';

export type LeadFunnelStatus = 'registering' | 'configuring' | 'paying' | 'purchased';

export interface AdminLeadRecord {
  id: string;
  name: string;
  email: string;
  date: string;
  status: LeadFunnelStatus;
  allowsCommunication: boolean;
  source: string;
  powerTh?: number;
  priceUsd?: number;
  designSlug?: string;
  recoveryEmailStatus: 'NONE' | 'SCHEDULED' | 'SENT' | 'CANCELLED_PURCHASED';
  recoveryEmailSubject?: string;
  updatedAt: string;
}

interface LeadsSummary {
  total: number;
  registering: number;
  configuring: number;
  paying: number;
  purchased: number;
  recoveryScheduled: number;
  recoverySent: number;
}

interface LeadsViewProps {
  isDarkTheme?: boolean;
}

const STATUS_META: Record<
  LeadFunnelStatus,
  { label: string; darkClass: string; lightClass: string }
> = {
  registering: {
    label: 'Registrando',
    darkClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
    lightClass: 'bg-sky-50 text-sky-700 border-sky-200',
  },
  configuring: {
    label: 'Configurando',
    darkClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    lightClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  paying: {
    label: 'En pago',
    darkClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
    lightClass: 'bg-teal-50 text-teal-700 border-teal-200',
  },
  purchased: {
    label: 'Comprado',
    darkClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    lightClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
};

export const LeadsView: React.FC<LeadsViewProps> = ({ isDarkTheme = true }) => {
  const [leads, setLeads] = useState<AdminLeadRecord[]>([]);
  const [summary, setSummary] = useState<LeadsSummary>({
    total: 0,
    registering: 0,
    configuring: 0,
    paying: 0,
    purchased: 0,
    recoveryScheduled: 0,
    recoverySent: 0,
  });
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [dispatching, setDispatching] = useState<boolean>(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      const query = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch(`/api/admin/leads${query}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      if (data.summary) setSummary(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los leads.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const handleProcessRecovery = async () => {
    setDispatching(true);
    setNotice(null);
    setError(null);
    try {
      const res = await apiFetch('/api/admin/leads/process-recovery', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setNotice(
        data.dispatchedCount > 0
          ? `Se enviaron ${data.dispatchedCount} correos de recuperación ("Termina de configurar tu miner y págalo").`
          : 'No hay correos de recuperación pendientes por enviar.',
      );
      await fetchLeads();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar correos de recuperación.');
    } finally {
      setDispatching(false);
    }
  };

  const cardBg = isDarkTheme
    ? 'bg-slate-900/80 border-slate-800 text-slate-100'
    : 'bg-white border-slate-200 text-slate-900 shadow-xs';
  const mutedText = isDarkTheme ? 'text-slate-400' : 'text-slate-500';
  const dividerBorder = isDarkTheme ? 'border-slate-800/70' : 'border-slate-200';
  const bodyDivider = isDarkTheme ? 'divide-slate-800/50' : 'divide-slate-100';
  const rowHover = isDarkTheme ? 'hover:bg-white/[0.025]' : 'hover:bg-slate-50/80';

  return (
    <div className="space-y-6" data-testid="admin-leads-view">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <Mail className="w-6 h-6 text-emerald-500" />
            <span>Leads · Embudo Regla B</span>
          </h2>
          <p className={`text-sm mt-1 ${mutedText}`}>
            Compradores y registros que dejaron su email con permiso explícito de comunicación (SCRUM-336).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            data-testid="leads-recovery-btn"
            onClick={handleProcessRecovery}
            disabled={dispatching}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-[background-color,transform,opacity] duration-150 active:scale-[0.97] cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{dispatching ? 'Procesando...' : `Enviar recuperación (${summary.recoveryScheduled})`}</span>
          </button>
          <button
            type="button"
            data-testid="leads-refresh-btn"
            onClick={() => void fetchLeads()}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-medium transition-[background-color,border-color,transform] duration-150 active:scale-[0.97] cursor-pointer ${
              isDarkTheme
                ? 'border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" data-testid="leads-kpi-strip">
        <div className={`p-4 rounded-2xl border ${cardBg}`}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={mutedText}>Total Leads</span>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono" data-testid="leads-kpi-total">{summary.total}</div>
        </div>
        <div className={`p-4 rounded-2xl border ${cardBg}`}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={mutedText}>Registrando</span>
            <Clock className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-bold font-mono" data-testid="leads-kpi-registering">{summary.registering}</div>
        </div>
        <div className={`p-4 rounded-2xl border ${cardBg}`}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={mutedText}>Configurando</span>
            <Sliders className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold font-mono" data-testid="leads-kpi-configuring">{summary.configuring}</div>
        </div>
        <div className={`p-4 rounded-2xl border ${cardBg}`}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={mutedText}>En pago</span>
            <ShoppingBag className="w-4 h-4 text-teal-500" />
          </div>
          <div className="text-2xl font-bold font-mono" data-testid="leads-kpi-paying">{summary.paying}</div>
        </div>
        <div className={`p-4 rounded-2xl border ${cardBg}`}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={mutedText}>Comprados</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold font-mono" data-testid="leads-kpi-purchased">{summary.purchased}</div>
        </div>
      </div>

      {notice && (
        <div
          role="status"
          className={`p-3 rounded-xl border text-xs ${
            isDarkTheme
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {notice}
        </div>
      )}
      {error && (
        <div
          role="alert"
          data-testid="leads-error-alert"
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            isDarkTheme
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filters & Table */}
      <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
        <div className={`p-4 border-b ${dividerBorder} flex flex-wrap items-center justify-between gap-3`}>
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              data-testid="leads-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nombre o email..."
              className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none transition-[border-color] duration-150 ${
                isDarkTheme
                  ? 'bg-slate-950/70 border-slate-700 text-white placeholder:text-slate-500 focus:border-emerald-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500'
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(['all', 'registering', 'configuring', 'paying', 'purchased'] as const).map((st) => (
              <button
                key={st}
                type="button"
                data-testid={`leads-filter-${st}`}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-[background-color,color,transform] duration-150 active:scale-[0.97] cursor-pointer ${
                  statusFilter === st
                    ? 'bg-emerald-500 text-slate-950 font-semibold'
                    : isDarkTheme
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {st === 'all' ? 'Todos' : STATUS_META[st].label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs" data-testid="leads-table">
            <thead>
              <tr className={`border-b ${dividerBorder} uppercase text-[10px] tracking-wider ${mutedText}`}>
                <th className="py-3 px-4">Nombre</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Fecha</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Miner</th>
                <th className="py-3 px-4">Consentimiento</th>
                <th className="py-3 px-4">Email Recuperación</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${bodyDivider}`}>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={7} className={`py-10 px-4 text-center ${mutedText}`}>
                    {loading
                      ? 'Cargando leads...'
                      : 'Aún no hay leads capturados con consentimiento de comunicación.'}
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const meta = STATUS_META[lead.status] || STATUS_META.registering;
                  const badgeClass = isDarkTheme ? meta.darkClass : meta.lightClass;
                  const formattedDate = new Date(lead.date).toLocaleString('es-MX', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });
                  return (
                    <tr
                      key={lead.id}
                      data-testid="lead-row"
                      data-lead-email={lead.email}
                      data-lead-status={lead.status}
                      className={`${rowHover} transition-colors duration-150`}
                    >
                      <td className="py-3 px-4 font-semibold">{lead.name}</td>
                      <td className="py-3 px-4 font-mono">{lead.email}</td>
                      <td className={`py-3 px-4 font-mono ${mutedText}`}>{formattedDate}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${badgeClass}`}>
                          {meta.label} ({lead.status})
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        {lead.powerTh ? `${lead.powerTh} TH` : '—'}
                        {lead.priceUsd ? ` · $${lead.priceUsd.toFixed(2)}` : ''}
                      </td>
                      <td className="py-3 px-4">
                        {lead.allowsCommunication ? (
                          <span
                            className={`inline-flex items-center gap-1 font-medium ${
                              isDarkTheme ? 'text-emerald-400' : 'text-emerald-700'
                            }`}
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Opt-in (Regla B)</span>
                          </span>
                        ) : (
                          <span className={mutedText}>Sin permiso</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {lead.recoveryEmailStatus === 'SCHEDULED' && (
                          <span className={`font-medium ${isDarkTheme ? 'text-amber-400' : 'text-amber-700'}`}>
                            Programado (SCHEDULED)
                          </span>
                        )}
                        {lead.recoveryEmailStatus === 'SENT' && (
                          <span className={`font-medium ${isDarkTheme ? 'text-emerald-400' : 'text-emerald-700'}`}>
                            Enviado (SENT)
                          </span>
                        )}
                        {lead.recoveryEmailStatus === 'CANCELLED_PURCHASED' && (
                          <span className={mutedText}>Cancelado (compró)</span>
                        )}
                        {lead.recoveryEmailStatus === 'NONE' && (
                          <span className={mutedText}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
