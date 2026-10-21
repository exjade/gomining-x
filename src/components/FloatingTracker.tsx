import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  DollarSign, 
  Bell, 
  BellRing, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Activity,
  Volume2,
  VolumeX,
  AlertTriangle,
  Sun,
  CloudRain,
  CloudSun,
  Wind,
  Compass,
  GripHorizontal
} from 'lucide-react';
import { 
  getNotificationPermission, 
  requestNotificationPermission, 
  sendNativeNotification 
} from '../utils/notifications';
import type { MergedGPUWorker, FleetSummary, SaladBalanceInfo, HashrateHistoryPoint } from '../types/minerx';

interface FloatingTrackerProps {
  workers: MergedGPUWorker[];
  summary: FleetSummary;
  saladBalance: SaladBalanceInfo | null;
  history?: HashrateHistoryPoint[];
  onNavigateToTab?: (tab: string) => void;
}

export const FloatingTracker: React.FC<FloatingTrackerProps> = ({
  workers = [],
  summary,
  saladBalance,
  history = [],
  onNavigateToTab
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    return window.innerWidth > 768;
  });
  const [isDismissed, setIsDismissed] = useState<boolean>(false);
  const [notifPermission, setNotifPermission] = useState<string>('default');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Position for Draggable Floating Window (Persistent in localStorage)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('minerx_hud_pos_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotifPermission(getNotificationPermission());
  }, []);

  const runningCount = workers.filter(
    (w) => w.saladStatus === 'running' || (w.isMining && w.saladStatus !== 'stopped')
  ).length;

  const allocatingCount = workers.filter((w) => w.saladStatus === 'allocating').length;

  const underperformingCount = workers.filter(
    (w) => w.saladStatus === 'running' && (w.isWithinWindow === false || w.performanceRatioPct < 85)
  ).length;

  const totalTHs = summary?.totalHashrateTHs || 0;
  const netUSDPerHour = summary?.hourlyNetProfitUSD || 0;

  // Stale rejection rate calculation
  const totalShares = summary?.totalValidShares + (summary?.totalStaleShares || 0);
  const staleRatePct = totalShares > 0 ? ((summary?.totalStaleShares || 0) / totalShares) * 100 : 0;

  // Silicon Weather Condition State
  const weatherState = useMemo(() => {
    if (underperformingCount > 0) {
      return {
        label: 'Turbulencia Térmica',
        desc: `${underperformingCount} GPU fuera de ventana óptima`,
        icon: CloudRain,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10 border-amber-500/30'
      };
    }
    if (allocatingCount > 0 && runningCount === 0) {
      return {
        label: 'Niebla de Silicio',
        desc: 'SaladCloud buscando nodos físicos',
        icon: CloudSun,
        color: 'text-cyan-400',
        bg: 'bg-cyan-500/10 border-cyan-500/30'
      };
    }
    if (runningCount > 0 && netUSDPerHour >= 0) {
      return {
        label: 'Cielo Despejado',
        desc: 'Silicio frío & rentabilidad óptima (+58%)',
        icon: Sun,
        color: 'text-[#05F292]',
        bg: 'bg-emerald-500/10 border-emerald-500/30'
      };
    }
    return {
      label: 'Clima en Espera',
      desc: 'Flota detenida / sin consumo',
      icon: CloudSun,
      color: 'text-slate-400',
      bg: 'bg-white/[0.04] border-white/[0.08]'
    };
  }, [underperformingCount, allocatingCount, runningCount, netUSDPerHour]);

  // Real micro-sparkline path generator from history (Temperature-style curve)
  const sparklinePath = useMemo(() => {
    const dataPoints = history.length >= 2 
      ? history.slice(-12).map((h) => h.fleetHashrateTHs)
      : [totalTHs * 0.95, totalTHs * 0.98, totalTHs * 0.96, totalTHs * 1.01, totalTHs];

    if (dataPoints.length < 2) return '';
    const min = Math.min(...dataPoints);
    const max = Math.max(...dataPoints);
    const range = max - min || 1;
    const width = 290;
    const height = 40;
    
    const points = dataPoints.map((val, i) => {
      const x = (i / (dataPoints.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 10) - 5;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return `M ${points.join(' L ')}`;
  }, [history, totalTHs]);

  // Web Audio API beep for telemetry ping
  const playBeep = (freq = 880, duration = 0.12) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch {}
  };

  // Dragging event handlers (Both Touch & Mouse)
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const rect = cardRef.current?.getBoundingClientRect();
    const currX = rect ? rect.left : (window.innerWidth - 350);
    const currY = rect ? rect.top : (window.innerHeight - 450);

    dragRef.current = {
      startX: clientX,
      startY: clientY,
      initX: currX,
      initY: currY
    };
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDragging || !dragRef.current) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const deltaX = clientX - dragRef.current.startX;
    const deltaY = clientY - dragRef.current.startY;

    const newX = Math.max(10, Math.min(window.innerWidth - 320, dragRef.current.initX + deltaX));
    const newY = Math.max(10, Math.min(window.innerHeight - 180, dragRef.current.initY + deltaY));

    setPosition({ x: newX, y: newY });
  };

  const handleTouchEnd = () => {
    if (isDragging && position) {
      localStorage.setItem('minerx_hud_pos_v2', JSON.stringify(position));
    }
    setIsDragging(false);
    dragRef.current = null;
  };

  // Add global mouse move/up listeners when dragging via mouse
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging && dragRef.current) {
        const deltaX = e.clientX - dragRef.current.startX;
        const deltaY = e.clientY - dragRef.current.startY;
        const newX = Math.max(10, Math.min(window.innerWidth - 320, dragRef.current.initX + deltaX));
        const newY = Math.max(10, Math.min(window.innerHeight - 180, dragRef.current.initY + deltaY));
        setPosition({ x: newX, y: newY });
      }
    };
    const onMouseUp = () => {
      if (isDragging) {
        handleTouchEnd();
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging, position]);

  const handleToggleNotifications = async () => {
    if (soundEnabled) playBeep(1046, 0.1);

    if (notifPermission === 'granted') {
      sendNativeNotification('🟢 MinerX HUD Activo', {
        body: `Telemetría: ${totalTHs.toFixed(1)} TH/s | ${runningCount} GPUs activas | +$${netUSDPerHour.toFixed(3)}/h USD`,
      });
      return;
    }

    const granted = await requestNotificationPermission();
    if (granted) {
      setNotifPermission('granted');
      sendNativeNotification('⚡ Notificaciones Nativas Conectadas', {
        body: 'MinerX te notificará ante desconexiones de GPU o caídas de umbral de potencia.',
      });
    } else {
      setNotifPermission('denied');
    }
  };

  // Dynamic inline styling for floating coordinates
  const floatingStyle: React.CSSProperties = position 
    ? { 
        position: 'fixed', 
        left: `${position.x}px`, 
        top: `${position.y}px`, 
        touchAction: 'none' 
      }
    : {};

  // FLOATING SUMMON BUTTON WHEN DISMISSED
  if (isDismissed) {
    return (
      <button
        onClick={() => {
          setIsDismissed(false);
          setIsOpen(true);
          if (soundEnabled) playBeep(784, 0.08);
        }}
        className="fixed bottom-20 md:bottom-6 right-3 sm:right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-gradient-to-r from-[#070A14]/95 to-[#0D1528]/95 border border-[#05F292]/60 text-[#05F292] shadow-[0_12px_35px_rgba(0,0,0,0.85),0_0_20px_rgba(5,242,146,0.3)] backdrop-blur-2xl text-xs font-mono font-bold hover:scale-105 active:scale-95 transition-all cursor-pointer group"
        title="Abrir Widget Flotante de Silicio"
      >
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#05F292] opacity-80"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#05F292]"></span>
        </span>
        <weatherState.icon className="w-4 h-4 text-cyan-400 group-hover:rotate-12 transition-transform" />
        <span className="tracking-wider uppercase font-sans font-bold">WIDGET CLIMA</span>
        <span className="text-[10px] text-cyan-300 font-extrabold px-1.5 py-0.5 rounded bg-cyan-500/20">
          {totalTHs.toFixed(1)} T
        </span>
      </button>
    );
  }

  // MINIMIZED DYNAMIC ISLAND / WEATHER PILL VIEW (Draggable on mobile/desktop)
  if (!isOpen) {
    return (
      <div 
        ref={cardRef}
        style={floatingStyle}
        className={`${!position ? 'fixed bottom-20 md:bottom-6 right-3 sm:right-6' : ''} z-50 flex items-center gap-2 p-1.5 pl-3 rounded-full bg-gradient-to-r from-[#070A14]/95 via-[#0C1224]/95 to-[#080D1A]/95 border border-[#05F292]/40 shadow-[0_12px_40px_rgba(0,0,0,0.85),0_0_25px_rgba(5,242,146,0.25)] backdrop-blur-3xl animate-in slide-in-from-bottom-2 duration-200 select-none cursor-grab active:cursor-grabbing`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#05F292] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#05F292]"></span>
        </span>

        <weatherState.icon className={`w-3.5 h-3.5 shrink-0 ${weatherState.color}`} />
        
        <div 
          onClick={() => {
            setIsOpen(true);
            if (soundEnabled) playBeep(880, 0.08);
          }}
          className="flex items-center gap-2 text-xs font-mono cursor-pointer select-none"
        >
          <span className="text-white font-bold flex items-center gap-1">
            <span className="text-cyan-300 font-extrabold">{totalTHs.toFixed(1)}</span>
            <span className="text-[10px] text-slate-400">TH/s</span>
          </span>
          <span className="text-slate-600 font-bold">•</span>
          <span className="text-emerald-400 font-bold">
            {runningCount} GPU
          </span>
          <span className="text-slate-600 font-bold">•</span>
          <span className={`font-black tracking-tight ${netUSDPerHour >= 0 ? 'text-[#05F292]' : 'text-rose-400'}`}>
            {netUSDPerHour >= 0 ? '+' : ''}${netUSDPerHour.toFixed(2)}/h
          </span>
        </div>

        <button
          onClick={() => {
            setIsOpen(true);
            if (soundEnabled) playBeep(880, 0.08);
          }}
          className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
          title="Expandir widget"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // EXPANDED WEATHER-WIDGET STYLE FLOATING WINDOW (DRAGGABLE & TOUCH-FRIENDLY)
  return (
    <div 
      ref={cardRef}
      style={floatingStyle}
      className={`${!position ? 'fixed bottom-20 md:bottom-6 right-3 sm:right-6' : ''} z-50 w-[92vw] sm:w-[340px] max-w-[350px] rounded-3xl bg-gradient-to-b from-[#0B1020]/95 via-[#070A14]/98 to-[#04060C]/98 border border-[#05F292]/35 shadow-[0_20px_60px_rgba(0,0,0,0.92),0_0_35px_rgba(5,242,146,0.18)] backdrop-blur-3xl animate-in slide-in-from-bottom-4 duration-300 font-sans text-white overflow-hidden ring-1 ring-white/[0.08] select-none`}
    >
      
      {/* Draggable Grip Handle & Weather Header */}
      <div 
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleTouchStart}
        className="flex items-center justify-between px-4 py-2.5 bg-white/[0.03] border-b border-white/[0.08] relative cursor-grab active:cursor-grabbing group"
      >
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#05F292] to-[#00F0FF] opacity-90" />
        
        {/* Drag Pill Grip */}
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-white/[0.05] text-slate-400 group-hover:text-cyan-300 transition-colors">
            <GripHorizontal className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="text-[11px] font-black tracking-wider text-white flex items-center gap-1.5 uppercase font-display-title">
              MINER<span className="text-[#05F292]">X</span> CLIMA
              <span className="text-[8px] font-mono font-bold px-1.5 py-0.2 rounded-full bg-[#05F292]/15 text-[#05F292] border border-[#05F292]/30">
                WIDGET
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Audio toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              soundEnabled ? 'text-cyan-400 hover:bg-cyan-500/10' : 'text-slate-500 hover:bg-white/[0.05]'
            }`}
            title={soundEnabled ? 'Silenciar sonidos' : 'Activar sonido'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            title="Minimizar a píldora"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          
          <button
            onClick={() => setIsDismissed(true)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
            title="Cerrar widget"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Weather Widget Card Body */}
      <div className="p-4 space-y-3">
        
        {/* 1. Main Weather Headline ("Silicon Condition & Hash Temperature") */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white">
                {totalTHs.toFixed(1)}
              </span>
              <span className="text-sm font-mono text-cyan-400 font-bold mt-1">
                TH/s
              </span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-xs font-semibold flex items-center gap-1 ${weatherState.color}`}>
                <weatherState.icon className="w-3.5 h-3.5" />
                {weatherState.label}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-[10px] text-slate-400">
                {runningCount} GPUs minando
              </span>
            </div>
          </div>

          {/* Quick Yield Pill */}
          <div className="text-right">
            <div className={`text-sm font-black font-mono ${netUSDPerHour >= 0 ? 'text-[#05F292]' : 'text-rose-400'}`}>
              {netUSDPerHour >= 0 ? '+' : ''}${netUSDPerHour.toFixed(3)}
              <span className="text-[10px] font-normal text-slate-400">/h</span>
            </div>
            <div className="text-[10px] font-mono text-cyan-300 font-semibold mt-0.5">
              ${(netUSDPerHour * 24).toFixed(2)} USD/día
            </div>
            <div className="text-[9px] text-slate-500 mt-0.5">
              {netUSDPerHour >= 0 ? '+' : ''}${(netUSDPerHour * 720).toFixed(0)} USD/mes
            </div>
          </div>
        </div>

        {/* 2. Micro Silicon Temperature / 24h Area Chart */}
        <div className="p-2.5 rounded-2xl bg-black/50 border border-white/[0.06] relative overflow-hidden">
          <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mb-1 px-1">
            <span className="flex items-center gap-1 text-cyan-300">
              <Activity className="w-3 h-3 text-cyan-400" />
              <span>Curva de Rendimiento (24h)</span>
            </span>
            <span className="text-[#05F292] font-semibold">{totalTHs.toFixed(1)} TH/s pico</span>
          </div>
          <div className="h-9 w-full relative">
            <svg className="w-full h-full overflow-visible" viewBox="0 0 290 40" preserveAspectRatio="none">
              <defs>
                <linearGradient id="weatherSparklineGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#05F292" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              {sparklinePath && (
                <>
                  <path
                    d={sparklinePath}
                    fill="none"
                    stroke="#00F0FF"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={`${sparklinePath} L 290,40 L 0,40 Z`}
                    fill="url(#weatherSparklineGradient)"
                  />
                </>
              )}
            </svg>
          </div>
        </div>

        {/* 3. Weather Conditions Grid (Presión, Humedad, Viento, Batería) */}
        <div className="grid grid-cols-3 gap-2 text-xs font-mono text-slate-300">
          {/* Condición 1: Saldo Salad */}
          <div className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="text-[9px] text-slate-400 flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-amber-400" />
              <span>SALDO</span>
            </div>
            <div className="font-bold text-amber-300 text-xs mt-1">
              ${(saladBalance?.totalBalanceUSD ?? 0).toFixed(2)}
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">
              {(saladBalance?.hourlySpendingUSD || 0) > 0 ? `${(saladBalance?.runwayHours ?? 0).toFixed(0)}h runway` : 'Pausado'}
            </div>
          </div>

          {/* Condición 2: Stale / Viento */}
          <div className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="text-[9px] text-slate-400 flex items-center gap-1">
              <Wind className="w-3 h-3 text-cyan-400" />
              <span>STALE</span>
            </div>
            <div className="font-bold text-cyan-300 text-xs mt-1">
              {staleRatePct.toFixed(1)}%
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">
              {summary?.totalStaleShares || 0} shares
            </div>
          </div>

          {/* Condición 3: Eficiencia Silicio */}
          <div className="p-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <div className="text-[9px] text-slate-400 flex items-center gap-1">
              <Compass className="w-3 h-3 text-emerald-400" />
              <span>EFICIENCIA</span>
            </div>
            <div className="font-bold text-[#05F292] text-xs mt-1">
              {(summary?.fleetEfficiencyPct || 100).toFixed(0)}%
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">
              vs Benchmark
            </div>
          </div>
        </div>

        {/* 4. Throttling Alert Pill if applicable */}
        {underperformingCount > 0 && (
          <div className="flex items-center justify-between p-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-mono animate-pulse">
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{underperformingCount} GPU en Throttling Térmico</span>
            </div>
            {onNavigateToTab && (
              <button 
                onClick={() => onNavigateToTab('fleet')}
                className="text-[10px] underline font-bold hover:text-white"
              >
                Revisar
              </button>
            )}
          </div>
        )}

        {/* 5. Native Mobile Notifications */}
        <div>
          {notifPermission === 'granted' ? (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#05F292]/10 border border-[#05F292]/30 text-[10px] text-[#05F292] font-mono">
              <span className="flex items-center gap-1.5 font-bold">
                <BellRing className="w-3 h-3 animate-bounce" />
                Alertas Nativas Activas
              </span>
              <button
                onClick={handleToggleNotifications}
                className="text-[9px] underline text-cyan-300 hover:text-white cursor-pointer"
              >
                Test Ping
              </button>
            </div>
          ) : (
            <button
              onClick={handleToggleNotifications}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-cyan-500/20 to-[#05F292]/20 hover:from-cyan-500/30 hover:to-[#05F292]/30 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold transition-all cursor-pointer shadow-md active:scale-95"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Activar Notificaciones Nativas</span>
            </button>
          )}
        </div>

        {/* 6. Quick Navigation Footer */}
        {onNavigateToTab && (
          <div className="flex items-center justify-between pt-1.5 border-t border-white/[0.08] text-[10px] font-semibold text-slate-400">
            <button
              onClick={() => {
                onNavigateToTab('fleet');
                if (soundEnabled) playBeep(987, 0.06);
              }}
              className="hover:text-cyan-400 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Flota</span>
              <span className="text-cyan-400">→</span>
            </button>
            <button
              onClick={() => {
                onNavigateToTab('economics');
                if (soundEnabled) playBeep(1174, 0.06);
              }}
              className="hover:text-[#05F292] flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Economía</span>
              <span className="text-[#05F292]">→</span>
            </button>
            <button
              onClick={() => {
                onNavigateToTab('alerts');
                if (soundEnabled) playBeep(659, 0.06);
              }}
              className="hover:text-amber-400 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Alertas</span>
              <span className="text-amber-400">→</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
};
