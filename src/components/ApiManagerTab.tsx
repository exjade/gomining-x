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
  Server
} from 'lucide-react';
import type { SaladAccountConfig, KryptexConfig, AppSettings } from '../types/minerx';
import { sendTelegramMessageResilient } from '../utils/notifications';
import { apiFetch } from '../utils/apiConfig';

interface ApiManagerTabProps {
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

  useEffect(() => {
    fetchVastConfig();
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 card-cyber rounded-2xl p-5 border border-[#2A334A]">
        <div>
          <h2 className="font-display-title text-xl font-bold text-white flex items-center gap-2.5">
            Gestión Centralizada de APIs
            <span className="rounded-full bg-cyan-500/10 px-2.5 py-0.5 text-xs font-mono-num font-semibold text-cyan-400 border border-cyan-500/20">
              SaladCloud & Kryptex
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Conecta tus credenciales de SaladCloud y tu wallet de Kryptex para monitorear tu cluster en tiempo real
          </p>
        </div>

        {/* Global Live FinTech Mode Indicator */}
        <div className="flex items-center gap-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3.5 py-2 self-start sm:self-auto">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
          </span>
          <div className="text-left">
            <span className="text-[11px] font-bold text-emerald-300 block">100% Datos en Vivo</span>
            <span className="text-[10px] text-slate-400 font-mono-num">Sin simulación • Kryptex & Salad Real</span>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`rounded-xl p-3 text-xs font-mono-num flex items-center gap-2 border animate-in fade-in duration-200 ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedbackMsg.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          )}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* 2. SALADCLOUD MULTI-ACCOUNT SECTION */}
      <div className="card-cyber rounded-2xl p-5 border border-[#1E2433] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2433]">
          <div>
            <h3 className="font-display-title text-base font-bold text-white flex items-center gap-2">
              <Layers className="h-5 w-5 text-cyan-400" />
              Cuentas de SaladCloud ({accounts.length})
            </h3>
            <p className="text-xs text-slate-400">
              Vigila todas tus GPUs alquiladas en tiempo real y gestiona la asignación de contenedores
            </p>
          </div>

          <button
            onClick={() => {
              setEditingAcc(null);
              setShowAddForm(!showAddForm);
            }}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>Agregar Cuenta Salad</span>
          </button>
        </div>

        {/* Essential SaladCloud Organization Guidance Banner */}
        <div className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-[#14120B] to-[#0C0E16] p-4 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-300">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <span>¿Por qué dio Error 400? Cómo colocar el "Organization Name" correcto:</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            La API de SaladCloud requiere tu nombre de organización exacto en la URL (<code className="text-cyan-300">/organizations/{'{org}'}/...</code>). 
            Si colocas <strong className="text-rose-400">"N/A"</strong> o una barra, Salad responderá con <strong>Error 400 Bad Request</strong>.
          </p>
          <div className="rounded-lg bg-black/50 border border-white/10 p-2.5 font-mono text-[11px] text-slate-300 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-slate-500">Paso 1: Entra a </span>
              <a href="https://portal.salad.com" target="_blank" rel="noreferrer" className="text-cyan-400 hover:underline font-bold inline-flex items-center gap-1">
                portal.salad.com <ExternalLink className="h-3 w-3" />
              </a>
              <span className="text-slate-500"> y mira la barra de direcciones:</span>
              <div className="mt-1 text-slate-400">
                https://portal.salad.com/organizations/<span className="text-emerald-400 font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded">tu-organizacion</span>/...
              </div>
            </div>
            <div className="text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-1 rounded">
              Ese texto en verde es tu Organización
            </div>
          </div>
        </div>

        {/* Edit Account Form */}
        {editingAcc && (
          <form onSubmit={handleSaveEdit} className="rounded-xl border border-amber-500/40 bg-[#0C0E16] p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between">
              <h4 className="font-display-title text-sm font-bold text-amber-300 flex items-center gap-2">
                <Edit3 className="h-4 w-4" />
                Editar Cuenta: {editingAcc.accountName}
              </h4>
              <span className="text-[10px] text-slate-500 font-mono-num">ID: {editingAcc.id}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Nombre Amigable:</label>
                <input
                  type="text"
                  value={editingAcc.accountName}
                  onChange={(e) => setEditingAcc({ ...editingAcc, accountName: e.target.value })}
                  placeholder="ej. Salad Cuenta 1"
                  required
                  className="w-full rounded-lg border border-[#252E42] bg-[#090A0F] px-3 py-2 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  Nombre de Organización (Org) <span className="text-rose-400">*No pongas N/A</span>:
                </label>
                <input
                  type="text"
                  value={editingAcc.organizationName}
                  onChange={(e) => setEditingAcc({ ...editingAcc, organizationName: e.target.value })}
                  placeholder="ej. mi-empresa-salad (mira en portal.salad.com)"
                  required
                  className={`w-full rounded-lg border px-3 py-2 text-white placeholder-slate-500 focus:outline-none font-mono-num ${
                    editingAcc.organizationName.toLowerCase() === 'n/a'
                      ? 'border-rose-500 bg-rose-950/20 text-rose-300 focus:border-rose-400'
                      : 'border-[#252E42] bg-[#090A0F] focus:border-amber-500'
                  }`}
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Proyecto Salad (Project Name):</label>
                <input
                  type="text"
                  value={editingAcc.projectName}
                  onChange={(e) => setEditingAcc({ ...editingAcc, projectName: e.target.value })}
                  placeholder="default"
                  className="w-full rounded-lg border border-[#252E42] bg-[#090A0F] px-3 py-2 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono-num"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Salad API Key:</label>
                <input
                  type="password"
                  value={editingAcc.apiKey}
                  onChange={(e) => setEditingAcc({ ...editingAcc, apiKey: e.target.value })}
                  placeholder="salad_live_sk_..."
                  required
                  className="w-full rounded-lg border border-[#252E42] bg-[#090A0F] px-3 py-2 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono-num"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Saldo Real en Salad ($ USD):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editingAcc.balanceUSD !== undefined ? editingAcc.balanceUSD : ''}
                  onChange={(e) => setEditingAcc({ ...editingAcc, balanceUSD: e.target.value ? parseFloat(e.target.value) : 0 })}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[#252E42] bg-[#090A0F] px-3 py-2 text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none font-mono-num"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setEditingAcc(null)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-amber-400 transition-colors"
              >
                Guardar Corrección
              </button>
            </div>
          </form>
        )}

        {/* Add Account Modal / Form */}
        {showAddForm && !editingAcc && (
          <form onSubmit={handleCreateAccount} className="rounded-xl border border-cyan-500/30 bg-[#0C0E16] p-4 space-y-3 animate-in slide-in-from-top-2 duration-200">
            <h4 className="font-display-title text-sm font-bold text-cyan-300">
              Registrar Nueva Cuenta de SaladCloud
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Nombre Amigable:</label>
                <input
                  type="text"
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  placeholder="ej. Salad Cuenta 1 (Principal)"
                  required
                  className="w-full rounded-lg border border-[#252E42] bg-[#090A0F] px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">
                  Nombre de Organización (Org) <span className="text-amber-400">*De portal.salad.com</span>:
                </label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="ej. mi-organizacion (NO 'N/A')"
                  required
                  className="w-full rounded-lg border border-[#252E42] bg-[#090A0F] px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none font-mono-num"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Proyecto Salad (Project Name):</label>
                <input
                  type="text"
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="default"
                  className="w-full rounded-lg border border-[#252E42] bg-[#090A0F] px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none font-mono-num"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Salad API Key:</label>
                <input
                  type="password"
                  value={newApiKey}
                  onChange={(e) => setNewApiKey(e.target.value)}
                  placeholder="salad_live_sk_..."
                  required
                  className="w-full rounded-lg border border-[#252E42] bg-[#090A0F] px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none font-mono-num"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1 font-semibold">Saldo Inicial en Salad ($ USD):</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[#252E42] bg-[#090A0F] px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none font-mono-num"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition-colors"
              >
                Guardar Cuenta
              </button>
            </div>
          </form>
        )}

        {/* Configured Accounts List */}
        <div className="space-y-3">
          {accounts.length === 0 ? (
            <div className="p-6 text-center rounded-xl border border-dashed border-white/10 text-slate-400 text-xs">
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
                      ? 'border-rose-500/50 bg-rose-950/15' 
                      : 'border-[#1A202C] bg-[#0C0E16] hover:border-[#2A334A]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`h-2.5 w-2.5 rounded-full ${acc.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      <span className="font-bold text-white text-sm">{acc.accountName}</span>
                      
                      {isInvalidOrg ? (
                        <span className="rounded px-2 py-0.5 text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold animate-pulse">
                          ⚠️ Org Inválida ("{acc.organizationName}") - Haz clic en Editar
                        </span>
                      ) : (
                        <span className="rounded px-1.5 py-0.5 text-[10px] bg-[#161B26] text-cyan-300 border border-[#222B3D]">
                          Org: {acc.organizationName}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                      <span>Proyecto: <strong className="text-slate-400">{acc.projectName}</strong></span>
                      <span>•</span>
                      <span>Saldo: <strong className="text-emerald-400 font-mono">${(acc.balanceUSD ?? 0).toFixed(2)} USD</strong></span>
                      <span>•</span>
                      <span>Key: <strong className="text-slate-400">{acc.apiKey ? `${acc.apiKey.substring(0, 14)}...` : 'Sin Key'}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
                    <button
                      onClick={() => handleTestSalad(acc)}
                      disabled={testingAccId === acc.id}
                      className="flex items-center gap-1.5 rounded-lg border border-[#202738] bg-[#121622] px-3 py-1.5 text-slate-300 hover:text-white hover:border-cyan-500 transition-all"
                      title="Verificar conexión directa con la API de SaladCloud"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 text-cyan-400 ${testingAccId === acc.id ? 'animate-spin' : ''}`} />
                      <span>{testingAccId === acc.id ? 'Probando...' : 'Probar API'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowAddForm(false);
                        setEditingAcc(acc);
                      }}
                      className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/20 transition-all"
                      title="Editar nombre de organización o API Key"
                    >
                      <Edit3 className="h-3 w-3" />
                      <span>Editar</span>
                    </button>

                    <button
                      onClick={() => onToggleAccount(acc.id)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                        acc.enabled ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      {acc.enabled ? 'Activa' : 'Pausada'}
                    </button>

                    <button
                      onClick={() => onDeleteAccount(acc.id)}
                      className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
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
      <div className="card-cyber rounded-2xl p-5 border border-[#1E2433] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2433]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display-title text-base font-bold text-white">
                  Vast.ai Cloud GPU API
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${
                  vastConfig.status === 'connected'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : vastConfig.hasKey
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {vastConfig.status === 'connected' ? 'Conectado' : vastConfig.hasKey ? 'Pendiente Test' : 'Sin Configurar'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
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
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-white/[0.04] text-slate-400 border-white/[0.08]'
              }`}
            >
              {vastConfig.enabled ? 'Habilitada' : 'Deshabilitada'}
            </button>
            <button
              type="button"
              onClick={handleTestVastConnection}
              disabled={testingVast}
              className="flex items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${testingVast ? 'animate-spin' : ''}`} />
              <span>{testingVast ? 'Probando...' : 'Probar Conexión Vast.ai'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono-num">
          {/* Key status & form */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-semibold flex items-center gap-1">
                <span>Vast.ai API Key (Bearer Token):</span>
              </label>
              {!isEditingVastKey && (
                <button
                  type="button"
                  onClick={() => setIsEditingVastKey(true)}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
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
                  className="flex-1 rounded-lg border border-[#252E42] bg-[#090A0F] px-3 py-2 text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none"
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
                  className="px-2 py-2 text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between bg-[#090A0F] border border-white/[0.08] rounded-xl px-3 py-2">
                <span className="text-slate-400 font-mono">
                  {vastConfig.hasKey ? vastConfig.maskedKey : 'Ninguna API Key configurada'}
                </span>
                <span className="text-[11px] text-slate-500">Almacenada solo en Backend</span>
              </div>
            )}
            <p className="text-[10px] text-slate-500 mt-1">
              Obtén tu API key en <a href="https://cloud.vast.ai/manage-keys/" target="_blank" rel="noreferrer" className="text-cyan-400 underline">cloud.vast.ai/manage-keys</a>. La clave nunca se expone al cliente frontend ni a los paquetes finales.
            </p>
          </div>

          {/* Balance card */}
          <div className="bg-[#090A0F] border border-white/[0.08] rounded-xl p-3 flex flex-col justify-between">
            <span className="text-slate-400 text-[11px]">Saldo de Crédito Vast.ai:</span>
            <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
              ${(vastConfig.balanceUSD || 0).toFixed(2)} <span className="text-xs text-slate-400">USD</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between">
              <span>Modo Inicial:</span>
              <span className="text-emerald-400 font-bold">SIMULATION</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. KRYPTEX MINING POOL SECTION */}
      <div className="card-cyber rounded-2xl p-5 border border-[#1E2433] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2433]">
          <div>
            <h3 className="font-display-title text-base font-bold text-white flex items-center gap-2">
              <Key className="h-5 w-5 text-emerald-400" />
              Configuración Kryptex Pool (Pearl - PRL)
            </h3>
            <p className="text-xs text-slate-400">
              Conexión para lectura de hashrates de workers, balance de billetera y shares válidos
            </p>
          </div>

          <button
            onClick={handleTestKryptexConnection}
            disabled={testingKryptex}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 active:scale-95 transition-all self-start sm:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${testingKryptex ? 'animate-spin' : ''}`} />
            <span>{testingKryptex ? 'Verificando...' : 'Probar Conexión Kryptex'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono-num">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300 font-semibold">
                Dirección de Billetera Pearl (PRL) o Usuario Kryptex:
              </label>
              <button
                type="button"
                onClick={() => onUpdateKryptexConfig({ walletAddress: 'prl1phs6s7m983309a6pz7qdreq8x6usschwxc5ujalp0lzvzyptjghlsc52549' })}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 underline font-sans font-medium"
              >
                Cargar Farm Real Top (8 Workers)
              </button>
            </div>
            <input
              type="text"
              value={kryptexConfig.walletAddress}
              onChange={(e) => onUpdateKryptexConfig({ walletAddress: e.target.value })}
              placeholder="prl1q..."
              className="w-full rounded-xl border border-[#252E42] bg-[#0C0E16] px-3.5 py-2.5 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              Billetera o cuenta a la que minan tus contenedores de SaladCloud.
            </span>
          </div>

          <div>
            <label className="text-slate-300 block mb-1 font-semibold">
              Servidor Stratum Kryptex:
            </label>
            <select
              value={kryptexConfig.poolUrl}
              onChange={(e) => onUpdateKryptexConfig({ poolUrl: e.target.value })}
              className="w-full rounded-xl border border-[#252E42] bg-[#0C0E16] px-3.5 py-2.5 text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="stratum+tcp://prl.kryptex.network:7048">Global (prl.kryptex.network:7048)</option>
              <option value="stratum+tcp://prl-us.kryptex.network:7048">North America (prl-us.kryptex.network:7048)</option>
              <option value="stratum+tcp://prl-eu.kryptex.network:7048">Europe (prl-eu.kryptex.network:7048)</option>
              <option value="stratum+tcp://prl-br.kryptex.network:7048">South America (prl-br.kryptex.network:7048)</option>
            </select>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Puerto TCP: 7048 • Puerto SSL: 8048
            </span>
          </div>
        </div>
      </div>

      {/* 4. TELEGRAM BOT STEP-BY-STEP INTEGRATION CARD */}
      <div className="card-cyber rounded-2xl p-5 border border-cyan-500/30 bg-gradient-to-br from-[#0B1528] via-[#0A0D18] to-[#090A0F] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1E2738]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
              <Send className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display-title text-base font-bold text-white flex items-center gap-2">
                Bot Autónomo de Telegram en Tiempo Real
                <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-[10px] font-mono-num font-semibold text-cyan-300">
                  Vigilancia 24/7
                </span>
              </h3>
              <p className="text-xs text-slate-300">
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
              className="flex items-center gap-2 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/[0.15] px-3.5 py-2 text-xs font-bold text-white shadow-lg active:scale-95 transition-all cursor-pointer"
            >
              <Activity className={`h-3.5 w-3.5 text-cyan-400 ${sendingReport ? 'animate-spin' : ''}`} />
              <span>{sendingReport ? 'Despachando...' : 'Enviar Reporte a Telegram'}</span>
            </button>
          </div>
        </div>

        {/* Step-by-step Visual Tutorial */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl border border-[#1A253A] bg-[#0E1424]/70 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-400 font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-mono-num">1</span>
              <span>Crear Bot</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              En Telegram, abre <strong className="text-cyan-300">@BotFather</strong> y escribe el comando <code className="bg-slate-800 text-emerald-400 px-1 py-0.5 rounded">/newbot</code>.
            </p>
          </div>

          <div className="rounded-xl border border-[#1A253A] bg-[#0E1424]/70 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-400 font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-mono-num">2</span>
              <span>Copiar Token</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Asígnale un nombre (ej: <em className="text-slate-300">MinerX Alert</em>) y copia el <strong className="text-emerald-400">HTTP API Token</strong> generado.
            </p>
          </div>

          <div className="rounded-xl border border-[#1A253A] bg-[#0E1424]/70 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-400 font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-mono-num">3</span>
              <span>Obtener Chat ID</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Abre <strong className="text-cyan-300">@userinfobot</strong> en Telegram, pulsa <code className="bg-slate-800 text-emerald-400 px-1 py-0.5 rounded">/start</code> y copia tu <strong className="text-amber-300">Id numérico</strong>.
            </p>
          </div>

          <div className="rounded-xl border border-[#1A253A] bg-[#0E1424]/70 p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-cyan-400 font-bold">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/20 text-[11px] font-mono-num">4</span>
              <span>Iniciar el Bot</span>
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              <strong className="text-rose-300">¡Muy importante!</strong> Abre tu bot recién creado y presiona <strong className="text-white">START</strong> para autorizar mensajes.
            </p>
          </div>
        </div>

        {/* Telegram & Discord Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono-num pt-2">
          <div>
            <label className="text-slate-300 block mb-1 font-semibold">
              Telegram Bot Token (HTTP API):
            </label>
            <input
              type="text"
              value={settings.telegramBotToken || ''}
              onChange={(e) => onUpdateSettings({ telegramBotToken: e.target.value })}
              placeholder="7123456789:AAHkYQ..."
              className="w-full rounded-xl border border-[#252E42] bg-[#0C0E16] px-3.5 py-2.5 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-slate-300 block mb-1 font-semibold">
              Telegram Chat ID Personal o Grupo:
            </label>
            <input
              type="text"
              value={settings.telegramChatId || ''}
              onChange={(e) => onUpdateSettings({ telegramChatId: e.target.value })}
              placeholder="123456789"
              className="w-full rounded-xl border border-[#252E42] bg-[#0C0E16] px-3.5 py-2.5 text-white placeholder-slate-500 focus:border-cyan-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Threshold Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div className="rounded-xl border border-[#1A202C] bg-[#0C0E16] p-3.5 space-y-2">
            <div className="flex justify-between text-xs font-mono-num">
              <span className="text-slate-300 font-semibold">Umbral Mínimo de Potencia:</span>
              <span className="text-amber-400 font-bold">{settings.underperformingThresholdPct}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="95"
              value={settings.underperformingThresholdPct}
              onChange={(e) => onUpdateSettings({ underperformingThresholdPct: Number(e.target.value) })}
              className="w-full h-1.5 rounded-lg bg-[#161B26] appearance-none cursor-pointer accent-amber-400"
            />
            <span className="text-[10px] text-slate-500 font-mono-num block">
              Si la GPU mina a menos del {settings.underperformingThresholdPct}% del benchmark, se emitirá una alerta de reasignación.
            </span>
          </div>

          <div className="rounded-xl border border-[#1A202C] bg-[#0C0E16] p-3.5 space-y-2">
            <div className="flex justify-between text-xs font-mono-num">
              <span className="text-slate-300 font-semibold">Inactividad de Shares Máxima:</span>
              <span className="text-rose-400 font-bold">
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
              className="w-full h-1.5 rounded-lg bg-[#161B26] appearance-none cursor-pointer accent-rose-400"
            />
            <span className="text-[10px] text-slate-500 font-mono-num block">
              Si no se recibe un share válido en {settings.maxShareInactivityMinutes < 1 ? '30 segundos' : `${settings.maxShareInactivityMinutes} minutos`}, se alertará desconexión inmediata en Telegram y en el panel.
            </span>
          </div>
        </div>
        {/* Interactive Telegram Commands Cheat Sheet */}
        <div className="rounded-xl border border-white/[0.08] bg-black/40 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-white">
            <Bot className="h-4 w-4 text-[#05F292]" />
            <span>Comandos Interactivos de Control Remoto en Telegram</span>
            <span className="text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full font-mono">
              Escribe directamente a tu Bot
            </span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Puedes consultar o controlar tu cluster 24/7 desde tu teléfono móvil enviándole cualquiera de estos comandos en el chat:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs font-mono">
            <div className="p-2.5 rounded-lg bg-[#0E1424] border border-white/[0.06] hover:border-[#05F292]/30 transition-all">
              <span className="text-[#05F292] font-bold block mb-0.5">/status</span>
              <span className="text-[11px] text-slate-400">Telemetría en vivo: TH/s, GPUs activas y $/h neto en USD.</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0E1424] border border-white/[0.06] hover:border-cyan-500/30 transition-all">
              <span className="text-cyan-300 font-bold block mb-0.5">/fleet</span>
              <span className="text-[11px] text-slate-400">Detalle individual de cada worker, estado y último share.</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0E1424] border border-white/[0.06] hover:border-amber-500/30 transition-all">
              <span className="text-amber-300 font-bold block mb-0.5">/balance</span>
              <span className="text-[11px] text-slate-400">Saldo Salad ($ USD) y balance en pool Kryptex (PRL).</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0E1424] border border-white/[0.06] hover:border-purple-500/30 transition-all">
              <span className="text-purple-300 font-bold block mb-0.5">/cycle</span>
              <span className="text-[11px] text-slate-400">Ciclo activo, horas acumuladas y ganancia auditada.</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0E1424] border border-white/[0.06] hover:border-blue-500/30 transition-all">
              <span className="text-blue-300 font-bold block mb-0.5">/report</span>
              <span className="text-[11px] text-slate-400">Auditoría contable completa y ROI sin sesgos en USD.</span>
            </div>
            <div className="p-2.5 rounded-lg bg-[#0E1424] border border-white/[0.06] hover:border-rose-500/30 transition-all">
              <span className="text-rose-300 font-bold block mb-0.5">/reallocate &lt;nodo&gt;</span>
              <span className="text-[11px] text-slate-400">Reasigna un nodo trabado directamente desde Telegram.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
