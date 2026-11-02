import React, { useState, useEffect } from 'react';
import { 
  Layers, 
  Key, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Send,
  Edit3,
  ExternalLink,
  Bot,
  Activity,
  Server,
  ShieldCheck,
  Users,
  Database,
  Wrench
} from 'lucide-react';
import type { SaladAccountConfig, KryptexConfig, AppSettings } from '../types/minerx';
import { sendTelegramMessageResilient } from '../utils/notifications';
import { apiFetch } from '../utils/apiConfig';
import { auditLocalUsers, repairLocalUsers } from '../utils/localAuthService';

interface ApiManagerTabProps {
  isDarkTheme?: boolean;
  accounts: SaladAccountConfig[];
  onAddAccount: (acc: Omit<SaladAccountConfig, 'id' | 'status'>) => void;
  onUpdateAccount?: (acc: SaladAccountConfig) => void;
  onDeleteAccount: (id: string) => void;
  onToggleAccount: (id: string) => void;
  kryptexConfig: KryptexConfig;
  onUpdateKryptexConfig: (cfg: Partial<KryptexConfig>) => void;
  settings: AppSettings;
  onUpdateSettings: (settings: Partial<AppSettings>) => void;
  onTestSaladAccount: (acc: SaladAccountConfig) => Promise<{ success: boolean; message: string }>;
  onTestKryptex: () => Promise<{ success: boolean; message: string }>;
  onTestWebhook?: () => Promise<{ success: boolean; message: string }>;
}

export const ApiManagerTab: React.FC<ApiManagerTabProps> = ({
  isDarkTheme = true,
  accounts,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onToggleAccount,
  kryptexConfig,
  onUpdateKryptexConfig,
  settings,
  onUpdateSettings,
  onTestSaladAccount,
  onTestKryptex
}) => {
  const isLight = !isDarkTheme;
  // New account form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAccName, setNewAccName] = useState('');
  const [newOrgName, setNewOrgName] = useState('');
  const [newProjName, setNewProjName] = useState('default');
  const [newApiKey, setNewApiKey] = useState('');
  const [newBalance, setNewBalance] = useState('');

  // Edit existing account state
  const [editingAcc, setEditingAcc] = useState<SaladAccountConfig | null>(null);

  // Status message state
  const [testingAccId, setTestingAccId] = useState<string | null>(null);
  const [testingKryptex, setTestingKryptex] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Vast.ai API configuration state
  const [vastApiKeyInput, setVastApiKeyInput] = useState('');
  const [isEditingVastKey, setIsEditingVastKey] = useState(false);
  const [testingVast, setTestingVast] = useState(false);
  const [vastConfig, setVastConfig] = useState<{
    enabled: boolean;
    hasKey: boolean;
    maskedKey: string;
    balanceUSD: number;
    status: string;
    lastTested?: string;
  }>({
    enabled: false,
    hasKey: false,
    maskedKey: 'No configurada',
    balanceUSD: 0,
    status: 'untested'
  });

  const fetchVastConfig = async () => {
    try {
      const res = await apiFetch('/api/vast/config');
      if (res.ok) {
        const data = await res.json();
        setVastConfig(data);
      }
    } catch {}
  };

  // Firebase Auth & Registration Audit state
  const [auditLoading, setAuditLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [auditData, setAuditData] = useState<{
    summary: {
      totalUsers: number;
      synchronizedCount: number;
      missingInAuthCount: number;
      firebaseAuthOperational: boolean;
      firestoreOperational: boolean;
    };
    users: Array<{
      id: string;
      username: string;
      email: string;
      fullName: string;
      createdAt: string;
      firebaseAuthUid: string | null;
      inFirestore: boolean;
      inFirebaseAuth: boolean;
      status: string;
    }>;
    recentAuditLogs?: Array<{
      id: string;
      timestamp: string;
      eventType: string;
      username?: string;
      email?: string;
      status: string;
    }>;
  } | null>(null);
  const [auditFeedback, setAuditFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRunAudit = async () => {
    setAuditLoading(true);
    setAuditFeedback(null);
    try {
      const res = await apiFetch('/api/auth/audit');
      if (res.ok) {
        const data = await res.json();
        setAuditData(data);
        setAuditFeedback({
          type: 'success',
          text: `Auditoría finalizada: ${data.summary?.totalUsers || 0} usuarios analizados (${data.summary?.synchronizedCount || 0} sincronizados en Firebase Auth, ${data.summary?.missingInAuthCount || 0} pendientes).`
        });
      } else {
        const localRes = auditLocalUsers();
        setAuditData(localRes as any);
        setAuditFeedback({
          type: 'success',
          text: `Auditoría completada en almacenamiento local (${localRes.summary.totalUsers} usuarios analizados).`
        });
      }
    } catch {
      const localRes = auditLocalUsers();
      setAuditData(localRes as any);
      setAuditFeedback({
        type: 'success',
        text: `Auditoría completada en almacenamiento local (${localRes.summary.totalUsers} usuarios analizados).`
      });
    } finally {
      setAuditLoading(false);
    }
  };

  const handleRunRepair = async () => {
    setRepairLoading(true);
    setAuditFeedback(null);
    try {
      const res = await apiFetch('/api/auth/audit-repair', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAuditFeedback({
          type: 'success',
          text: data.message || `Reparación completada. ${data.repairedCount || 0} usuarios sincronizados en Firebase Authentication.`
        });
        await handleRunAudit();
      } else {
        const localRep = repairLocalUsers();
        setAuditFeedback({
          type: 'success',
          text: localRep.message
        });
        await handleRunAudit();
      }
    } catch {
      const localRep = repairLocalUsers();
      setAuditFeedback({
        type: 'success',
        text: localRep.message
      });
      await handleRunAudit();
    } finally {
      setRepairLoading(false);
    }
  };

  useEffect(() => {
    fetchVastConfig();
    handleRunAudit();
  }, []);

  const handleSaveVastApiKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!vastApiKeyInput.trim()) return;

    try {
      const res = await apiFetch('/api/vast/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: vastApiKeyInput.trim(), enabled: vastConfig.enabled })
      });
      if (res.ok) {
        setFeedbackMsg({ type: 'success', text: 'API Key de Vast.ai guardada de forma segura en el servidor.' });
        setIsEditingVastKey(false);
        setVastApiKeyInput('');
        await fetchVastConfig();
      }
    } catch {
      setFeedbackMsg({ type: 'error', text: 'Error guardando API Key de Vast.ai.' });
    }
  };

  const handleToggleVastEnabled = async () => {
    const nextState = !vastConfig.enabled;
    try {
      await apiFetch('/api/vast/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState })
      });
      setVastConfig((prev) => ({ ...prev, enabled: nextState }));
      setFeedbackMsg({
        type: 'success',
        text: nextState
          ? 'Integración de Vast.ai habilitada (Estrategias operan en modo Simulación por defecto).'
          : 'Integración de Vast.ai deshabilitada.'
      });
    } catch {}
  };

  const handleTestVastConnection = async () => {
    setTestingVast(true);
    setFeedbackMsg(null);
    try {
      const res = await apiFetch('/api/vast/test-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: vastApiKeyInput || undefined })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setFeedbackMsg({
          type: 'success',
          text: `✅ ${data.message || 'Conexión exitosa con Vast.ai'}`
        });
        await fetchVastConfig();
      } else {
        setFeedbackMsg({
          type: 'error',
          text: `❌ Error Vast.ai: ${data.message || data.error || 'Fallo de autenticación'}`
        });
      }
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: `❌ Error de red conectando con Vast.ai: ${err.message}` });
    } finally {
      setTestingVast(false);
    }
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAccName || !newOrgName || !newApiKey) {
      setFeedbackMsg({ type: 'error', text: 'Por favor completa todos los campos requeridos.' });
      return;
    }

    const cleanOrg = newOrgName.trim();
    if (cleanOrg.toLowerCase() === 'n/a' || cleanOrg.includes('/')) {
      setFeedbackMsg({
        type: 'error',
        text: 'El nombre de Organización no puede ser "N/A" ni contener barras. Escribe tu identificador de portal.salad.com/organizations/[tu-org].'
      });
      return;
    }

    onAddAccount({
      accountName: newAccName,
      organizationName: cleanOrg,
      projectName: (newProjName || 'default').trim(),
      apiKey: newApiKey.trim(),
      balanceUSD: newBalance ? Math.max(0, parseFloat(newBalance)) : 0,
      enabled: true
    });

    setNewAccName('');
    setNewOrgName('');
    setNewProjName('default');
    setNewApiKey('');
    setNewBalance('');
    setShowAddForm(false);
    setFeedbackMsg({ type: 'success', text: `Cuenta "${newAccName}" agregada exitosamente.` });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAcc) return;
    if (!editingAcc.accountName || !editingAcc.organizationName || !editingAcc.apiKey) {
      setFeedbackMsg({ type: 'error', text: 'Por favor completa todos los campos requeridos.' });
      return;
    }
    const cleanOrg = editingAcc.organizationName.trim();
    if (cleanOrg.toLowerCase() === 'n/a' || cleanOrg.includes('/')) {
      setFeedbackMsg({
        type: 'error',
        text: 'El nombre de Organización no puede ser "N/A" ni contener barras. Revisa tu URL de portal.salad.com.'
      });
      return;
    }
    if (onUpdateAccount) {
      onUpdateAccount({
        ...editingAcc,
        organizationName: cleanOrg,
        projectName: editingAcc.projectName?.trim() || 'default',
        apiKey: editingAcc.apiKey.trim(),
        balanceUSD: editingAcc.balanceUSD !== undefined ? Math.max(0, Number(editingAcc.balanceUSD)) : 0
      });
    }
    setEditingAcc(null);
    setFeedbackMsg({ type: 'success', text: `Cuenta "${editingAcc.accountName}" actualizada correctamente.` });
  };

  const handleTestSalad = async (acc: SaladAccountConfig) => {
    setTestingAccId(acc.id);
    setFeedbackMsg(null);
    const res = await onTestSaladAccount(acc);
    setTestingAccId(null);
    setFeedbackMsg({
      type: res.success ? 'success' : 'error',
      text: res.message
    });
  };

  const handleTestKryptexConnection = async () => {
    setTestingKryptex(true);
    setFeedbackMsg(null);
    const res = await onTestKryptex();
    setTestingKryptex(false);
    setFeedbackMsg({
      type: res.success ? 'success' : 'error',
      text: res.message
    });
  };

  const [sendingReport, setSendingReport] = useState(false);

  const handleDirectTestTelegram = async () => {
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      setFeedbackMsg({
        type: 'error',
        text: 'Completa primero el Bot Token y el Chat ID de Telegram para enviar la prueba.'
      });
      return;
    }
    setTestingTelegram(true);
    setFeedbackMsg(null);
    try {
      const pingMsg = `🚀 *[MinerX PRO Engine • Verificación Exitosa]*\n\n` +
        `✅ ¡Tu bot de vigilancia está 100% activo!\n` +
        `📡 *Plataforma:* Conexión activa y verificada\n` +
        `🕒 *Hora:* ${new Date().toLocaleTimeString()} (Hora Local)\n\n` +
        `_Recibirás notificaciones automáticas si alguna GPU se desconecta, baja de hashrate o si ocurren eventos de reasignación._`;

      const res = await sendTelegramMessageResilient(
        settings.telegramBotToken,
        settings.telegramChatId,
        pingMsg
      );
      setFeedbackMsg({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
    } catch (e: any) {
      setFeedbackMsg({ type: 'error', text: e.message || 'Error de conexión con Telegram' });
    } finally {
      setTestingTelegram(false);
    }
  };

  const handleSendTelegramStatus = async () => {
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      setFeedbackMsg({
        type: 'error',
        text: 'Configura primero el Bot Token y el Chat ID de Telegram.'
      });
      return;
    }
    setSendingReport(true);
    setFeedbackMsg(null);
    try {
      const reportMsg = `⚡ *[MinerX PRO • Reporte Instantáneo]*\n\n` +
        `💼 *Wallet Kryptex:* \`${kryptexConfig.walletAddress || 'Sin configurar'}\`\n` +
        `🥗 *Cuentas SaladCloud:* \`${accounts.filter(a => a.enabled).length} cuenta(s) conectadas\`\n` +
        `⏱️ *Umbral Inactividad:* \`${settings.maxShareInactivityMinutes} minutos\`\n` +
        `📉 *Umbral Potencia Mínima:* \`${settings.underperformingThresholdPct}%\`\n` +
        `💰 *Moneda Base:* \`100% USD\`\n` +
        `🕒 *Hora de Despacho:* ${new Date().toLocaleTimeString()}\n\n` +
        `_Reporte despachado bajo demanda desde la consola MinerX._`;

      const res = await sendTelegramMessageResilient(
        settings.telegramBotToken,
        settings.telegramChatId,
        reportMsg
      );
      setFeedbackMsg({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
    } catch (e: any) {
      setFeedbackMsg({ type: 'error', text: e.message || 'Error al enviar reporte a Telegram' });
    } finally {
      setSendingReport(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-8">
      {/* 1. Header & Live vs Simulation Toggle */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl p-5 border ${
        isLight 
          ? 'bg-white border-slate-200 text-slate-900 shadow-sm' 
          : 'card-cyber border-[#2A334A] text-white'
      }`}>
        <div>
          <h2 className={`font-display-title text-xl font-bold flex items-center gap-2.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            Gestión Centralizada de APIs
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-mono-num font-semibold border ${
              isLight 
                ? 'bg-cyan-50 text-cyan-800 border-cyan-200' 
                : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
            }`}>
              SaladCloud & Kryptex
            </span>
          </h2>
          <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            Conecta tus credenciales de SaladCloud y tu wallet de Kryptex para monitorear tu cluster en tiempo real
          </p>
        </div>

        {/* Global Live FinTech Mode Indicator */}
        <div className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2 self-start sm:self-auto border ${
          isLight 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : 'bg-emerald-500/10 border-emerald-500/30'
        }`}>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
          </span>
          <div className="text-left">
            <span className={`text-[11px] font-bold block ${isLight ? 'text-emerald-800' : 'text-emerald-300'}`}>100% Datos en Vivo</span>
            <span className={`text-[10px] font-mono-num ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Sin simulación • Kryptex & Salad Real</span>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`rounded-xl p-3 text-xs font-mono-num flex items-center gap-2 border animate-in fade-in duration-200 ${
            feedbackMsg.type === 'success'
              ? isLight ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : isLight ? 'bg-rose-50 border-rose-300 text-rose-800' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className={`h-4 w-4 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
          ) : (
            <AlertCircle className={`h-4 w-4 shrink-0 ${isLight ? 'text-rose-600' : 'text-rose-400'}`} />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* 2. SALADCLOUD MULTI-ACCOUNT SECTION */}
      <div className={`rounded-2xl p-5 border space-y-4 ${
        isLight 
          ? 'bg-white border-slate-200 text-slate-900 shadow-sm' 
          : 'card-cyber border-[#1E2433] text-white'
      }`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
          isLight ? 'border-slate-200' : 'border-[#1E2433]'
        }`}>
          <div>
            <h3 className={`font-display-title text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <Layers className={`h-5 w-5 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`} />
              Cuentas de SaladCloud ({accounts.length})
            </h3>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Vigila todas tus GPUs alquiladas en tiempo real y gestiona la asignación de contenedores
            </p>
          </div>

          <button
            onClick={() => {
              setEditingAcc(null);
              setShowAddForm(!showAddForm);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all self-start sm:self-auto cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Agregar Cuenta Salad</span>
          </button>
        </div>

        {/* Essential SaladCloud Organization Guidance Banner */}
        <div className={`rounded-xl border p-4 text-xs space-y-2 ${
          isLight 
            ? 'border-amber-200 bg-amber-50/70 text-amber-950' 
            : 'border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-[#14120B] to-[#0C0E16]'
        }`}>
          <div className={`flex items-center gap-2 font-bold ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>
            <AlertCircle className={`h-4 w-4 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
            <span>¿Por qué dio Error 400? Cómo colocar el "Organization Name" correcto:</span>
          </div>
          <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
            La API de SaladCloud requiere tu nombre de organización exacto en la URL (<code className={isLight ? 'text-cyan-800 font-bold' : 'text-cyan-300'}>/organizations/{'{org}'}/...</code>). 
            Si colocas <strong className={isLight ? 'text-rose-700' : 'text-rose-400'}>"N/A"</strong> o una barra, Salad responderá con <strong>Error 400 Bad Request</strong>.
          </p>
          <div className={`rounded-lg border p-2.5 font-mono text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
            isLight 
              ? 'bg-white border-amber-200 text-slate-800 shadow-xs' 
              : 'bg-black/50 border-white/10 text-slate-300'
          }`}>
            <div>
              <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Paso 1: Entra a </span>
              <a href="https://portal.salad.com" target="_blank" rel="noreferrer" className={`hover:underline font-bold inline-flex items-center gap-1 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
                portal.salad.com <ExternalLink className="h-3 w-3" />
              </a>
              <span className={isLight ? 'text-slate-500' : 'text-slate-500'}> y mira la barra de direcciones:</span>
              <div className={`mt-1 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                https://portal.salad.com/organizations/<span className={isLight ? 'text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded' : 'text-emerald-400 font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded'}>tu-organizacion</span>/...
              </div>
            </div>
            <div className={`text-[10px] px-2 py-1 rounded font-bold ${
              isLight 
                ? 'text-amber-800 bg-amber-100/90 border border-amber-300' 
                : 'text-amber-300 bg-amber-500/15 border border-amber-500/30'
            }`}>
              Ese texto en verde es tu Organización
            </div>
          </div>
        </div>

        {/* Edit Account Form */}
        {editingAcc && (
          <form onSubmit={handleSaveEdit} className={`rounded-xl border p-4 space-y-3 animate-in slide-in-from-top-2 duration-200 ${
            isLight ? 'border-amber-300 bg-amber-50/40' : 'border-amber-500/40 bg-[#0C0E16]'
          }`}>
            <div className="flex items-center justify-between">
              <h4 className={`font-display-title text-sm font-bold flex items-center gap-2 ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>
                <Edit3 className="h-4 w-4" />
                Editar Cuenta: {editingAcc.accountName}
              </h4>
              <span className={`text-[10px] font-mono-num ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>ID: {editingAcc.id}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Nombre Amigable:</label>
                <input
                  type="text"
                  value={editingAcc.accountName}
                  onChange={(e) => setEditingAcc({ ...editingAcc, accountName: e.target.value })}
                  placeholder="ej. Salad Cuenta 1"
                  required
                  className={`w-full rounded-lg border px-3 py-2 focus:outline-none ${
                    isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-amber-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-500 focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  Nombre de Organización (Org) <span className="text-rose-500">*No pongas N/A</span>:
                </label>
                <input
                  type="text"
                  value={editingAcc.organizationName}
                  onChange={(e) => setEditingAcc({ ...editingAcc, organizationName: e.target.value })}
                  placeholder="ej. mi-empresa-salad (mira en portal.salad.com)"
                  required
                  className={`w-full rounded-lg border px-3 py-2 focus:outline-none font-mono-num ${
                    editingAcc.organizationName.toLowerCase() === 'n/a'
                      ? 'border-rose-500 bg-rose-50 text-rose-800 focus:border-rose-600'
                      : isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-amber-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-500 focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Proyecto Salad (Project Name):</label>
                <input
                  type="text"
                  value={editingAcc.projectName}
                  onChange={(e) => setEditingAcc({ ...editingAcc, projectName: e.target.value })}
                  placeholder="default"
                  className={`w-full rounded-lg border px-3 py-2 focus:outline-none font-mono-num ${
                    isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-amber-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-500 focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Salad API Key:</label>
                <input
                  type="password"
                  value={editingAcc.apiKey}
                  onChange={(e) => setEditingAcc({ ...editingAcc, apiKey: e.target.value })}
                  placeholder="salad_live_sk_..."
                  required
                  className={`w-full rounded-lg border px-3 py-2 focus:outline-none font-mono-num ${
                    isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-amber-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-500 focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Saldo Real en Salad ($ USD):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingAcc.balanceUSD !== undefined ? editingAcc.balanceUSD : ''}
                  onChange={(e) => setEditingAcc({ ...editingAcc, balanceUSD: e.target.value ? parseFloat(e.target.value) : 0 })}
                  placeholder="0.00"
                  className={`w-full rounded-lg border px-3 py-2 focus:outline-none font-mono-num ${
                    isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-amber-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-500 focus:border-amber-500'
                  }`}
                />
              </div>
            </div>

            <div className={`flex items-center justify-end gap-2 pt-2 border-t ${isLight ? 'border-amber-200' : 'border-white/[0.06]'}`}>
              <button
                type="button"
                onClick={() => setEditingAcc(null)}
                className={`px-3.5 py-1.5 text-xs transition-colors cursor-pointer ${
                  isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                }`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors shadow-xs cursor-pointer"
              >
                Guardar Corrección
              </button>
            </div>
          </form>
        )}

        {/* Add Account Modal / Form */}
        {showAddForm && !editingAcc && (
          <form onSubmit={handleCreateAccount} className={`rounded-xl border p-4 space-y-3 animate-in slide-in-from-top-2 duration-200 ${
            isLight ? 'border-cyan-200 bg-cyan-50/30' : 'border-cyan-500/30 bg-[#0C0E16]'
          }`}>
            <h4 className={`font-display-title text-sm font-bold ${isLight ? 'text-cyan-900' : 'text-cyan-300'}`}>
              Registrar Nueva Cuenta de SaladCloud
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Nombre Amigable:</label>
                <input
                  type="text"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="ej. Salad Cuenta 1 (Principal)"
                  required
                  className={`w-full rounded-lg border px-3 py-2 focus:outline-none ${
                    isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-500 focus:border-cyan-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                  Nombre de Organización (Org) <span className="text-amber-500">*De portal.salad.com</span>:
                </label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="ej. mi-organizacion (NO 'N/A')"
                  required
                  className={`w-full rounded-lg border px-3 py-2 focus:outline-none font-mono-num ${
                    isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-500 focus:border-cyan-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Proyecto Salad (Project Name):</label>
                <input
                  type="text"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="default"
                  className={`w-full rounded-lg border px-3 py-2 focus:outline-none font-mono-num ${
                    isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-500 focus:border-cyan-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Salad API Key:</label>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="salad_live_sk_..."
                  required
                  className={`w-full rounded-lg border px-3 py-2 focus:outline-none font-mono-num ${
                    isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-500 focus:border-cyan-500'
                  }`}
                />
              </div>

              <div>
                <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Saldo Inicial en Salad ($ USD):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  placeholder="0.00"
                  className={`w-full rounded-lg border px-3 py-2 focus:outline-none font-mono-num ${
                    isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-500 focus:border-cyan-500'
                  }`}
                />
              </div>
            </div>

            <div className={`flex items-center justify-end gap-2 pt-2 border-t ${isLight ? 'border-cyan-200' : 'border-white/[0.06]'}`}>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className={`px-3.5 py-1.5 text-xs transition-colors cursor-pointer ${
                  isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-white'
                }`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition-colors shadow-xs cursor-pointer"
              >
                Guardar Cuenta
              </button>
            </div>
          </form>
        )}

        {/* Configured Accounts List */}
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className={`p-6 text-center rounded-xl border border-dashed text-xs ${
              isLight ? 'border-slate-300 bg-slate-50 text-slate-500' : 'border-white/10 text-slate-400'
            }`}>
              No tienes ninguna cuenta de SaladCloud registrada. Haz clic en <strong>Agregar Cuenta Salad</strong> arriba.
            </div>
          ) : (
            accounts.map((acc) => {
              const isInvalidOrg = !acc.organizationName || acc.organizationName.toLowerCase() === 'n/a' || acc.organizationName.includes('/');

              return (
                <div
                  key={acc.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-4 text-xs font-mono-num transition-colors ${
                    isInvalidOrg 
                      ? isLight ? 'border-rose-300 bg-rose-50 text-rose-900' : 'border-rose-500/50 bg-rose-950/15' 
                      : isLight 
                      ? 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/80 hover:border-slate-300' 
                      : 'border-[#1A202C] bg-[#0C0E16] hover:border-[#2A334A]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`h-2.5 w-2.5 rounded-full ${acc.enabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      <span className={`font-bold text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>{acc.accountName}</span>
                      
                      {isInvalidOrg ? (
                        <span className={`rounded px-2 py-0.5 text-[10px] font-bold animate-pulse ${
                          isLight 
                            ? 'bg-rose-100 text-rose-800 border border-rose-300' 
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}>
                          ⚠️ Org Inválida ("{acc.organizationName}") - Haz clic en Editar
                        </span>
                      ) : (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] border ${
                          isLight 
                            ? 'bg-slate-200 text-cyan-900 border-slate-300 font-semibold' 
                            : 'bg-[#161B26] text-cyan-300 border-[#222B3D]'
                        }`}>
                          Org: {acc.organizationName}
                        </span>
                      )}
                    </div>
                    <div className={`text-[11px] flex items-center gap-2 flex-wrap ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>
                      <span>Proyecto: <strong className={isLight ? 'text-slate-800' : 'text-slate-400'}>{acc.projectName}</strong></span>
                      <span>•</span>
                      <span>Saldo: <strong className={`font-mono ${isLight ? 'text-emerald-700 font-bold' : 'text-emerald-400'}`}>${(acc.balanceUSD ?? 0).toFixed(2)} USD</strong></span>
                      <span>•</span>
                      <span>Key: <strong className={isLight ? 'text-slate-800' : 'text-slate-400'}>{acc.apiKey ? `${acc.apiKey.substring(0, 14)}...` : 'Sin Key'}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                    <button
                      onClick={() => handleTestSalad(acc)}
                      disabled={testingAccId === acc.id}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition-all cursor-pointer ${
                        isLight 
                          ? 'border-slate-200 bg-white text-slate-700 hover:text-slate-950 hover:border-cyan-500 hover:bg-slate-50 shadow-xs' 
                          : 'border-[#202738] bg-[#121622] text-slate-300 hover:text-white hover:border-cyan-500'
                      }`}
                      title="Verificar conexión directa con la API de SaladCloud"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 text-cyan-500 ${testingAccId === acc.id ? 'animate-spin' : ''}`} />
                      <span>{testingAccId === acc.id ? 'Probando...' : 'Probar API'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setEditingAcc(acc);
                      }}
                      className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                        isLight 
                          ? 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100' 
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
                      }`}
                      title="Editar nombre de organización o API Key"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>Editar</span>
                    </button>

                    <button
                      onClick={() => onToggleAccount(acc.id)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer ${
                        acc.enabled 
                          ? isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/10 text-emerald-300' 
                          : isLight ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {acc.enabled ? 'Activa' : 'Pausada'}
                    </button>

                    <button
                      onClick={() => onDeleteAccount(acc.id)}
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isLight ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-500 hover:text-rose-400 hover:bg-rose-500/10'
                      }`}
                      title="Eliminar cuenta"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. VAST.AI OFFICIAL CLOUD API INTEGRATION */}
      <div className={`rounded-2xl p-5 border space-y-4 ${
        isLight 
          ? 'bg-white border-slate-200 text-slate-900 shadow-sm' 
          : 'card-cyber border-[#1E2433] text-white'
      }`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
          isLight ? 'border-slate-200' : 'border-[#1E2433]'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              isLight 
                ? 'bg-cyan-50 border-cyan-200 text-cyan-700' 
                : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
            }`}>
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`font-display-title text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  Vast.ai Cloud GPU API
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                  vastConfig.status === 'connected'
                    ? isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : vastConfig.hasKey
                    ? isLight ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {vastConfig.status === 'connected' ? 'Conectado' : vastConfig.hasKey ? 'Pendiente Test' : 'Sin Configurar'}
                </span>
              </div>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Integración oficial backend para búsqueda de ofertas, cálculo de rentabilidad y supervisión de alquileres
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleToggleVastEnabled}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                vastConfig.enabled
                  ? isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
              }`}
            >
              {vastConfig.enabled ? 'Habilitada' : 'Deshabilitada'}
            </button>
            <button
              type="button"
              onClick={handleTestVastConnection}
              disabled={testingVast}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                isLight 
                  ? 'border-cyan-300 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 shadow-xs' 
                  : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20'
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testingVast ? 'animate-spin' : ''} ${isLight ? 'text-cyan-700' : ''}`} />
              <span>{testingVast ? 'Probando...' : 'Probar Conexión Vast.ai'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono-num">
          {/* Key status & form */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className={`font-semibold flex items-center gap-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                <span>Vast.ai API Key (Bearer Token):</span>
              </label>
              {!isEditingVastKey && (
                <button
                  type="button"
                  onClick={() => setIsEditingVastKey(true)}
                  className={`text-[10px] cursor-pointer ${isLight ? 'text-cyan-700 hover:text-cyan-900 font-bold' : 'text-cyan-400 hover:text-cyan-300'}`}
                >
                  {vastConfig.hasKey ? 'Cambiar Clave' : '+ Asignar Clave'}
                </button>
              )}
            </div>

            {isEditingVastKey ? (
              <form onSubmit={handleSaveVastApiKey} className="flex items-center gap-2">
                <input
                  type="password"
                  value={vastApiKeyInput}
                  onChange={(e) => setVastApiKeyInput(e.target.value)}
                  placeholder="vst-..."
                  className={`flex-1 rounded-lg border px-3 py-2 focus:outline-none ${
                    isLight 
                      ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-600' 
                      : 'border-[#252E42] bg-[#090A0F] text-white placeholder-slate-600 focus:border-cyan-500'
                  }`}
                  autoFocus
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-lg bg-cyan-500 text-slate-950 font-bold hover:bg-cyan-400 transition-colors cursor-pointer"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingVastKey(false)}
                  className={`px-2 py-2 cursor-pointer ${isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-white'}`}
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <div className={`flex items-center justify-between border rounded-xl px-3 py-2 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#090A0F] border-white/[0.08]'
              }`}>
                <span className={`font-mono ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                  {vastConfig.hasKey ? vastConfig.maskedKey : 'Ninguna API Key configurada'}
                </span>
                <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Almacenada solo en Backend</span>
              </div>
            )}
            <p className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
              Obtén tu API key en <a href="https://cloud.vast.ai/manage-keys/" target="_blank" rel="noreferrer" className={`underline ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>cloud.vast.ai/manage-keys</a>. La clave nunca se expone al cliente frontend ni a los paquetes finales.
            </p>
          </div>

          {/* Balance card */}
          <div className={`border rounded-xl p-3 flex flex-col justify-between ${
            isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-[#090A0F] border-white/[0.08]'
          }`}>
            <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Saldo de Crédito Vast.ai:</span>
            <div className={`text-2xl font-bold font-mono mt-1 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>
              ${(vastConfig.balanceUSD || 0).toFixed(2)} <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>USD</span>
            </div>
            <div className={`text-[10px] mt-1 flex items-center justify-between ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
              <span>Modo Inicial:</span>
              <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>SIMULATION</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. KRYPTEX MINING POOL SECTION */}
      <div className={`rounded-2xl p-5 border space-y-4 ${
        isLight 
          ? 'bg-white border-slate-200 text-slate-900 shadow-sm' 
          : 'card-cyber border-[#1E2433] text-white'
      }`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
          isLight ? 'border-slate-200' : 'border-[#1E2433]'
        }`}>
          <div>
            <h3 className={`font-display-title text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <Key className={`h-5 w-5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
              Configuración Kryptex Pool (Pearl - PRL)
            </h3>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Conexión para lectura de hashrates de workers, balance de billetera y shares válidos
            </p>
          </div>

          <button
            onClick={handleTestKryptexConnection}
            disabled={testingKryptex}
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold active:scale-95 transition-all self-start sm:self-auto cursor-pointer ${
              isLight 
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 shadow-xs' 
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${testingKryptex ? 'animate-spin' : ''} ${isLight ? 'text-emerald-700' : ''}`} />
            <span>{testingKryptex ? 'Verificando...' : 'Probar Conexión Kryptex'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono-num">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Dirección de Billetera Pearl (PRL) o Usuario Kryptex:
              </label>
              <button
                type="button"
                onClick={() => onUpdateKryptexConfig({ walletAddress: 'prl1phs6s7m983309a6pz7qdreq8x6usschwxc5ujalp0lzvzyptjghlsc52549' })}
                className={`text-[11px] underline font-sans font-medium cursor-pointer ${isLight ? 'text-cyan-700 hover:text-cyan-900' : 'text-cyan-400 hover:text-cyan-300'}`}
              >
                Cargar Farm Real Top (8 Workers)
              </button>
            </div>
            <input
              type="text"
              value={kryptexConfig.walletAddress}
              onChange={(e) => onUpdateKryptexConfig({ walletAddress: e.target.value })}
              placeholder="prl1q..."
              className={`w-full rounded-xl border px-3.5 py-2.5 focus:outline-none ${
                isLight 
                  ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-600' 
                  : 'border-[#252E42] bg-[#0C0E16] text-white placeholder-slate-500 focus:border-cyan-500'
              }`}
            />
            <span className={`text-[10px] mt-1 block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
              Billetera o cuenta a la que minan tus contenedores de SaladCloud.
            </span>
          </div>

          <div>
            <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Servidor Stratum Kryptex:
            </label>
            <select
              value={kryptexConfig.poolUrl}
              onChange={(e) => onUpdateKryptexConfig({ poolUrl: e.target.value })}
              className={`w-full rounded-xl border px-3.5 py-2.5 focus:outline-none ${
                isLight 
                  ? 'border-slate-300 bg-white text-slate-900 focus:border-cyan-600' 
                  : 'border-[#252E42] bg-[#0C0E16] text-white focus:border-cyan-500'
              }`}
            >
              <option value="stratum+tcp://prl.kryptex.network:7048">Global (prl.kryptex.network:7048)</option>
              <option value="stratum+tcp://prl-us.kryptex.network:7048">North America (prl-us.kryptex.network:7048)</option>
              <option value="stratum+tcp://prl-eu.kryptex.network:7048">Europe (prl-eu.kryptex.network:7048)</option>
              <option value="stratum+tcp://prl-br.kryptex.network:7048">South America (prl-br.kryptex.network:7048)</option>
            </select>
            <span className={`text-[10px] mt-1 block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
              Puerto TCP: 7048 • Puerto SSL: 8048
            </span>
          </div>
        </div>
      </div>

      {/* 4. TELEGRAM BOT STEP-BY-STEP INTEGRATION CARD */}
      <div className={`rounded-2xl p-5 border space-y-4 ${
        isLight 
          ? 'bg-white border-cyan-200 text-slate-900 shadow-sm' 
          : 'card-cyber border-cyan-500/30 bg-gradient-to-br from-[#0B1528] via-[#0A0D18] to-[#090A0F]'
      }`}>
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
          isLight ? 'border-slate-200' : 'border-[#1E2738]'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
              isLight 
                ? 'bg-cyan-50 text-cyan-700 border-cyan-200' 
                : 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
            }`}>
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h3 className={`font-display-title text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Bot Autónomo de Telegram en Tiempo Real
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono-num font-semibold ${
                  isLight ? 'bg-cyan-100 text-cyan-900 border border-cyan-200' : 'bg-cyan-500/20 text-cyan-300'
                }`}>
                  Vigilancia 24/7
                </span>
              </h3>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>
                Recibe alertas inmediatas en tu teléfono móvil si una GPU de Salad deja de enviar shares a Kryptex
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleDirectTestTelegram}
              disabled={testingTelegram}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              <Send className={`h-3.5 w-3.5 ${testingTelegram ? 'animate-bounce' : ''}`} />
              <span>{testingTelegram ? 'Enviando...' : 'Probar Conexión (Ping)'}</span>
            </button>
            <button
              onClick={handleSendTelegramStatus}
              disabled={sendingReport}
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold shadow-lg active:scale-95 transition-all cursor-pointer ${
                isLight 
                  ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800' 
                  : 'bg-white/[0.08] hover:bg-white/[0.14] border-white/[0.15] text-white'
              }`}
            >
              <Activity className={`h-3.5 w-3.5 ${sendingReport ? 'animate-spin' : ''} ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`} />
              <span>{sendingReport ? 'Despachando...' : 'Enviar Reporte a Telegram'}</span>
            </button>
          </div>
        </div>

        {/* Step-by-step Visual Tutorial */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className={`rounded-xl border p-3 space-y-1.5 ${
            isLight ? 'border-slate-200 bg-slate-50/80 text-slate-800' : 'border-[#1A253A] bg-[#0E1424]/70 text-slate-400'
          }`}>
            <div className={`flex items-center gap-2 font-bold ${isLight ? 'text-cyan-800' : 'text-cyan-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-mono-num ${
                isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20'
              }`}>1</span>
              <span>Crear Bot</span>
            </div>
            <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              En Telegram, abre <strong className={isLight ? 'text-cyan-800' : 'text-cyan-300'}>@BotFather</strong> y escribe el comando <code className={`px-1 py-0.5 rounded ${isLight ? 'bg-slate-200 text-emerald-800' : 'bg-slate-800 text-emerald-400'}`}>/newbot</code>.
            </p>
          </div>

          <div className={`rounded-xl border p-3 space-y-1.5 ${
            isLight ? 'border-slate-200 bg-slate-50/80 text-slate-800' : 'border-[#1A253A] bg-[#0E1424]/70 text-slate-400'
          }`}>
            <div className={`flex items-center gap-2 font-bold ${isLight ? 'text-cyan-800' : 'text-cyan-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-mono-num ${
                isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20'
              }`}>2</span>
              <span>Copiar Token</span>
            </div>
            <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Asígnale un nombre (ej: <em className={isLight ? 'text-slate-700' : 'text-slate-300'}>MinerX Alert</em>) y copia el <strong className={isLight ? 'text-emerald-700' : 'text-emerald-400'}>HTTP API Token</strong> generado.
            </p>
          </div>

          <div className={`rounded-xl border p-3 space-y-1.5 ${
            isLight ? 'border-slate-200 bg-slate-50/80 text-slate-800' : 'border-[#1A253A] bg-[#0E1424]/70 text-slate-400'
          }`}>
            <div className={`flex items-center gap-2 font-bold ${isLight ? 'text-cyan-800' : 'text-cyan-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-mono-num ${
                isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20'
              }`}>3</span>
              <span>Obtener Chat ID</span>
            </div>
            <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Abre <strong className={isLight ? 'text-cyan-800' : 'text-cyan-300'}>@userinfobot</strong> en Telegram, pulsa <code className={`px-1 py-0.5 rounded ${isLight ? 'bg-slate-200 text-emerald-800' : 'bg-slate-800 text-emerald-400'}`}>/start</code> y copia tu <strong className={isLight ? 'text-amber-700 font-bold' : 'text-amber-300'}>Id numérico</strong>.
            </p>
          </div>

          <div className={`rounded-xl border p-3 space-y-1.5 ${
            isLight ? 'border-slate-200 bg-slate-50/80 text-slate-800' : 'border-[#1A253A] bg-[#0E1424]/70 text-slate-400'
          }`}>
            <div className={`flex items-center gap-2 font-bold ${isLight ? 'text-cyan-800' : 'text-cyan-400'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-mono-num ${
                isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/20'
              }`}>4</span>
              <span>Iniciar el Bot</span>
            </div>
            <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              <strong className={isLight ? 'text-rose-700' : 'text-rose-300'}>¡Muy importante!</strong> Abre tu bot recién creado y presiona <strong className={isLight ? 'text-slate-900 font-bold' : 'text-white'}>START</strong> para autorizar mensajes.
            </p>
          </div>
        </div>

        {/* Telegram & Discord Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono-num pt-2">
          <div>
            <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Telegram Bot Token (HTTP API):
            </label>
            <input
              type="text"
              value={settings.telegramBotToken || ''}
              onChange={(e) => onUpdateSettings({ telegramBotToken: e.target.value })}
              placeholder="7123456789:AAHkYQ..."
              className={`w-full rounded-xl border px-3.5 py-2.5 focus:outline-none ${
                isLight 
                  ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-600' 
                  : 'border-[#252E42] bg-[#0C0E16] text-white placeholder-slate-500 focus:border-cyan-500'
              }`}
            />
          </div>

          <div>
            <label className={`block mb-1 font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              Telegram Chat ID Personal o Grupo:
            </label>
            <input
              type="text"
              value={settings.telegramChatId || ''}
              onChange={(e) => onUpdateSettings({ telegramChatId: e.target.value })}
              placeholder="123456789"
              className={`w-full rounded-xl border px-3.5 py-2.5 focus:outline-none ${
                isLight 
                  ? 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-cyan-600' 
                  : 'border-[#252E42] bg-[#0C0E16] text-white placeholder-slate-500 focus:border-cyan-500'
              }`}
            />
          </div>
        </div>

        {/* Threshold Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className={`rounded-xl border p-3.5 space-y-2 ${
            isLight ? 'border-slate-200 bg-slate-50/80' : 'border-[#1A202C] bg-[#0C0E16]'
          }`}>
            <div className="flex justify-between text-xs font-mono-num">
              <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Umbral Mínimo de Potencia:</span>
              <span className={`font-bold ${isLight ? 'text-amber-700' : 'text-amber-400'}`}>{settings.underperformingThresholdPct}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              value={settings.underperformingThresholdPct}
              onChange={(e) => onUpdateSettings({ underperformingThresholdPct: Number(e.target.value) })}
              className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-amber-400 ${
                isLight ? 'bg-slate-200' : 'bg-[#161B26]'
              }`}
            />
            <span className={`text-[10px] font-mono-num block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
              Si la GPU mina a menos del {settings.underperformingThresholdPct}% del benchmark, se emitirá una alerta de reasignación.
            </span>
          </div>

          <div className={`rounded-xl border p-3.5 space-y-2 ${
            isLight ? 'border-slate-200 bg-slate-50/80' : 'border-[#1A202C] bg-[#0C0E16]'
          }`}>
            <div className="flex justify-between text-xs font-mono-num">
              <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Inactividad de Shares Máxima:</span>
              <span className={`font-bold ${isLight ? 'text-rose-700' : 'text-rose-400'}`}>
                {settings.maxShareInactivityMinutes < 1 
                  ? `${Math.round(settings.maxShareInactivityMinutes * 60)} segundos` 
                  : `${settings.maxShareInactivityMinutes} ${settings.maxShareInactivityMinutes === 1 ? 'minuto' : 'minutos'}`}
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="15"
              step="0.5"
              value={settings.maxShareInactivityMinutes}
              onChange={(e) => onUpdateSettings({ maxShareInactivityMinutes: Number(e.target.value) })}
              className={`w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-rose-400 ${
                isLight ? 'bg-slate-200' : 'bg-[#161B26]'
              }`}
            />
            <span className={`text-[10px] font-mono-num block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
              Si no se recibe un share válido en {settings.maxShareInactivityMinutes < 1 ? '30 segundos' : `${settings.maxShareInactivityMinutes} minutos`}, se alertará desconexión inmediata en Telegram y en el panel.
            </span>
          </div>
        </div>

        {/* Interactive Telegram Commands Cheat Sheet */}
        <div className={`rounded-xl border p-4 space-y-3 ${
          isLight ? 'border-slate-200 bg-slate-50/80' : 'border-white/[0.08] bg-black/40'
        }`}>
          <div className={`flex items-center gap-2 text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
            <Bot className={`h-4 w-4 ${isLight ? 'text-emerald-600' : 'text-[#05F292]'}`} />
            <span>Comandos Interactivos de Control Remoto en Telegram</span>
            <span className={`text-[10px] border px-2 py-0.5 rounded-full font-mono ${
              isLight ? 'text-cyan-800 bg-cyan-50 border-cyan-200 font-semibold' : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
            }`}>
              Escribe directamente a tu Bot
            </span>
          </div>
          <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            Puedes consultar o controlar tu cluster 24/7 desde tu teléfono móvil enviándole cualquiera de estos comandos en el chat:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs font-mono">
            <div className={`p-2.5 rounded-lg border transition-all ${
              isLight 
                ? 'bg-white border-slate-200 hover:border-emerald-500 shadow-xs' 
                : 'bg-[#0E1424] border-white/[0.06] hover:border-[#05F292]/30'
            }`}>
              <span className={`font-bold block mb-0.5 ${isLight ? 'text-emerald-700' : 'text-[#05F292]'}`}>/status</span>
              <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Telemetría en vivo: TH/s, GPUs activas y $/h neto en USD.</span>
            </div>
            <div className={`p-2.5 rounded-lg border transition-all ${
              isLight 
                ? 'bg-white border-slate-200 hover:border-cyan-500 shadow-xs' 
                : 'bg-[#0E1424] border-white/[0.06] hover:border-cyan-500/30'
            }`}>
              <span className={`font-bold block mb-0.5 ${isLight ? 'text-cyan-800' : 'text-cyan-300'}`}>/fleet</span>
              <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Detalle individual de cada worker, estado y último share.</span>
            </div>
            <div className={`p-2.5 rounded-lg border transition-all ${
              isLight 
                ? 'bg-white border-slate-200 hover:border-amber-500 shadow-xs' 
                : 'bg-[#0E1424] border-white/[0.06] hover:border-amber-500/30'
            }`}>
              <span className={`font-bold block mb-0.5 ${isLight ? 'text-amber-800' : 'text-amber-300'}`}>/balance</span>
              <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Saldo Salad ($ USD) y balance en pool Kryptex (PRL).</span>
            </div>
            <div className={`p-2.5 rounded-lg border transition-all ${
              isLight 
                ? 'bg-white border-slate-200 hover:border-purple-500 shadow-xs' 
                : 'bg-[#0E1424] border-white/[0.06] hover:border-purple-500/30'
            }`}>
              <span className={`font-bold block mb-0.5 ${isLight ? 'text-purple-800' : 'text-purple-300'}`}>/cycle</span>
              <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Ciclo activo, horas acumuladas y ganancia auditada.</span>
            </div>
            <div className={`p-2.5 rounded-lg border transition-all ${
              isLight 
                ? 'bg-white border-slate-200 hover:border-blue-500 shadow-xs' 
                : 'bg-[#0E1424] border-white/[0.06] hover:border-blue-500/30'
            }`}>
              <span className={`font-bold block mb-0.5 ${isLight ? 'text-blue-800' : 'text-blue-300'}`}>/report</span>
              <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Auditoría contable completa y ROI sin sesgos en USD.</span>
            </div>
            <div className={`p-2.5 rounded-lg border transition-all ${
              isLight 
                ? 'bg-white border-slate-200 hover:border-rose-500 shadow-xs' 
                : 'bg-[#0E1424] border-white/[0.06] hover:border-rose-500/30'
            }`}>
              <span className={`font-bold block mb-0.5 ${isLight ? 'text-rose-800' : 'text-rose-300'}`}>/reallocate &lt;nodo&gt;</span>
              <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Reasigna un nodo trabado directamente desde Telegram.</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. AUDITORÍA DE REGISTRO & FIREBASE AUTHENTICATION */}
      <div className={`rounded-2xl p-5 border space-y-4 ${
        isLight 
          ? 'bg-white border-slate-200 text-slate-900 shadow-sm' 
          : 'card-cyber border-[#1E2433] text-white'
      }`}>
        {/* Top Header */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b ${
          isLight ? 'border-slate-200' : 'border-[#1E2433]'
        }`}>
          <div>
            <h3 className={`font-display-title text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <ShieldCheck className={`h-5 w-5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
              Auditoría de Registro & Firebase Authentication
            </h3>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Verificación de persistencia en Cloud Firestore y registro en el Sistema Autenticador de Firebase
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRunAudit}
              disabled={auditLoading}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold active:scale-95 transition-all cursor-pointer ${
                isLight 
                  ? 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800' 
                  : 'border-white/10 bg-white/5 hover:bg-white/10 text-white'
              }`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
              <span>{auditLoading ? 'Auditando...' : 'Ejecutar Auditoría'}</span>
            </button>

            <button
              onClick={handleRunRepair}
              disabled={repairLoading}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold active:scale-95 transition-all cursor-pointer ${
                isLight 
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 shadow-xs' 
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
              }`}
            >
              <Wrench className={`h-3.5 w-3.5 ${repairLoading ? 'animate-spin' : ''}`} />
              <span>{repairLoading ? 'Sincronizando...' : 'Sincronizar con Firebase Auth'}</span>
            </button>
          </div>
        </div>

        {/* Audit Feedback Message */}
        {auditFeedback && (
          <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            auditFeedback.type === 'success'
              ? isLight ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
              : isLight ? 'bg-rose-50 text-rose-800 border border-rose-200' : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
          }`}>
            {auditFeedback.type === 'success' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
            )}
            <span>{auditFeedback.text}</span>
          </div>
        )}

        {/* 4 Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono-num">
          <div className={`p-3 rounded-xl border flex flex-col justify-between ${
            isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0E1424] border-white/[0.06]'
          }`}>
            <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Total Registros:</span>
            <div className={`text-xl font-bold font-mono mt-1 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {auditData?.summary?.totalUsers ?? 0}
            </div>
            <span className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Cuentas en Base de Datos</span>
          </div>

          <div className={`p-3 rounded-xl border flex flex-col justify-between ${
            isLight ? 'bg-emerald-50/50 border-emerald-200' : 'bg-[#0E1424] border-emerald-500/20'
          }`}>
            <span className={`text-[11px] ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>En Firebase Auth:</span>
            <div className={`text-xl font-bold font-mono mt-1 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
              {auditData?.summary?.synchronizedCount ?? 0}
            </div>
            <span className={`text-[10px] mt-1 ${isLight ? 'text-emerald-600' : 'text-emerald-500'}`}>Autenticador Activo</span>
          </div>

          <div className={`p-3 rounded-xl border flex flex-col justify-between ${
            (auditData?.summary?.missingInAuthCount ?? 0) > 0
              ? isLight ? 'bg-amber-50/80 border-amber-300' : 'bg-[#0E1424] border-amber-500/30'
              : isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0E1424] border-white/[0.06]'
          }`}>
            <span className={`text-[11px] ${
              (auditData?.summary?.missingInAuthCount ?? 0) > 0
                ? isLight ? 'text-amber-800' : 'text-amber-400'
                : isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              Pendientes en Auth:
            </span>
            <div className={`text-xl font-bold font-mono mt-1 ${
              (auditData?.summary?.missingInAuthCount ?? 0) > 0
                ? isLight ? 'text-amber-700' : 'text-amber-400'
                : isLight ? 'text-slate-700' : 'text-slate-400'
            }`}>
              {auditData?.summary?.missingInAuthCount ?? 0}
            </div>
            <span className={`text-[10px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
              {(auditData?.summary?.missingInAuthCount ?? 0) > 0 ? 'Requieren sincronización' : 'Todo sincronizado'}
            </span>
          </div>

          <div className={`p-3 rounded-xl border flex flex-col justify-between ${
            isLight ? 'bg-cyan-50/50 border-cyan-200' : 'bg-[#0E1424] border-cyan-500/20'
          }`}>
            <span className={`text-[11px] ${isLight ? 'text-cyan-800' : 'text-cyan-400'}`}>Cloud Firestore:</span>
            <div className={`text-sm font-bold font-mono mt-1 flex items-center gap-1.5 ${isLight ? 'text-cyan-700' : 'text-cyan-300'}`}>
              <Database className="h-4 w-4 shrink-0" />
              <span>Publicado OK</span>
            </div>
            <span className={`text-[10px] mt-1 ${isLight ? 'text-cyan-600' : 'text-cyan-500'}`}>Reglas minerx-telemetry</span>
          </div>
        </div>

        {/* User Accounts Table */}
        <div className="space-y-2">
          <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
            isLight ? 'text-slate-700' : 'text-slate-300'
          }`}>
            <Users className="h-4 w-4" />
            <span>Usuarios Auditados y Estado en el Autenticador</span>
          </h4>

          <div className={`rounded-xl border overflow-x-auto ${
            isLight ? 'border-slate-200 bg-white' : 'border-[#1E2433] bg-[#0A0D14]'
          }`}>
            <table className="w-full text-left text-xs font-mono">
              <thead className={`border-b text-[11px] uppercase tracking-wider ${
                isLight ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-white/[0.08] bg-white/[0.02] text-slate-400'
              }`}>
                <tr>
                  <th className="py-2.5 px-3">Usuario / ID</th>
                  <th className="py-2.5 px-3">Correo</th>
                  <th className="py-2.5 px-3">Firebase Auth</th>
                  <th className="py-2.5 px-3">Firestore</th>
                  <th className="py-2.5 px-3">Estado</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-100 text-slate-700' : 'divide-white/[0.04] text-slate-300'}`}>
                {auditData?.users && auditData.users.length > 0 ? (
                  auditData.users.map((u) => (
                    <tr key={u.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-bold font-sans text-xs">{u.fullName || u.username}</div>
                        <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>{u.id}</div>
                      </td>
                      <td className="py-2.5 px-3 text-[11px]">{u.email}</td>
                      <td className="py-2.5 px-3">
                        {u.inFirebaseAuth ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          }`}>
                            <CheckCircle2 className="h-3 w-3" />
                            {u.firebaseAuthUid ? 'Almacenado' : 'Sincronizado'}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            <AlertCircle className="h-3 w-3" />
                            Pendiente Auth
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                        }`}>
                          <Database className="h-3 w-3" />
                          Publicado
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`text-[10px] font-semibold ${
                          u.status === 'SINCRONIZADO'
                            ? isLight ? 'text-emerald-700' : 'text-emerald-400'
                            : isLight ? 'text-amber-700' : 'text-amber-400'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-slate-500 text-xs">
                      No hay usuarios registrados o auditoría pendiente de ejecución.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Immutable Audit Logs Trail */}
        {auditData?.recentAuditLogs && auditData.recentAuditLogs.length > 0 && (
          <div className="space-y-2 pt-2">
            <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              <Activity className="h-4 w-4" />
              <span>Registro de Eventos de Auditoría (Trazabilidad Inmutable)</span>
            </h4>
            <div className={`rounded-xl border p-3 max-h-40 overflow-y-auto space-y-1.5 text-[11px] font-mono ${
              isLight ? 'border-slate-200 bg-slate-50/70 text-slate-700' : 'border-[#1E2433] bg-[#0A0D14] text-slate-300'
            }`}>
              {auditData.recentAuditLogs.map((log) => (
                <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1 border-b border-black/[0.04] dark:border-white/[0.04]">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      log.status === 'SUCCESS' || log.status === 'REPAIRED_TO_FIREBASE_AUTH'
                        ? isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/20 text-emerald-300'
                        : isLight ? 'bg-rose-100 text-rose-800' : 'bg-rose-500/20 text-rose-300'
                    }`}>
                      {log.eventType}
                    </span>
                    <span className="font-semibold">{log.email || log.username || 'Sistema'}</span>
                  </div>
                  <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                    {new Date(log.timestamp).toLocaleString()} • {log.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
