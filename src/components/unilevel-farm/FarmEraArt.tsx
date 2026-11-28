import type { ReactElement } from 'react'

export function FarmLockIcon({ size = 30 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" fill="currentColor" stroke="none" opacity="0.9" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <circle cx="12" cy="15.2" r="1.7" fill="#050505" />
    </svg>
  )
}

export function FarmLockMiniIcon({ size = 15 }: { size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
    </svg>
  )
}

function RigUnit({
  x,
  y,
  scale = 1,
  lit = true,
}: {
  x: number
  y: number
  scale?: number
  lit?: boolean
}): ReactElement {
  const fanColor = lit ? '#34d399' : '#3f3f46'
  const led = lit ? '#34d399' : '#27272a'
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <rect width="34" height="26" rx="5" fill="#0a0a0a" stroke="#10b981" strokeWidth="1.3" />
      <rect x="1.5" y="1.5" width="31" height="23" rx="4" fill="none" stroke="#34d399" strokeWidth="0.6" opacity="0.4" />
      <g className="ufm-fan">
        <circle cx="12" cy="13" r="7" fill="#050505" stroke={fanColor} strokeWidth="1.9" />
        <path d="M12 6v14M5 13h14M7 8l10 10M17 8L7 18" stroke={fanColor} strokeWidth="1.1" opacity="0.85" />
      </g>
      <circle cx="27" cy="7" r="2.1" fill={led} />
      <circle cx="27" cy="7" r="4" fill={led} opacity="0.24" />
      <rect x="23" y="16" width="8" height="3.4" rx="1.2" fill={lit ? '#34d399' : '#18181b'} />
      <rect x="23" y="21" width="8" height="1.6" rx="0.8" fill="#10b981" opacity={lit ? 0.9 : 0.35} />
    </g>
  )
}

function SolarPanelUnit({
  x,
  y,
  scale = 1,
  tilt = -8,
}: {
  x: number
  y: number
  scale?: number
  tilt?: number
}): ReactElement {
  return (
    <>
      <g transform={`translate(${x},${y}) rotate(${tilt}) scale(${scale})`}>
        <rect width="46" height="26" rx="4" fill="#0a0a0a" stroke="#34d399" strokeWidth="1.2" opacity="0.96" />
        <rect x="2" y="2" width="42" height="22" rx="3" fill="#121212" opacity="0.85" />
        <path d="M15 0v26M31 0v26M0 13h46" stroke="#10b981" strokeWidth="0.8" opacity="0.55" />
        <path d="M3 4 L20 4 L10 11 L3 11 Z" fill="#ffffff" opacity="0.12" />
      </g>
      <path
        d={`M${x + 8} ${y + 24} l-4 12 M${x + 38 * scale} ${y + 24} l4 12`}
        stroke="#52525b"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </>
  )
}

function CrystalUnit({ x, y, scale = 1 }: { x: number; y: number; scale?: number }): ReactElement {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`} opacity="0.92">
      <path d="M0 14 L5 0 L10 14 Z" fill="#34d399" />
      <path d="M5 0 L5 14 L0 14 Z" fill="#10b981" opacity="0.78" />
      <circle cx="5" cy="5" r="5" fill="#34d399" opacity="0.22" />
    </g>
  )
}

function StringLightsUnit({ x, y, width }: { x: number; y: number; width: number }): ReactElement {
  const bulbs = [0, 1, 2, 3, 4, 5]
  return (
    <>
      <path
        d={`M${x} ${y} Q ${x + width / 2} ${y + 10} ${x + width} ${y}`}
        stroke="#34d399"
        strokeWidth="1"
        fill="none"
        opacity="0.5"
      />
      {bulbs.map((i) => {
        const cx = x + i * (width / 5)
        const cy = y + (i % 2 ? 5 : 1)
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="1.7" fill="#ffffff" opacity="0.9" />
            <circle cx={cx} cy={cy} r="3.6" fill="#34d399" opacity="0.22" />
          </g>
        )
      })}
    </>
  )
}

function SkyBackdrop({ uid }: { uid: string }): ReactElement {
  return (
    <>
      <defs>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#050505" />
          <stop offset="0.6" stopColor="#0a0a0a" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <linearGradient id={`gnd-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d0d0f" />
          <stop offset="1" stopColor="#050505" />
        </linearGradient>
        <linearGradient id={`bld-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141416" />
          <stop offset="1" stopColor="#0a0a0a" />
        </linearGradient>
        <radialGradient id={`moon-${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="0.55" stopColor="#10b981" stopOpacity="0.16" />
          <stop offset="1" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="340" height="190" fill={`url(#sky-${uid})`} />
      <ellipse cx="292" cy="34" rx="36" ry="30" fill={`url(#moon-${uid})`} opacity="0.65" />
      <circle cx="292" cy="34" r="13" fill="#ffffff" opacity="0.12" />
      <circle cx="292" cy="34" r="8" fill="#ffffff" opacity="0.32" />
      <g fill="#ffffff">
        <circle cx="30" cy="26" r="1.4" opacity="0.65" />
        <circle cx="80" cy="14" r="1.1" opacity="0.45" />
        <circle cx="150" cy="30" r="1.3" opacity="0.55" />
        <circle cx="210" cy="16" r="1" opacity="0.4" />
        <circle cx="255" cy="52" r="1.1" opacity="0.5" />
        <circle cx="52" cy="52" r="1" opacity="0.38" />
        <circle cx="118" cy="52" r="1" opacity="0.35" />
        <circle cx="178" cy="44" r="1.2" opacity="0.45" />
      </g>
      <g opacity="0.55" fill="#121214">
        <ellipse cx="62" cy="42" rx="28" ry="7" />
        <ellipse cx="88" cy="38" rx="18" ry="5" />
      </g>
      <g opacity="0.45" fill="#141418">
        <ellipse cx="238" cy="28" rx="24" ry="6" />
        <ellipse cx="258" cy="25" rx="14" ry="4" />
      </g>
      <rect y="158" width="340" height="32" fill={`url(#gnd-${uid})`} />
      <rect y="158" width="340" height="2" fill="#10b981" opacity="0.55" />
      <g fill="#34d399" opacity="0.45">
        <circle cx="28" cy="170" r="1.5" />
        <circle cx="96" cy="176" r="1.2" />
        <circle cx="188" cy="171" r="1.4" />
        <circle cx="272" cy="177" r="1.2" />
        <circle cx="318" cy="168" r="1.5" />
      </g>
    </>
  )
}

export function FarmEraArt({
  level,
  idPrefix,
  lit = true,
}: {
  level: number
  idPrefix: string
  lit?: boolean
}): ReactElement {
  const uid = `${idPrefix}-L${level}`

  // Era 1: Basic (1..5)
  if (level <= 5) {
    return (
      <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <SkyBackdrop uid={uid} />
        <path d="M52 160 L66 104 h76 l14 56 Z" fill="#08080a" />
        <rect x="66" y="104" width="76" height="56" rx="4" fill={`url(#bld-${uid})`} stroke="#10b981" strokeWidth="1.4" />
        <rect x="70" y="108" width="68" height="48" rx="3" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.16" />
        <path d="M54 108 L104 70 L154 108 Z" fill="#121214" stroke="#34d399" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M62 104 L104 76 L146 104" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.22" />
        {level >= 4 && (
          <>
            <path d="M96 62v-24M88 44l8-6 8 6" stroke="#52525b" strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <circle cx="96" cy="36" r="3.2" fill="#34d399" className="ufm-beacon" />
            <circle cx="96" cy="36" r="7" fill="none" stroke="#10b981" strokeWidth="1" opacity="0.5" className="ufm-beacon" />
          </>
        )}
        {level >= 2 && <StringLightsUnit x={62} y={102} width={84} />}
        <rect x="94" y="126" width="20" height="34" rx="3" fill="#050505" stroke="#10b981" />
        <circle cx="110" cy="143" r="1.6" fill="#34d399" />
        <rect x="76" y="112" width="14" height="12" rx="2" fill="#10b981" opacity="0.82" />
        <rect x="76" y="112" width="14" height="12" rx="2" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.35" />
        <rect x="120" y="112" width="14" height="12" rx="2" fill="#34d399" opacity="0.45" />
        <RigUnit x={160} y={130} scale={1.05} lit={lit} />
        {level >= 3 && <RigUnit x={196} y={128} scale={1} lit={lit} />}
        <SolarPanelUnit x={238} y={122} scale={0.95} tilt={-8} />
        {level >= 5 && <SolarPanelUnit x={238} y={116} scale={0.8} tilt={-8} />}
        <CrystalUnit x={22} y={142} scale={0.9} />
        <CrystalUnit x={306} y={144} scale={0.7} />
        <path d="M20 168 q30 -6 60 0 t60 0 t60 0 t60 0 t60 0" stroke="#1f2937" strokeWidth="2" fill="none" opacity="0.55" />
      </svg>
    )
  }

  // Era 2: Industrial (6..10)
  if (level <= 10) {
    const rigCount = 3 + Math.min(2, level - 6)
    return (
      <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <SkyBackdrop uid={uid} />
        <rect x="228" y="92" width="86" height="38" rx="6" fill="#121214" stroke="#34d399" strokeWidth="1.4" />
        <path d="M238 92v38M256 92v38M274 92v38M292 92v38" stroke="#050505" strokeWidth="3.2" />
        <rect x="232" y="96" width="78" height="5" rx="2" fill="#ffffff" opacity="0.14" />
        {level >= 8 && (
          <>
            <rect x="238" y="58" width="72" height="30" rx="6" fill="#0e0e11" stroke="#10b981" strokeWidth="1.4" />
            <path d="M246 58v30M262 58v30M278 58v30M294 58v30" stroke="#050505" strokeWidth="3" />
            <rect x="242" y="62" width="64" height="4" rx="2" fill="#34d399" opacity="0.32" />
          </>
        )}
        <rect x="20" y="96" width="120" height="34" rx="6" fill="#0f0f12" stroke="#10b981" strokeWidth="1.4" />
        <path d="M34 96v34M54 96v34M74 96v34M94 96v34M114 96v34" stroke="#050505" strokeWidth="3.2" />
        <rect x="24" y="100" width="112" height="4" rx="2" fill="#ffffff" opacity="0.14" />
        <g className="ufm-fan ufm-fan--slow">
          <circle cx="176" cy="104" r="15" fill="#050505" stroke="#34d399" strokeWidth="2.2" />
          <path d="M176 89v30M161 104h30M165 93l22 22M187 93l-22 22" stroke="#34d399" strokeWidth="1.6" opacity="0.9" />
        </g>
        <rect x="172" y="120" width="8" height="12" rx="2" fill="#18181b" />
        <StringLightsUnit x={18} y={88} width={120} />
        {Array.from({ length: rigCount }, (_, i) => (
          <RigUnit key={i} x={24 + i * 40} y={128} scale={0.92} lit={lit} />
        ))}
        <SolarPanelUnit x={258} y={128} scale={0.8} tilt={-6} />
        <CrystalUnit x={214} y={144} scale={0.8} />
        {level >= 9 && (
          <g stroke="#52525b" strokeWidth="2.2" strokeLinecap="round">
            <path d="M8 158v-14M44 158v-14M80 158v-14M116 158v-14M152 158v-14M188 158v-14M224 158v-14M260 158v-14M296 158v-14M332 158v-14" />
            <path d="M4 150h332" strokeWidth="1.4" opacity="0.65" />
          </g>
        )}
      </svg>
    )
  }

  // Era 3: High-Tech (11..15)
  if (level <= 15) {
    return (
      <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <SkyBackdrop uid={uid} />
        <path d="M36 158 V84 L120 58 L204 84 V158 Z" fill="#0c0c0f" stroke="#34d399" strokeWidth="1.4" />
        <path d="M36 158 V84 L120 58 L204 84 V158" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.2" />
        <path d="M36 96 L204 96" stroke="#10b981" strokeWidth="1" opacity="0.55" />
        <rect x="52" y="70" width="136" height="14" rx="4" fill="#10b981" opacity="0.22" />
        <rect x="52" y="70" width="136" height="14" rx="4" fill="none" stroke="#34d399" strokeWidth="0.7" opacity="0.4" />
        <g fill="#34d399">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <rect key={i} x={56 + i * 24} y={126} width={14} height={20} rx={2} opacity={0.25 + (i % 3) * 0.2} />
          ))}
        </g>
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={52 + i * 26} y={112} width={16} height={6} rx={3} fill="#34d399" opacity={0.35 + i * 0.14} />
        ))}
        <path d="M222 158 l7-64 h24 l7 64 Z" fill="#121215" stroke="#10b981" strokeWidth="1.4" />
        <ellipse cx="241" cy="92" rx="15" ry="4.5" fill="#18181b" />
        <g className="ufm-steam">
          <ellipse cx="241" cy="78" rx="10" ry="5" fill="#ffffff" opacity="0.32" />
          <ellipse cx="248" cy="66" rx="7" ry="3.6" fill="#34d399" opacity="0.24" />
        </g>
        {level >= 13 && (
          <>
            <path d="M262 158 l6-52 h22 l6 52 Z" fill="#121215" stroke="#10b981" strokeWidth="1.4" />
            <ellipse cx="279" cy="104" rx="13" ry="4" fill="#18181b" />
            <g className="ufm-steam">
              <ellipse cx="279" cy="92" rx="9" ry="4.5" fill="#ffffff" opacity="0.3" />
            </g>
          </>
        )}
        {level >= 14 && <SolarPanelUnit x={24} y={128} scale={0.8} tilt={-10} />}
        <SolarPanelUnit x={268} y={130} scale={0.9} tilt={-8} />
        <CrystalUnit x={18} y={140} scale={1} />
        <CrystalUnit x={312} y={138} scale={0.85} />
        <RigUnit x={120} y={132} scale={0.9} lit={lit} />
      </svg>
    )
  }

  // Era 4: Mega Farm (16..20)
  const windowCells: Array<{ r: number; c: number }> = []
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 5; c += 1) {
      windowCells.push({ r, c })
    }
  }

  return (
    <svg viewBox="0 0 340 190" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <SkyBackdrop uid={uid} />
      <rect x="30" y="70" width="118" height="88" rx="8" fill="#0d0d10" stroke="#10b981" strokeWidth="1.5" />
      <rect x="34" y="74" width="110" height="80" rx="6" fill="none" stroke="#ffffff" strokeWidth="0.7" opacity="0.18" />
      {windowCells.map(({ r, c }) => (
        <rect
          key={`${r}-${c}`}
          x={46 + c * 17}
          y={92 + r * 18}
          width={10}
          height={9}
          rx={2}
          fill={(r + c) % 3 ? '#34d399' : '#ffffff'}
          opacity={0.28 + ((r * 5 + c) % 4) * 0.14}
        />
      ))}
      <path d="M84 70 V30" stroke="#52525b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="84" cy="26" r="5" fill="#34d399" className="ufm-beacon" />
      <circle cx="84" cy="26" r="12" fill="none" stroke="#34d399" strokeWidth="1" opacity="0.45" className="ufm-beacon" />
      <circle cx="84" cy="26" r="19" fill="none" stroke="#10b981" strokeWidth="0.7" opacity="0.22" className="ufm-beacon" />
      <rect x="156" y="96" width="66" height="62" rx="7" fill="#121215" stroke="#10b981" strokeWidth="1.4" />
      <g fill="#34d399">
        {[0, 1, 2].map((i) => (
          <rect key={i} x={166 + i * 18} y={108} width={11} height={14} rx={2} opacity={0.35 + i * 0.16} />
        ))}
      </g>
      <path d="M238 158 l6-46 h20 l6 46 Z" fill="#141418" stroke="#10b981" />
      <g className="ufm-steam">
        <ellipse cx="254" cy="100" rx="9" ry="4.4" fill="#ffffff" opacity="0.3" />
      </g>
      {level >= 18 && (
        <>
          <path d="M232 108 a34 26 0 0 1 68 0 Z" fill="#121215" stroke="#34d399" strokeWidth="1.3" />
          <path d="M240 102 a26 18 0 0 1 18-12" stroke="#ffffff" strokeWidth="1.4" fill="none" opacity="0.35" strokeLinecap="round" />
          <circle cx="266" cy="86" r="3.4" fill="#34d399" className="ufm-beacon" />
        </>
      )}
      <StringLightsUnit x={28} y={62} width={120} />
      <SolarPanelUnit x={16} y={132} scale={0.75} tilt={-8} />
      <SolarPanelUnit x={282} y={134} scale={0.75} tilt={-8} />
      <CrystalUnit x={148} y={142} scale={0.9} />
      <CrystalUnit x={224} y={144} scale={0.75} />
      <RigUnit x={160} y={134} scale={0.85} lit={lit} />
      <RigUnit x={196} y={134} scale={0.85} lit={lit} />
    </svg>
  )
}
