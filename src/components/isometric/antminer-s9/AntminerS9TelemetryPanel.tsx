import React from 'react';
import { 
  Cpu, 
  Zap, 
  Thermometer, 
  Wind, 
  Server, 
  ShieldCheck, 
  Layers, 
  Network, 
  CheckCircle2
} from 'lucide-react';
import type { AntminerS9Telemetry, AntminerSubassembly } from './AntminerS9Model';

interface AntminerS9TelemetryPanelProps {
  telemetry: AntminerS9Telemetry;
  activeSubassembly?: AntminerSubassembly | null;
  isDarkTheme?: boolean;
}

export const AntminerS9TelemetryPanel: React.FC<AntminerS9TelemetryPanelProps> = ({
  telemetry,
  activeSubassembly,
  isDarkTheme = true
}) => {
  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hrs = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hrs}h ${mins}m`;
  };

  return (
    <div className={`w-full rounded-3xl border p-6 transition-all duration-300 ${
      isDarkTheme 
        ? 'bg-[#0A0E17]/90 border-white/[0.08] text-white shadow-xl backdrop-blur-xl' 
        : 'bg-white border-slate-200 text-slate-900 shadow-sm'
    }`}>
      {/* 1. HEADER TELEMETRÍA */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/5 mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className={`text-base font-bold font-sans tracking-tight ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
              Telemetría Operativa MinerX en Tiempo Real
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
              {telemetry.operationalStatus}
            </span>
          </div>
          <p className={`text-xs font-mono mt-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            ID: <span className="font-bold text-cyan-400">{telemetry.minerId}</span> • Worker: <span className="font-bold text-[#05DF72]">{telemetry.workerId}</span> • Heartbeat: {telemetry.lastHeartbeat}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className={`px-3 py-1.5 rounded-2xl border flex items-center gap-1.5 ${
            isDarkTheme ? 'bg-white/5 border-white/10 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'
          }`}>
            <Network className="h-3.5 w-3.5 text-cyan-400" />
            <span>Kryptex Pool Conectada</span>
          </span>
        </div>
      </div>

      {/* 2. GRID PRINCIPAL DE MÉTRICAS OPERATIVAS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {/* HASHRATE ACTUAL */}
        <div className={`p-3.5 rounded-2xl border transition-all ${
          activeSubassembly?.startsWith('HASHBOARD') ? 'ring-2 ring-[#05DF72]' : ''
        } ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
          <span className={`text-[10px] font-mono uppercase tracking-wider block mb-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            Hashrate Actual
          </span>
          <div className="text-base font-mono font-bold text-[#05DF72] flex items-center gap-1.5">
            <Cpu className="h-4 w-4" />
            <span>{telemetry.hashrateCurrentTh.toFixed(2)} TH/s</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 mt-0.5 block">
            Media 24h: {telemetry.hashrateAverage24hTh.toFixed(2)} TH/s
          </span>
        </div>

        {/* CHIPS ASIC DETECTADOS */}
        <div className={`p-3.5 rounded-2xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
          <span className={`text-[10px] font-mono uppercase tracking-wider block mb-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            Chips BM1387
          </span>
          <div className="text-base font-mono font-bold text-cyan-400 flex items-center gap-1.5">
            <Layers className="h-4 w-4" />
            <span>189 / 189</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-500 font-semibold mt-0.5 block">
            3/3 Cadenas OK
          </span>
        </div>

        {/* TEMPERATURA ADMISIÓN / ESCAPE */}
        <div className={`p-3.5 rounded-2xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
          <span className={`text-[10px] font-mono uppercase tracking-wider block mb-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            Temperaturas
          </span>
          <div className={`text-base font-mono font-bold flex items-center gap-1.5 ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
            <Thermometer className="h-4 w-4 text-amber-400" />
            <span>{telemetry.intakeTempC}°C / {telemetry.exhaustTempC}°C</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 mt-0.5 block">
            Inlet / Outlet
          </span>
        </div>

        {/* VENTILADORES PWM */}
        <div className={`p-3.5 rounded-2xl border transition-all ${
          activeSubassembly?.startsWith('FAN') ? 'ring-2 ring-cyan-400' : ''
        } ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
          <span className={`text-[10px] font-mono uppercase tracking-wider block mb-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            Ventiladores PWM
          </span>
          <div className="text-base font-mono font-bold text-cyan-400 flex items-center gap-1.5">
            <Wind className="h-4 w-4" />
            <span>{telemetry.fanFrontRpm} RPM</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 mt-0.5 block">
            Duty: {telemetry.fanDutyCyclePct}% • Rear: {telemetry.fanRearRpm}
          </span>
        </div>

        {/* CONSUMO Y EFICIENCIA */}
        <div className={`p-3.5 rounded-2xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
          <span className={`text-[10px] font-mono uppercase tracking-wider block mb-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            Potencia DC
          </span>
          <div className="text-base font-mono font-bold text-amber-400 flex items-center gap-1.5">
            <Zap className="h-4 w-4" />
            <span>{telemetry.powerWatts} W</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 mt-0.5 block">
            {telemetry.efficiencyJperTh.toFixed(1)} J/TH
          </span>
        </div>

        {/* SHARES Y TASA DE RECHAZO */}
        <div className={`p-3.5 rounded-2xl border ${isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-slate-50 border-slate-200'}`}>
          <span className={`text-[10px] font-mono uppercase tracking-wider block mb-1 ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            Shares & Rechazos
          </span>
          <div className="text-base font-mono font-bold text-[#05DF72] flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            <span>{telemetry.rejectionRatePct}%</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400 mt-0.5 block">
            {telemetry.acceptedShares.toLocaleString()} Aceptadas
          </span>
        </div>
      </div>

      {/* 3. ESTADO DETALLADO POR CADENA DE HASHBOARD (CHAINS 1, 2, 3) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-[#05DF72]" />
            <h4 className={`text-xs font-mono font-bold uppercase tracking-wider ${isDarkTheme ? 'text-slate-300' : 'text-slate-700'}`}>
              Desglose de Telemetría por Hashboard Físico (16nm FinFET)
            </h4>
          </div>
          <span className={`text-xs font-mono ${isDarkTheme ? 'text-slate-400' : 'text-slate-500'}`}>
            Uptime: {formatUptime(telemetry.uptimeSeconds)}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {telemetry.hashboards.map((hb, idx) => {
            const isSubSelected = activeSubassembly === `HASHBOARD_${idx}`;

            return (
              <div 
                key={hb.id}
                className={`p-4 rounded-2xl border transition-all ${
                  isSubSelected ? 'border-[#05DF72] bg-emerald-500/10 shadow-lg' : isDarkTheme ? 'bg-[#0E1320] border-white/5' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
                  <span className={`text-xs font-mono font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>
                    {hb.name}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-[#05DF72]/15 text-[#05DF72]">
                    {hb.status}
                  </span>
                </div>

                <div className="space-y-1.5 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>Hashrate Cadena:</span>
                    <span className="font-bold text-[#05DF72]">{hb.hashrateTh.toFixed(2)} TH/s</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>Chips BM1387:</span>
                    <span className={`font-bold ${isDarkTheme ? 'text-white' : 'text-slate-900'}`}>{hb.chipCount} / {hb.expectedChips} OK</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>Temp PCB / Chip:</span>
                    <span className="font-semibold text-amber-400">{hb.temperaturePcbC.toFixed(1)}°C / {hb.temperatureChipC.toFixed(1)}°C</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isDarkTheme ? 'text-slate-400' : 'text-slate-500'}>Voltaje 3x PCIe:</span>
                    <span className="text-cyan-400 font-bold">{hb.pcieVoltages.join('V · ')}V</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. FOOTER INFORMACIÓN DE POOL & FIRMWARE */}
      <div className={`mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs font-mono ${
        isDarkTheme ? 'border-white/5 text-slate-400' : 'border-slate-200 text-slate-500'
      }`}>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-[#05DF72]" />
          <span>Firmware: <strong className={isDarkTheme ? 'text-slate-200' : 'text-slate-800'}>{telemetry.firmwareVersion}</strong></span>
        </div>
        <div>
          <span>Pool: <strong className="text-cyan-400">{telemetry.poolUrl}</strong> ({telemetry.poolUser})</span>
        </div>
      </div>
    </div>
  );
};
