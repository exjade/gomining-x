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
    <div className="minerx-admin-view space-y-6 pb-16">
      {/* 1. HEADER TITLE SECTION */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className={`text-2xl font-semibold font-sans ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>
              Programa de Referidos & Afiliados MinerX
            </h2>
            <span className="admin-badge px-2.5 py-0.5 admin-radius-control text-xs font-mono font-semibold admin-bg-success admin-text-success border admin-border">
              Multi-Nivel Activo
            </span>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
            Supervisa tu red de afiliados, comisiones por potencia contratada y liquidaciones en tiempo real.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className={`admin-card px-3 py-1.5 admin-radius-card border text-xs font-mono ${
            isDarkTheme ? ' admin-bg-surface admin-border admin-text-secondary' : ' admin-bg-surface admin-border admin-text-primary'
          }`}>
            <span>Comisión Nivel 1: <strong className="admin-text-success">5.0%</strong></span>
          </div>
          <div className={`admin-card px-3 py-1.5 admin-radius-card border text-xs font-mono ${
            isDarkTheme ? ' admin-bg-surface admin-border admin-text-secondary' : ' admin-bg-surface admin-border admin-text-primary'
          }`}>
            <span>Nivel 2: <strong className="admin-text-accent">2.5%</strong></span>
          </div>
        </div>
      </div>

      {/* 2. TOP METRIC CARDS (ESTILO FLOTA TAB) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Total Referidos */}
        <div className={`admin-card admin-radius-card p-4 border ${
          isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
        }`}>
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
            <span className="">Red de Afiliados</span>
            <Users className="h-4 w-4 admin-text-success" />
          </div>
          <div className="text-2xl font-semibold font-mono">
            {totalReferrals}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>afiliados</span>
          </div>
          <div className="text-xs font-mono admin-text-success mt-1 flex items-center gap-1.5 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full admin-bg-success" />
            <span>{activeReferrals} minando activamente</span>
          </div>
        </div>

        {/* Card 2: Potencia Aportada */}
        <div className={`admin-card admin-radius-card p-4 border ${
          isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
        }`}>
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
            <span className="">Potencia en Red</span>
            <Cpu className="h-4 w-4 admin-text-accent" />
          </div>
          <div className={`text-2xl font-semibold font-mono ${isDarkTheme ? ' admin-text-accent' : ' admin-text-accent'}`}>
            {totalHashrateTh}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>TH/s total</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
            Contratos activos en Kryptex
          </div>
        </div>

        {/* Card 3: Comisiones Totales */}
        <div className={`admin-card admin-radius-card p-4 border ${
          isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
        }`}>
          <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
            <span className="">Comisiones Totales</span>
            <DollarSign className="h-4 w-4 admin-text-success" />
          </div>
          <div className="text-2xl font-semibold font-mono admin-text-success">
            ${totalCommissionUsd.toFixed(2)}{' '}
            <span className={`text-xs font-normal font-sans ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>USD</span>
          </div>
          <div className={`text-xs font-mono mt-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
            ≈ {totalCommissionPrl.toFixed(2)} PRL acumulados
          </div>
        </div>

        {/* Card 4: Saldo Disponible & Retiro */}
        <div className={`admin-card admin-radius-card p-4 border flex flex-col justify-between ${
          isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
        }`}>
          <div>
            <div className={`flex items-center justify-between text-xs font-mono mb-1.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-semibold'}`}>
              <span className="">Saldo Disponible</span>
              <Award className="h-4 w-4 admin-text-warning" />
            </div>
            <div className="text-2xl font-semibold font-mono admin-text-warning">
              ${availableWithdrawalUsd.toFixed(2)}{' '}
              <span className={`text-xs font-normal font-sans ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>USD</span>
            </div>
          </div>
          <button
            type="button"
            className="mt-2 w-full py-1.5 px-3 admin-radius-control admin-bg-primary admin-text-primary font-mono text-xs font-semibold active:scale-[0.97] cursor-pointer text-center"
          >
            Solicitar Retiro
          </button>
        </div>
      </div>

      {/* 3. ENLACE DE REFERIDO Y SIMULADOR DE GANANCIAS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Box Izquierda: Tu Enlace & Código */}
        <div className={`admin-card p-5 admin-radius-card border space-y-4 ${
          isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
        }`}>
          <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'}`}>
            <div className="flex items-center gap-2">
              <Share2 className="h-4 w-4 admin-text-success" />
              <h3 className={`text-xs font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                Tu Enlace de Afiliado Exclusivo
              </h3>
            </div>
            <span className={`text-xs font-mono ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
              Pago directo en USDT / PRL
            </span>
          </div>

          <div>
            <label className={`text-xs font-mono block mb-1.5 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
              Enlace Universal de Invitación:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={referralLink}
                className={`w-full px-3.5 py-2.5 admin-radius-card text-xs font-mono border ${
                  isDarkTheme ? ' admin-bg-surface admin-border admin-text-accent' : ' admin-bg-surface admin-border admin-text-accent'
                }`}
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className={`flex items-center gap-1.5 px-4 py-2.5 admin-radius-control text-xs font-mono font-semibold active:scale-[0.97] cursor-pointer shrink-0 ${
                  copiedLink
                    ? ' admin-bg-primary admin-text-primary'
                    : isDarkTheme ? ' admin-bg-surface admin-text-primary border admin-border' : ' admin-bg-surface admin-text-primary border admin-border'
                }`}
              >
                {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copiedLink ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className={`admin-card p-3 admin-radius-card border ${isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'}`}>
              <span className={`text-xs font-mono block mb-1 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Código Promocional</span>
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-sm admin-text-success">{referralCode}</span>
                <button
                  onClick={handleCopyCode}
                  className={`p-1 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}
                  title="Copiar Código"
                >
                  {copiedCode ? <Check className="h-3.5 w-3.5 admin-text-success" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            <div className={`admin-card p-3 admin-radius-card border ${isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'}`}>
              <span className={`text-xs font-mono block mb-1 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Tasa de Conversión</span>
              <div className={`font-mono font-semibold text-sm ${isDarkTheme ? ' admin-text-accent' : ' admin-text-accent'}`}>
                18.4% <span className={`text-xs font-normal font-sans ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>(64 clics / 12 registros)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Box Derecha: Simulador de Ganancias por Afiliados */}
        <div className={`admin-card p-5 admin-radius-card border flex flex-col justify-between ${
          isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
        }`}>
          <div>
            <div className={`flex items-center justify-between pb-3 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'} mb-3`}>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 admin-text-accent" />
                <h3 className={`text-xs font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                  Calculadora de Recompensas
                </h3>
              </div>
              <span className="text-xs font-mono admin-text-success font-semibold">Nivel 1 (5%)</span>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-semibold'}>Amigos / Clientes Referidos:</span>
                  <span className="font-semibold admin-text-success">{simFriendsCount} personas</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="50"
                  value={simFriendsCount}
                  onChange={(e) => setSimFriendsCount(parseInt(e.target.value) || 1)}
                  className="w-full admin-accent-range cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-mono mb-1">
                  <span className={isDarkTheme ? 'admin-text-secondary' : 'admin-text-secondary font-semibold'}>Potencia Promedio por Amigo:</span>
                  <span className={`font-semibold ${isDarkTheme ? ' admin-text-accent' : ' admin-text-accent'}`}>{simAvgPackageTh} TH/s</span>
                </div>
                <input
                  type="range"
                  min="48"
                  max="384"
                  step="16"
                  value={simAvgPackageTh}
                  onChange={(e) => setSimAvgPackageTh(parseInt(e.target.value) || 48)}
                  className="w-full admin-accent-range cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className={`admin-card mt-4 p-3.5 admin-radius-card border flex items-center justify-between font-mono ${
            isDarkTheme ? ' admin-bg-surface admin-border' : ' admin-bg-surface admin-border'
          }`}>
            <div>
              <span className={`text-xs block font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Comisión Proyectada:</span>
              <div className="text-lg font-semibold admin-text-success">
                ${simEstimatedCommissionUsd.toFixed(2)} USD
              </div>
            </div>
            <div className="text-right">
              <span className={`text-xs block font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>Equivalente PEARL:</span>
              <div className={`text-sm font-semibold ${isDarkTheme ? ' admin-text-accent' : ' admin-text-accent'}`}>
                ≈ {simEstimatedCommissionPrl.toFixed(2)} PRL
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. TABLA DE AFILIADOS Y REFERIDOS (ESTILO FLOTA TAB) */}
      <div className={`admin-card p-5 admin-radius-card border ${
        isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
      }`}>
        {/* Search & Filter Toolbar */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b ${isDarkTheme ? ' admin-border' : ' admin-border'} mb-4`}>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 admin-text-success" />
            <h3 className={`text-xs font-mono font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
              Detalle de Referidos en Tu Red ({filteredReferrals.length})
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Buscador */}
            <div className="relative">
              <Search className={`h-3.5 w-3.5 absolute left-3 top-2.5 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por usuario o wallet..."
                className={`pl-8 pr-3 py-1.5 admin-radius-card text-xs font-mono border w-56 ${
                  isDarkTheme ? ' admin-bg-surface admin-border admin-text-primary' : ' admin-bg-surface admin-border admin-text-primary'
                }`}
              />
            </div>

            {/* Filtro de Nivel */}
            <div className={`admin-card flex items-center gap-1 p-1 admin-radius-card border text-xs font-mono ${isDarkTheme ? ' admin-bg-subtle admin-border' : ' admin-bg-surface admin-border'}`}>
              {(['ALL', 1, 2, 3] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTierFilter(t)}
                  className={`px-2.5 py-1 admin-radius-control cursor-pointer ${
                    tierFilter === t
                      ? ' admin-bg-primary admin-text-primary font-semibold'
                      : isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'
                  }`}
                >
                  {t === 'ALL' ? 'Todos' : `Nivel ${t}`}
                </button>
              ))}
            </div>

            {/* Filtro de Estado */}
            <div className={`admin-card flex items-center gap-1 p-1 admin-radius-card border text-xs font-mono ${isDarkTheme ? ' admin-bg-subtle admin-border' : ' admin-bg-surface admin-border'}`}>
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 admin-radius-control cursor-pointer ${
                    statusFilter === s
                      ? ' admin-bg-primary admin-text-primary font-semibold'
                      : isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'
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
              <tr className={`border-b text-xs ${
                isDarkTheme ? ' admin-border admin-text-secondary' : ' admin-border admin-text-primary font-semibold'
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
            <tbody className={`divide-y ${isDarkTheme ? ' divide-white/5' : ' divide-slate-100'}`}>
              {filteredReferrals.map((user) => (
                <tr 
                  key={user.id}
                  className={`${isDarkTheme ? '' : ''}`}
                >
                  <td className="py-3 px-3">
                    <div className={`font-semibold ${isDarkTheme ? ' admin-text-primary' : ' admin-text-primary'}`}>{user.name}</div>
                    <span className={`text-xs ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>{user.wallet}</span>
                  </td>

                  <td className={`py-3 px-3 ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary font-medium'}`}>
                    {user.joinDate}
                  </td>

                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      user.tier === 1 
                        ? ' admin-bg-success admin-text-success border admin-border-success'
                        : user.tier === 2 
                        ? ' admin-bg-info admin-text-accent border admin-border-info'
                        : ' admin-bg-subtle admin-text-secondary border admin-border'
                    }`}>
                      Nivel {user.tier} ({user.tier === 1 ? '5%' : user.tier === 2 ? '2.5%' : '1%'})
                    </span>
                  </td>

                  <td className="py-3 px-3 admin-text-success font-semibold">
                    {user.contractedTh} TH/s
                  </td>

                  <td className={`py-3 px-3 font-semibold ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-primary'}`}>
                    ${user.totalSpentUsd.toFixed(2)} USD
                  </td>

                  <td className="py-3 px-3">
                    <span className="font-semibold admin-text-success block">
                      ${user.commissionEarnedUsd.toFixed(2)} USD
                    </span>
                    <span className={`text-xs block font-medium ${isDarkTheme ? ' admin-text-secondary' : ' admin-text-secondary'}`}>
                      {user.commissionEarnedPrl.toFixed(2)} PRL
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    <span className={`admin-badge inline-flex items-center gap-1.5 px-2 py-0.5 admin-radius-control text-xs font-semibold ${
                      user.status === 'ACTIVE'
                        ? ' admin-bg-success admin-text-success border admin-border-success'
                        : ' admin-bg-subtle admin-text-secondary border admin-border'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${user.status === 'ACTIVE' ? ' admin-bg-success' : ' admin-bg-subtle'}`} />
                      {user.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      className={`px-2.5 py-1 admin-radius-control border text-xs font-mono font-semibold active:scale-[0.97] cursor-pointer ${
                        isDarkTheme
                          ? ' admin-bg-surface admin-border admin-text-secondary'
                          : ' admin-bg-surface admin-border admin-text-primary'
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
