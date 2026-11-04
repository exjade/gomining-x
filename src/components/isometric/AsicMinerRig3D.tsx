import React, { useState, useEffect } from 'react';
import { Wind, Server } from 'lucide-react';

interface AsicMinerRig3DProps {
  modelName?: string;
  hashrateTh?: number;
  temperatureC?: number;
  fanRpm?: number;
  wattage?: number;
  efficiencyJth?: number;
  isDarkTheme?: boolean;
  qualityStatus?: string;
}

export const AsicMinerRig3D: React.FC<AsicMinerRig3DProps> = ({
  modelName = 'MinerX S21 Ultra-Hydra ASIC',
  hashrateTh = 192,
  temperatureC = 64.5,
  fanRpm = 4850,
  wattage = 3250,
  efficiencyJth = 17.5,
  isDarkTheme = true,
  qualityStatus = 'OPTIMAL'
}) => {
  const [selectedBlade, setSelectedBlade] = useState<number>(1);
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [pulseActive, setPulseActive] = useState<boolean>(true);

  // Smooth continuous fan blade animation
  useEffect(() => {
    const interval = setInterval(() => {
      setRotationAngle((prev) => (prev + 24) % 360);
    }, 40);
    return () => clearInterval(interval);
  }, []);

  // Soft heart-beat pulse for data transmission
  useEffect(() => {
    const pulseInterval = setInterval(() => {
      setPulseActive((prev) => !prev);
    }, 1800);
    return () => clearInterval(pulseInterval);
  }, []);

  // Blade telemetry calculations
  const bladeTemps = [temperatureC - 1.2, temperatureC + 0.8, temperatureC - 0.4];
  const bladeHashrates = [
    Math.round((hashrateTh / 3) * 0.99),
    Math.round((hashrateTh / 3) * 1.02),
    Math.round((hashrateTh / 3) * 0.99)
  ];

  return (
    <div
      className={`relative w-full rounded-3xl border overflow-hidden transition-all duration-300 ${
        isDarkTheme
          ? 'bg-[#080B12]/90 border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl text-white'
          : 'bg-white/95 border-slate-200/90 shadow-[0_15px_35px_rgba(0,0,0,0.06)] backdrop-blur-xl text-slate-900'
      }`}
    >
      {/* 1. ANATOMY TOP FRAME: Fig metadata + Title + Status badges */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b ${
          isDarkTheme ? 'border-white/[0.06] bg-white/[0.02]' : 'border-slate-100 bg-slate-50/50'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-7 px-2.5 rounded-lg font-mono text-[11px] font-bold tracking-wider uppercase bg-[#05DF72]/15 text-[#05DF72] border border-[#05DF72]/30">
            FIG 01 · ANATOMY HARDWARE RIG
          </div>
          <span className="text-xs font-mono font-semibold tracking-tight opacity-75">
            {modelName}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
            <span
              className={`h-2 w-2 rounded-full bg-[#05DF72] transition-opacity duration-300 ${
                pulseActive ? 'opacity-100 shadow-[0_0_8px_#05DF72]' : 'opacity-40'
              }`}
            />
            {qualityStatus}
          </span>
          <span className="hidden sm:inline-block px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            3x HASHBOARDS ACTIVE
          </span>
        </div>
      </div>

      {/* 2. ISOMETRIC VIEWPORT (High-Fidelity Anatomy Mechanical Drawing) */}
      <div className="relative w-full h-[340px] sm:h-[400px] flex items-center justify-center p-2 sm:p-6 overflow-hidden select-none">
        {/* Subtle grid background */}
        <div
          className={`absolute inset-0 opacity-[0.03] pointer-events-none ${
            isDarkTheme ? 'bg-[radial-gradient(#ffffff_1px,transparent_1px)]' : 'bg-[radial-gradient(#000000_1px,transparent_1px)]'
          } [background-size:16px_16px]`}
        />

        <svg
          viewBox="0 0 800 460"
          className="w-full h-full max-w-[760px] drop-shadow-2xl"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Representación isométrica Anatomy de máquina minera ASIC"
        >
          <defs>
            {/* Shading Gradients following Anatomy 4-Tone Hierarchy */}
            <linearGradient id="chassisTop" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={isDarkTheme ? '#242C3D' : '#F8FAFC'} />
              <stop offset="100%" stopColor={isDarkTheme ? '#182030' : '#E2E8F0'} />
            </linearGradient>

            <linearGradient id="chassisLeftShade" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={isDarkTheme ? '#131A29' : '#CBD5E1'} />
              <stop offset="100%" stopColor={isDarkTheme ? '#0A0F1A' : '#94A3B8'} />
            </linearGradient>

            <linearGradient id="chassisRightShade" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={isDarkTheme ? '#1B2436' : '#E2E8F0'} />
              <stop offset="100%" stopColor={isDarkTheme ? '#101724' : '#CBD5E1'} />
            </linearGradient>

            {/* Fan and turbine radial gradient */}
            <radialGradient id="fanHubGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#05DF72" stopOpacity="0.8" />
              <stop offset="70%" stopColor="#06B6D4" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.0" />
            </radialGradient>

            {/* Heavy soft ground contact halo */}
            <filter id="groundHalo" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="16" />
            </filter>

            <filter id="neonTracer" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 1. SOFT HALO UNDER CHASSIS (Anatomy Rule: Heavy volume stands on paper/desk) */}
          <ellipse
            cx="400"
            cy="390"
            rx="240"
            ry="45"
            fill={isDarkTheme ? '#000000' : '#64748B'}
            opacity={isDarkTheme ? '0.75' : '0.18'}
            filter="url(#groundHalo)"
          />

          {/* 2. BASE MOUNTING FEET & FLANGES */}
          {/* Foot Front-Left */}
          <path d="M 230,350 L 260,365 L 260,378 L 230,363 Z" fill={isDarkTheme ? '#080C14' : '#64748B'} stroke={isDarkTheme ? '#1E293B' : '#94A3B8'} strokeWidth="1" />
          {/* Foot Front-Right */}
          <path d="M 530,300 L 560,315 L 560,328 L 530,313 Z" fill={isDarkTheme ? '#080C14' : '#64748B'} stroke={isDarkTheme ? '#1E293B' : '#94A3B8'} strokeWidth="1" />
          {/* Foot Back-Left */}
          <path d="M 180,265 L 210,280 L 210,293 L 180,278 Z" fill={isDarkTheme ? '#080C14' : '#64748B'} stroke={isDarkTheme ? '#1E293B' : '#94A3B8'} strokeWidth="1" />

          {/* 3. MAIN MONOLITHIC CHASSIS BODY (Isometric Extrusion) */}
          {/* Left Vertical Face (Shade 0 - Darkest) */}
          <polygon
            points="180,230 380,335 380,185 180,80"
            fill="url(#chassisLeftShade)"
            stroke={isDarkTheme ? '#26334A' : '#94A3B8'}
            strokeWidth="1.5"
          />

          {/* Right Vertical Face (Shade 1 - Mid tone) */}
          <polygon
            points="380,335 620,205 620,55 380,185"
            fill="url(#chassisRightShade)"
            stroke={isDarkTheme ? '#33435F' : '#CBD5E1'}
            strokeWidth="1.5"
          />

          {/* Top Horizontal Face (Shade Top - Lightest) */}
          <polygon
            points="180,80 380,185 620,55 420,-50"
            fill="url(#chassisTop)"
            stroke={isDarkTheme ? '#43577A' : '#FFFFFF'}
            strokeWidth="1.5"
          />

          {/* 4. CHASSIS CORNER BEVELS & SEAM LINES (Anatomy Rule: Bevels catch light) */}
          <line x1="380" y1="185" x2="380" y2="335" stroke={isDarkTheme ? '#526E99' : '#FFFFFF'} strokeWidth="1.5" opacity="0.8" />
          <line x1="180" y1="80" x2="380" y2="185" stroke={isDarkTheme ? '#526E99' : '#FFFFFF'} strokeWidth="1.2" opacity="0.6" />
          <line x1="380" y1="185" x2="620" y2="55" stroke={isDarkTheme ? '#334460' : '#94A3B8'} strokeWidth="1.2" opacity="0.6" />

          {/* Screw Dots on Top Corners */}
          <circle cx="195" cy="85" r="2" fill={isDarkTheme ? '#475569' : '#94A3B8'} />
          <circle cx="375" cy="180" r="2" fill={isDarkTheme ? '#475569' : '#94A3B8'} />
          <circle cx="605" cy="60" r="2" fill={isDarkTheme ? '#475569' : '#94A3B8'} />
          <circle cx="420" cy="-35" r="2" fill={isDarkTheme ? '#475569' : '#94A3B8'} />

          {/* 5. TOP CONTROL UNIT & PSU ENCLOSURE */}
          <polygon
            points="240,65 370,135 480,75 350,5"
            fill={isDarkTheme ? '#101624' : '#E2E8F0'}
            stroke={isDarkTheme ? '#05DF72' : '#10B981'}
            strokeWidth="1"
            strokeDasharray="4 2"
          />
          {/* Top Control Face */}
          <polygon
            points="240,45 370,115 480,55 350,-15"
            fill={isDarkTheme ? '#1E283C' : '#FFFFFF'}
            stroke={isDarkTheme ? '#334155' : '#CBD5E1'}
            strokeWidth="1"
          />
          {/* Front of Control Box */}
          <polygon
            points="240,65 370,135 370,115 240,45"
            fill={isDarkTheme ? '#141C2D' : '#CBD5E1'}
            stroke={isDarkTheme ? '#26354D' : '#94A3B8'}
            strokeWidth="1"
          />
          {/* Right of Control Box */}
          <polygon
            points="370,135 480,75 480,55 370,115"
            fill={isDarkTheme ? '#182236' : '#E2E8F0'}
            stroke={isDarkTheme ? '#26354D' : '#94A3B8'}
            strokeWidth="1"
          />

          {/* Control Unit Ethernet RJ45 Jack & Status LEDs */}
          <g transform="translate(320, 105)">
            <rect x="0" y="0" width="16" height="10" rx="1.5" fill="#0A0E17" stroke="#334155" strokeWidth="0.8" />
            <circle cx="3" cy="3" r="1.5" fill={pulseActive ? '#05DF72' : '#065F46'} filter="url(#neonTracer)" />
            <circle cx="8" cy="3" r="1.5" fill="#F59E0B" />
            {/* IP Report Button */}
            <circle cx="28" cy="5" r="2.5" fill="#DC2626" />
          </g>

          {/* 6. FRONT INTAKE FAN TURBINE (High RPM Dual-Cone) */}
          <g transform="translate(265, 230)">
            {/* Outer Cowling Rim */}
            <ellipse cx="0" cy="0" rx="68" ry="46" fill={isDarkTheme ? '#090D15' : '#F1F5F9'} stroke={isDarkTheme ? '#243248' : '#94A3B8'} strokeWidth="3" />
            <ellipse cx="0" cy="0" rx="62" ry="41" fill={isDarkTheme ? '#05080E' : '#E2E8F0'} stroke={isDarkTheme ? '#05DF72' : '#10B981'} strokeWidth="1" />

            {/* Central Electric Motor Hub */}
            <ellipse cx="0" cy="0" rx="22" ry="14" fill={isDarkTheme ? '#1A2333' : '#64748B'} stroke={isDarkTheme ? '#00F2FE' : '#0284C7'} strokeWidth="1.5" />
            <circle cx="0" cy="0" r="14" fill="url(#fanHubGlow)" />

            {/* Rotating Fan Blades (Isometric projected blades) */}
            <g transform={`rotate(${rotationAngle})`}>
              <path d="M 0,0 L -45,-18 C -35,-30 -15,-40 0,-40 Z" fill={isDarkTheme ? '#162030' : '#94A3B8'} opacity="0.85" />
              <path d="M 0,0 L 45,18 C 35,30 15,40 0,40 Z" fill={isDarkTheme ? '#162030' : '#94A3B8'} opacity="0.85" />
              <path d="M 0,0 L -18,35 C -30,25 -40,10 -40,0 Z" fill={isDarkTheme ? '#121A28' : '#64748B'} opacity="0.85" />
              <path d="M 0,0 L 18,-35 C 30,-25 40,-10 40,0 Z" fill={isDarkTheme ? '#121A28' : '#64748B'} opacity="0.85" />
            </g>

            {/* Protective Hex Honeycomb Mesh Lines */}
            <ellipse cx="0" cy="0" rx="55" ry="36" fill="none" stroke={isDarkTheme ? '#334460' : '#CBD5E1'} strokeWidth="0.8" strokeDasharray="3 3" />
            <line x1="-55" y1="0" x2="55" y2="0" stroke={isDarkTheme ? '#334460' : '#CBD5E1'} strokeWidth="0.8" />
            <line x1="0" y1="-36" x2="0" y2="36" stroke={isDarkTheme ? '#334460' : '#CBD5E1'} strokeWidth="0.8" />
          </g>

          {/* 7. THREE MODULAR HASHBOARD SLED SLOTS (Interactive Selection) */}
          {[0, 1, 2].map((idx) => {
            const isHovered = selectedBlade === idx + 1;
            const xOffset = idx * 62;
            const yOffset = idx * -33;

            // Face coordinates for hashboard blades on the right flank
            const p1 = `${415 + xOffset},${170 + yOffset}`;
            const p2 = `${460 + xOffset},${145 + yOffset}`;
            const p3 = `${460 + xOffset},${255 + yOffset}`;
            const p4 = `${415 + xOffset},${280 + yOffset}`;

            return (
              <g
                key={`blade-slot-${idx}`}
                className="cursor-pointer transition-all duration-200"
                onClick={() => setSelectedBlade(idx + 1)}
              >
                {/* Blade Outer Slot Border */}
                <polygon
                  points={`${p1} ${p2} ${p3} ${p4}`}
                  fill={isHovered ? (isDarkTheme ? '#0D2B24' : '#DCFCE7') : (isDarkTheme ? '#0E1524' : '#F1F5F9')}
                  stroke={isHovered ? '#05DF72' : (isDarkTheme ? '#26364F' : '#CBD5E1')}
                  strokeWidth={isHovered ? '2' : '1'}
                />

                {/* Vertical Aluminum Cooling Fins Texture (topTicks recipe) */}
                {[...Array(6)].map((_, finIdx) => {
                  const finX = 422 + xOffset + finIdx * 6;
                  const finYTop = 165 + yOffset + finIdx * -3.2;
                  const finYBot = 275 + yOffset + finIdx * -3.2;
                  return (
                    <line
                      key={`fin-${finIdx}`}
                      x1={finX}
                      y1={finYTop}
                      x2={finX}
                      y2={finYBot}
                      stroke={isHovered ? '#10B981' : (isDarkTheme ? '#1E293B' : '#CBD5E1')}
                      strokeWidth="1.2"
                    />
                  );
                })}

                {/* Status LED & Blade Indicator */}
                <circle
                  cx={437 + xOffset}
                  cy={190 + yOffset}
                  r="3.5"
                  fill={isHovered ? '#00F2FE' : '#05DF72'}
                  filter={isHovered ? 'url(#neonTracer)' : undefined}
                />
                <text
                  x={430 + xOffset}
                  y={215 + yOffset}
                  fill={isHovered ? '#FFFFFF' : (isDarkTheme ? '#94A3B8' : '#64748B')}
                  fontSize="8.5"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  BLD #{idx + 1}
                </text>
              </g>
            );
          })}

          {/* 8. HIGH-VOLTAGE POWER BUSBAR CONDUIT (tubePieces Craft Recipe) */}
          <path
            d="M 370,125 Q 430,90 490,45"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="3.5"
            strokeDasharray="6 3"
          />
          {/* Gold Terminal Lugs */}
          <circle cx="370" cy="125" r="4" fill="#FBBF24" stroke="#D97706" strokeWidth="1" />
          <circle cx="490" cy="45" r="4" fill="#FBBF24" stroke="#D97706" strokeWidth="1" />

          {/* 9. ANATOMY LIVE HUD OVERLAYS */}
          <g transform="translate(48, 305)">
            <rect
              x="0"
              y="0"
              width="150"
              height="44"
              rx="10"
              fill={isDarkTheme ? '#0B0F19' : '#FFFFFF'}
              stroke={isDarkTheme ? '#1E293B' : '#E2E8F0'}
              strokeWidth="1"
            />
            <text x="14" y="18" fill={isDarkTheme ? '#94A3B8' : '#64748B'} fontSize="9" fontFamily="monospace" fontWeight="bold">
              POTENCIA EFECTIVA
            </text>
            <text x="14" y="34" fill="#05DF72" fontSize="14" fontFamily="monospace" fontWeight="bold">
              {hashrateTh} TH/s
            </text>
          </g>

          <g transform="translate(605, 175)">
            <rect
              x="0"
              y="0"
              width="155"
              height="44"
              rx="10"
              fill={isDarkTheme ? '#0B0F19' : '#FFFFFF'}
              stroke={isDarkTheme ? '#1E293B' : '#E2E8F0'}
              strokeWidth="1"
            />
            <text x="14" y="18" fill={isDarkTheme ? '#94A3B8' : '#64748B'} fontSize="9" fontFamily="monospace" fontWeight="bold">
              BLADE #{selectedBlade} TEMP
            </text>
            <text x="14" y="34" fill="#00F2FE" fontSize="14" fontFamily="monospace" fontWeight="bold">
              {bladeTemps[selectedBlade - 1].toFixed(1)} °C · {bladeHashrates[selectedBlade - 1]} TH/s
            </text>
          </g>
        </svg>
      </div>

      {/* 3. ANATOMY BOTTOM INTERACTIVE CONTROLS & METRIC GAUGES */}
      <div
        className={`grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-t ${
          isDarkTheme ? 'border-white/[0.06] bg-[#06080E]/70' : 'border-slate-100 bg-slate-50/70'
        }`}
      >
        <div
          onClick={() => setSelectedBlade(1)}
          className={`p-3 rounded-2xl border transition-all cursor-pointer ${
            selectedBlade === 1
              ? isDarkTheme
                ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                : 'bg-emerald-50 border-emerald-300 text-slate-900'
              : isDarkTheme
              ? 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono mb-1">
            <span className="flex items-center gap-1 font-bold">
              <Server className="h-3.5 w-3.5 text-[#05DF72]" />
              HASHBOARD 1
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-[#05DF72]">
              ACTIVO
            </span>
          </div>
          <div className="text-base font-bold font-mono text-[#05DF72]">{bladeHashrates[0]} TH/s</div>
          <div className="text-[11px] font-mono text-slate-400">{bladeTemps[0].toFixed(1)}°C · 1.28V</div>
        </div>

        <div
          onClick={() => setSelectedBlade(2)}
          className={`p-3 rounded-2xl border transition-all cursor-pointer ${
            selectedBlade === 2
              ? isDarkTheme
                ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                : 'bg-emerald-50 border-emerald-300 text-slate-900'
              : isDarkTheme
              ? 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono mb-1">
            <span className="flex items-center gap-1 font-bold">
              <Server className="h-3.5 w-3.5 text-[#05DF72]" />
              HASHBOARD 2
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-[#05DF72]">
              ACTIVO
            </span>
          </div>
          <div className="text-base font-bold font-mono text-[#05DF72]">{bladeHashrates[1]} TH/s</div>
          <div className="text-[11px] font-mono text-slate-400">{bladeTemps[1].toFixed(1)}°C · 1.28V</div>
        </div>

        <div
          onClick={() => setSelectedBlade(3)}
          className={`p-3 rounded-2xl border transition-all cursor-pointer ${
            selectedBlade === 3
              ? isDarkTheme
                ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                : 'bg-emerald-50 border-emerald-300 text-slate-900'
              : isDarkTheme
              ? 'bg-white/[0.02] border-white/5 text-slate-400 hover:text-white'
              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono mb-1">
            <span className="flex items-center gap-1 font-bold">
              <Server className="h-3.5 w-3.5 text-[#05DF72]" />
              HASHBOARD 3
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-[#05DF72]">
              ACTIVO
            </span>
          </div>
          <div className="text-base font-bold font-mono text-[#05DF72]">{bladeHashrates[2]} TH/s</div>
          <div className="text-[11px] font-mono text-slate-400">{bladeTemps[2].toFixed(1)}°C · 1.28V</div>
        </div>

        <div
          className={`p-3 rounded-2xl border ${
            isDarkTheme ? 'bg-white/[0.02] border-white/5' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono mb-1">
            <span className="flex items-center gap-1 font-bold text-cyan-400">
              <Wind className="h-3.5 w-3.5" />
              TURBINAS DUALES
            </span>
            <span className="text-[10px] font-bold text-cyan-400">{fanRpm} RPM</span>
          </div>
          <div className="text-base font-bold font-mono text-cyan-400">{wattage} W</div>
          <div className="text-[11px] font-mono text-slate-400">{efficiencyJth} J/TH Eficiencia</div>
        </div>
      </div>
    </div>
  );
};
