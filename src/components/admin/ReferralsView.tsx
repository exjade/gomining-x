import React, { useState, useMemo } from 'react';
import { 
  Users, 
  Share2, 
  Copy, 
  Check, 
  DollarSign, 
  Cpu, 
  TrendingUp, 
  Search, 
  Award
} from 'lucide-react';

interface ReferralUser {
  id: string;
  name: string;
  wallet: string;
  email: string;
  joinDate: string;
  tier: 1 | 2 | 3;
  contractedTh: number;
  totalSpentUsd: number;
  commissionEarnedPrl: number;
  commissionEarnedUsd: number;
  status: 'ACTIVE' | 'INACTIVE';
}

const MOCK_REFERRALS: ReferralUser[] = [
  {
    id: 'ref-01',
    name: 'Carlos Mendoza',
    wallet: 'prl1qx9...8k2p',
    email: 'carlos.m@crypto.io',
    joinDate: '2026-03-12',
    tier: 1,
    contractedTh: 192,
    totalSpentUsd: 1850.00,
    commissionEarnedPrl: 62.92,
    commissionEarnedUsd: 92.50,
    status: 'ACTIVE'
  },
  {
    id: 'ref-02',
    name: 'Elena Rostova',
    wallet: 'prl1q8f...39la',
    email: 'elena.rostova@hash.net',
    joinDate: '2026-03-24',
    tier: 1,
    contractedTh: 128,
    totalSpentUsd: 1240.00,
    commissionEarnedPrl: 42.17,
    commissionEarnedUsd: 62.00,
    status: 'ACTIVE'
  },
  {
    id: 'ref-03',
    name: 'Mining Pool Latam',
    wallet: 'prl1qp2...99vx',
    email: 'ops@latamminer.org',
    joinDate: '2026-04-02',
    tier: 1,
    contractedTh: 384,
    totalSpentUsd: 3680.00,
    commissionEarnedPrl: 125.17,
    commissionEarnedUsd: 184.00,
    status: 'ACTIVE'
  },
  {
    id: 'ref-04',
    name: 'Andrés Gil',
    wallet: 'prl1qa7...11mk',
    email: 'andres.gil@fintech.es',
    joinDate: '2026-04-15',
    tier: 2,
    contractedTh: 96,
    totalSpentUsd: 920.00,
    commissionEarnedPrl: 15.64,
    commissionEarnedUsd: 23.00,
    status: 'ACTIVE'
  },
  {
    id: 'ref-05',
    name: 'Kryptex Node #44',
    wallet: 'prl1qcc...54po',
    email: 'node44@nodefarm.io',
    joinDate: '2026-04-20',
    tier: 2,
    contractedTh: 64,
    totalSpentUsd: 620.00,
    commissionEarnedPrl: 10.54,
    commissionEarnedUsd: 15.50,
    status: 'ACTIVE'
  },
  {
    id: 'ref-06',
    name: 'Daniel Vargas',
    wallet: 'prl1qzz...77rt',
    email: 'dvargas@web3hub.com',
    joinDate: '2026-04-28',
    tier: 3,
    contractedTh: 48,
    totalSpentUsd: 460.00,
    commissionEarnedPrl: 3.12,
    commissionEarnedUsd: 4.60,
    status: 'INACTIVE'
  }
];

interface ReferralsViewProps {
  isDarkTheme?: boolean;
}

export const ReferralsView: React.FC<ReferralsViewProps> = ({
  isDarkTheme = true
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState<'ALL' | 1 | 2 | 3>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  // Simulator State
  const [simFriendsCount, setSimFriendsCount] = useState<number>(5);
  const [simAvgPackageTh, setSimAvgPackageTh] = useState<number>(96);

  const referralCode = 'MINERX-VIP-2026';
  const referralLink = `https://minerx.io/join?ref=${referralCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Filtered Referrals
  const filteredReferrals = useMemo(() => {
    return MOCK_REFERRALS.filter(ref => {
      if (tierFilter !== 'ALL' && ref.tier !== tierFilter) return false;
      if (statusFilter !== 'ALL' && ref.status !== statusFilter) return false;
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        return (
          ref.name.toLowerCase().includes(q) ||
          ref.wallet.toLowerCase().includes(q) ||
          ref.email.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [searchQuery, tierFilter, statusFilter]);

  // Aggregate stats
  const totalReferrals = MOCK_REFERRALS.length;
  const activeReferrals = MOCK_REFERRALS.filter(r => r.status === 'ACTIVE').length;
  const totalHashrateTh = MOCK_REFERRALS.reduce((acc, r) => acc + r.contractedTh, 0);
  const totalCommissionUsd = MOCK_REFERRALS.reduce((acc, r) => acc + r.commissionEarnedUsd, 0);
  const totalCommissionPrl = MOCK_REFERRALS.reduce((acc, r) => acc + r.commissionEarnedPrl, 0);
  const availableWithdrawalUsd = 265.40;

  // Simulator calculation (Tier 1 = 5%, Package cost approx $9.60/TH)
  const simEstimatedTotalSpent = simFriendsCount * (simAvgPackageTh * 9.60);
  const simEstimatedCommissionUsd = simEstimatedTotalSpent * 0.05;
  const simEstimatedCommissionPrl = simEstimatedCommissionUsd / 1.47;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-16">
      {/* 1. HEADER TITLE SECTION */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-2xl font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Programa de Referidos & Afiliados MinerX
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
              Multi-Nivel Activo
            </span>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            Supervisa tu red de afiliados, comisiones por potencia contratada y liquidaciones en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className={`px-3 py-1.5 rounded-xl border text-xs font-mono ${
            isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <span>Comisión Nivel 1: <strong className="text-[#05DF72]">5.0%</strong></span>
          </div>
          <div className={`px-3 py-1.5 rounded-xl border text-xs font-mono ${
            isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <span>Nivel 2: <strong className="text-cyan-400">2.5%</strong></span>
          </div>
        </div>
      </div>

      {/* 2. TOP METRIC CARDS (ESTILO FLOTA TAB) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Total Referidos */}
        <div className={`rounded-2xl p-4 border transition-all ${
          isDarkTheme ? 'bg-[#0E1320]/80 border-white/[0.08] text-white shadow-lg' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}>
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
            <span className="uppercase tracking-wider">Red de Afiliados</span>
            <Users className="h-4 w-4 text-[#05DF72]" />
          </div>
          <div className="text-2xl font-bold font-mono">
            {totalReferrals}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>afiliados</span>
          </div>
          <div className="text-xs font-mono text-emerald-500 mt-1 flex items-center gap-1.5 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{activeReferrals} minando activamente</span>
          </div>
        </div>

        {/* Card 2: Potencia Aportada */}
        <div className={`rounded-2xl p-4 border transition-all ${
          isDarkTheme ? 'bg-[#0E1320]/80 border-white/[0.08] text-white shadow-lg' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}>
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
            <span className="uppercase tracking-wider">Potencia en Red</span>
            <Cpu className="h-4 w-4 text-cyan-400" />
          </div>
          <div className={`text-2xl font-bold font-mono ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-700'}`}>
            {totalHashrateTh}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>TH/s total</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
            Contratos activos en Kryptex
          </div>
        </div>

        {/* Card 3: Comisiones Totales */}
        <div className={`rounded-2xl p-4 border transition-all ${
          isDarkTheme ? 'bg-[#0E1320]/80 border-white/[0.08] text-white shadow-lg' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}>
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
            <span className="uppercase tracking-wider">Comisiones Totales</span>
            <DollarSign className="h-4 w-4 text-[#05DF72]" />
          </div>
          <div className="text-2xl font-bold font-mono text-[#05DF72]">
            ${totalCommissionUsd.toFixed(2)}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>USD</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>
            ≈ {totalCommissionPrl.toFixed(2)} PRL acumulados
          </div>
        </div>

        {/* Card 4: Saldo Disponible & Retiro */}
        <div className={`rounded-2xl p-4 border transition-all flex flex-col justify-between ${
          isDarkTheme ? 'bg-[#0E1320]/80 border-white/[0.08] text-white shadow-lg' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}>
          <div>
            <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}`}>
              <span className="uppercase tracking-wider">Saldo Disponible</span>
              <Award className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-500">
              ${availableWithdrawalUsd.toFixed(2)}{' '}
              <span className={`text-xs font-normal font-sans ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>USD</span>
            </div>
          </div>
          <button
            type="button"
            className="mt-2 w-full py-1.5 px-3 rounded-xl bg-[#05DF72] text-slate-950 font-mono text-xs font-bold hover:bg-[#04C965] active:scale-[0.97] transition-all cursor-pointer shadow-sm text-center"
          >
            Solicitar Retiro
          </button>
        </div>
      </div>

      {/* 3. ENLACE DE REFERIDO Y SIMULADOR DE GANANCIAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Box Izquierda: Tu Enlace & Código */}
        <div className={`p-5 rounded-2xl border transition-all space-y-4 ${
          isDarkTheme ? 'bg-[#0A0E17]/90 border-white/[0.08] text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}>
          <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'}`}>
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 text-[#05DF72]" />
              <h3 className={`text-xs font-mono font-bold uppercase tracking-wider ${isDarkTheme ? 'text-slate-200' : 'text-slate-900'}`}>
                Tu Enlace de Afiliado Exclusivo
              </h3>
            </div>
            <span className={`text-[10px] font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
              Pago directo en USDT / PRL
            </span>
          </div>

          <div>
            <label className={`text-xs font-mono block mb-1.5 font-semibold ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
              Enlace Universal de Invitación:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={referralLink}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono border focus:outline-none ${
                  isDarkTheme ? 'bg-[#060912] border-white/10 text-cyan-400' : 'bg-slate-50 border-slate-300 text-cyan-700'
                }`}
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all active:scale-[0.97] cursor-pointer shrink-0 ${
                  copiedLink
                    ? 'bg-emerald-500 text-slate-950'
                    : isDarkTheme ? 'bg-white/10 hover:bg-white/15 text-white border border-white/10' : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                }`}
              >
                {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copiedLink ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className={`p-3 rounded-xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[10px] font-mono block mb-1 uppercase font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>Código Promocional</span>
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-sm text-[#05DF72]">{referralCode}</span>
                <button
                  onClick={handleCopyCode}
                  className={`p-1 transition-colors ${isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
                  title="Copiar Código"
                >
                  {copiedCode ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className={`p-3 rounded-xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
              <span className={`text-[10px] font-mono block mb-1 uppercase font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>Tasa de Conversión</span>
              <div className={`font-mono font-bold text-sm ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-700'}`}>
                18.4% <span className={`text-[10px] font-normal font-sans ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>(64 clics / 12 registros)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Box Derecha: Simulador de Ganancias por Afiliados */}
        <div className={`p-5 rounded-2xl border transition-all flex flex-col justify-between ${
          isDarkTheme ? 'bg-[#0A0E17]/90 border-white/[0.08] text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}>
          <div>
            <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'} mb-3`}>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-cyan-400" />
                <h3 className={`text-xs font-mono font-bold uppercase tracking-wider ${isDarkTheme ? 'text-slate-200' : 'text-slate-900'}`}>
                  Calculadora de Recompensas
                </h3>
              </div>
              <span className="text-xs font-mono text-[#05DF72] font-bold">Nivel 1 (5%)</span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}>Amigos / Clientes Referidos:</span>
                  <span className="font-bold text-[#05DF72]">{simFriendsCount} personas</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={simFriendsCount}
                  onChange={(e) => setSimFriendsCount(parseInt(e.target.value) || 1)}
                  className="w-full accent-[#05DF72] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-semibold'}>Potencia Promedio por Amigo:</span>
                  <span className={`font-bold ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-700'}`}>{simAvgPackageTh} TH/s</span>
                </div>
                <input
                  type="range"
                  min="48"
                  max="384"
                  step="16"
                  value={simAvgPackageTh}
                  onChange={(e) => setSimAvgPackageTh(parseInt(e.target.value) || 48)}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className={`mt-4 p-3.5 rounded-xl border flex items-center justify-between font-mono ${
            isDarkTheme ? 'bg-[#060912] border-white/5' : 'bg-slate-50 border-slate-200'
          }`}>
            <div>
              <span className={`text-[10px] block uppercase font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>Comisión Proyectada:</span>
              <div className="text-lg font-bold text-[#05DF72]">
                ${simEstimatedCommissionUsd.toFixed(2)} USD
              </div>
            </div>
            <div className="text-right">
              <span className={`text-[10px] block uppercase font-semibold ${isDarkTheme ? 'text-slate-400' : 'text-slate-600'}`}>Equivalente PEARL:</span>
              <div className={`text-sm font-bold ${isDarkTheme ? 'text-cyan-400' : 'text-cyan-700'}`}>
                ≈ {simEstimatedCommissionPrl.toFixed(2)} PRL
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. TABLA DE AFILIADOS Y REFERIDOS (ESTILO FLOTA TAB) */}
      <div className={`p-5 rounded-2xl border transition-all ${
        isDarkTheme ? 'bg-[#0A0E17]/90 border-white/[0.08] text-white shadow-xl' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      }`}>
        {/* Search & Filter Toolbar */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b ${isDarkTheme ? 'border-white/5' : 'border-slate-100'} mb-4`}>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#05DF72]" />
            <h3 className={`text-xs font-mono font-bold uppercase tracking-wider ${isDarkTheme ? 'text-slate-200' : 'text-slate-900'}`}>
              Detalle de Referidos en Tu Red ({filteredReferrals.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Buscador */}
            <div className="relative">
              <Search className={`h-3.5 w-3.5 absolute left-3 top-2.5 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por usuario o wallet..."
                className={`pl-8 pr-3 py-1.5 rounded-xl text-xs font-mono border focus:outline-none w-56 ${
                  isDarkTheme ? 'bg-[#060912] border-white/10 text-white focus:border-[#05DF72]' : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500'
                }`}
              />
            </div>

            {/* Filtro de Nivel */}
            <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-mono ${isDarkTheme ? 'bg-black/20 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
              {(['ALL', 1, 2, 3] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTierFilter(t)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    tierFilter === t
                      ? 'bg-[#05DF72] text-slate-950 font-bold'
                      : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {t === 'ALL' ? 'Todos' : `Nivel ${t}`}
                </button>
              ))}
            </div>

            {/* Filtro de Estado */}
            <div className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-mono ${isDarkTheme ? 'bg-black/20 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    statusFilter === s
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : isDarkTheme ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {s === 'ALL' ? 'Todos' : s === 'ACTIVE' ? 'Activos' : 'Inactivos'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabla Responsiva */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className={`border-b text-[11px] ${
                isDarkTheme ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-700 font-bold'
              }`}>
                <th className="py-3 px-3">USUARIO / WALLET</th>
                <th className="py-3 px-3">FECHA REGISTRO</th>
                <th className="py-3 px-3">NIVEL</th>
                <th className="py-3 px-3">POTENCIA TH/S</th>
                <th className="py-3 px-3">TOTAL COMPRA</th>
                <th className="py-3 px-3">COMISIÓN GANADA</th>
                <th className="py-3 px-3">ESTADO</th>
                <th className="py-3 px-3 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDarkTheme ? 'divide-white/5' : 'divide-slate-100'}`}>
              {filteredReferrals.map((user) => (
                <tr 
                  key={user.id}
                  className={`transition-colors ${isDarkTheme ? 'hover:bg-white/[0.02]' : 'hover:bg-slate-50'}`}
                >
                  <td className="py-3 px-3">
                    <div className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{user.name}</div>
                    <span className={`text-[10px] ${isDarkTheme ? 'text-slate-400' : 'text-slate-500 font-medium'}`}>{user.wallet}</span>
                  </td>

                  <td className={`py-3 px-3 ${isDarkTheme ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                    {user.joinDate}
                  </td>

                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      user.tier === 1 
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : user.tier === 2 
                        ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                        : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                    }`}>
                      Nivel {user.tier} ({user.tier === 1 ? '5%' : user.tier === 2 ? '2.5%' : '1%'})
                    </span>
                  </td>

                  <td className="py-3 px-3 text-[#05DF72] font-bold">
                    {user.contractedTh} TH/s
                  </td>

                  <td className={`py-3 px-3 font-bold ${isDarkTheme ? 'text-slate-300' : 'text-slate-800'}`}>
                    ${user.totalSpentUsd.toFixed(2)} USD
                  </td>

                  <td className="py-3 px-3">
                    <span className="font-bold text-[#05DF72] block">
                      ${user.commissionEarnedUsd.toFixed(2)} USD
                    </span>
                    <span className={`text-[10px] block font-medium ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
                      {user.commissionEarnedPrl.toFixed(2)} PRL
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      user.status === 'ACTIVE'
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${user.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {user.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold transition-all active:scale-[0.97] cursor-pointer ${
                        isDarkTheme
                          ? 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                          : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-800'
                      }`}
                    >
                      Detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
