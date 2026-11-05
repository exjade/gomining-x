import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDemoSession, updateDemoMinerCustomization, type MinerCustomization, type DemoMiner } from './demoStore'
import { startMiningSimulation } from './miningSimulation'

type CustomizerTab = 'Wall' | 'Body' | 'Bottom' | 'Fans' | 'Screen' | 'Buttons' | 'Top' | 'Stickers'

const COLOR_PALETTES = [
  { name: 'Royal Purple', hex: '#7c3aed' },
  { name: 'Cyber Bronze', hex: '#92400e' },
  { name: 'Matrix Emerald', hex: '#059669' },
  { name: 'Deep Forest', hex: '#065f46' },
  { name: 'GoMining Gold', hex: '#d97706' },
  { name: 'Titanium Silver', hex: '#94a3b8' },
  { name: 'Midnight Violet', hex: '#4c1d95' },
  { name: 'Obsidian Black', hex: '#0f172a' },
  { name: 'Crimson Ruby', hex: '#991b1b' },
  { name: 'Electric Azure', hex: '#2563eb' },
  { name: 'Cyberpunk Pink', hex: '#db2777' },
  { name: 'Pure White', hex: '#f8fafc' },
]

const SCREEN_EXPRESSIONS = [
  { id: 'smile', label: 'Sonrisa', glow: '#22c55e' },
  { id: 'grin', label: 'Alegre', glow: '#10b981' },
  { id: 'focus', label: 'Minando', glow: '#3b82f6' },
  { id: 'gold', label: 'VIP Gold', glow: '#f59e0b' },
  { id: 'turbo', label: 'Overclock', glow: '#ec4899' },
]

export function MinerCustomizer() {
  const { minerId } = useParams<{ minerId?: string }>()
  const navigate = useNavigate()
  const demo = useDemoSession()

  const miner: DemoMiner = demo.miners.find((m) => m.id === minerId) ?? demo.miners[0] ?? {
    id: minerId ?? 'bonus-miner-default',
    name: 'Bonus miner #5422372',
    powerTh: 0.0281,
    efficiency: 12,
    price: 0,
    purchaseMode: 'once',
    acquiredAt: new Date().toISOString(),
    workerId: 'worker-bonus',
  }

  const [activeTab, setActiveTab] = useState<CustomizerTab>('Wall')
  const [customization, setCustomization] = useState<MinerCustomization>(() => miner.customization ?? {
    wallColor: '#7c3aed',
    bodyColor: '#1e1b4b',
    bottomColor: '#e2e8f0',
    fansColor: '#1e293b',
    screenColor: '#22c55e',
    buttonsColor: '#64748b',
    topColor: '#0f172a',
    stickers: 'gomining-classic',
    updatedAt: new Date().toISOString(),
  })

  const [selectedScreenMode, setSelectedScreenMode] = useState('smile')
  const [savedSuccess, setSavedSuccess] = useState(false)

  const handleColorChange = (hex: string) => {
    setCustomization((prev) => {
      switch (activeTab) {
        case 'Wall': return { ...prev, wallColor: hex }
        case 'Body': return { ...prev, bodyColor: hex }
        case 'Bottom': return { ...prev, bottomColor: hex }
        case 'Fans': return { ...prev, fansColor: hex }
        case 'Screen': return { ...prev, screenColor: hex }
        case 'Buttons': return { ...prev, buttonsColor: hex }
        case 'Top': return { ...prev, topColor: hex }
        default: return prev
      }
    })
  }

  const handleSave = () => {
    updateDemoMinerCustomization(miner.id, {
      ...customization,
      updatedAt: new Date().toISOString(),
    })
    startMiningSimulation(miner.id, miner.name, miner.powerTh)
    setSavedSuccess(true)
    setTimeout(() => {
      navigate('/nft-miners')
    }, 1200)
  }

  const activeColor = (() => {
    switch (activeTab) {
      case 'Wall': return customization.wallColor
      case 'Body': return customization.bodyColor
      case 'Bottom': return customization.bottomColor
      case 'Fans': return customization.fansColor
      case 'Screen': return customization.screenColor
      case 'Buttons': return customization.buttonsColor
      case 'Top': return customization.topColor
      default: return '#7c3aed'
    }
  })()

  return (
    <div className="miner-customizer-page">
      {/* Top Header */}
      <div className="customizer-topbar">
        <button type="button" className="customizer-back-button" onClick={() => navigate('/nft-miners')}>
          <span className="back-arrow">‹</span> Volver
        </button>
        <div className="customizer-miner-title">
          <h2>{miner.name}</h2>
          <div className="customizer-badges">
            <span className="pill-badge pill-power">⚡ {miner.powerTh.toFixed(4)} TH</span>
            <span className="pill-badge pill-efficiency">🔌 {miner.efficiency} W/TH</span>
          </div>
        </div>
        <button type="button" className="button button-primary customizer-save-button" onClick={handleSave}>
          {savedSuccess ? '¡Guardado! ✓' : 'Guardar y Minar'}
        </button>
      </div>

      {/* Main 3D / Illustration Stage */}
      <div className="customizer-stage">
        <div className="miner-avatar-viewport">
          <svg
            viewBox="0 0 400 420"
            className="miner-robot-svg"
            role="img"
            aria-label="Minero digital GoMining personalizable"
          >
            {/* Background Glow */}
            <circle cx="200" cy="220" r="140" fill={customization.wallColor} opacity="0.15" filter="blur(30px)" />

            {/* Antennas / Top */}
            <line x1="160" y1="90" x2="140" y2="40" stroke={customization.topColor} strokeWidth="6" strokeLinecap="round" />
            <circle cx="140" cy="40" r="12" fill={customization.topColor} />
            <circle cx="140" cy="40" r="6" fill="#38bdf8" opacity="0.8" />

            <line x1="240" y1="90" x2="260" y2="40" stroke={customization.topColor} strokeWidth="6" strokeLinecap="round" />
            <circle cx="260" cy="40" r="12" fill={customization.topColor} />
            <circle cx="260" cy="40" r="6" fill="#38bdf8" opacity="0.8" />

            {/* Base / Bottom Heatsink */}
            <path
              d="M 100 320 L 300 320 L 320 370 L 80 370 Z"
              fill={customization.bottomColor}
              stroke="#0f172a"
              strokeWidth="3"
            />
            {/* Heatsink Fins */}
            <line x1="120" y1="330" x2="110" y2="365" stroke="#334155" strokeWidth="4" />
            <line x1="150" y1="330" x2="145" y2="365" stroke="#334155" strokeWidth="4" />
            <line x1="180" y1="330" x2="180" y2="365" stroke="#334155" strokeWidth="4" />
            <line x1="210" y1="330" x2="215" y2="365" stroke="#334155" strokeWidth="4" />
            <line x1="240" y1="330" x2="250" y2="365" stroke="#334155" strokeWidth="4" />
            <line x1="270" y1="330" x2="285" y2="365" stroke="#334155" strokeWidth="4" />

            {/* Outer Wall Chassis (3D Perspective Block) */}
            <path
              d="M 100 90 L 300 90 L 340 130 L 340 320 L 100 320 Z"
              fill={customization.wallColor}
              stroke="#0f172a"
              strokeWidth="4"
            />
            {/* Perspective Side Shading */}
            <path
              d="M 300 90 L 340 130 L 340 320 L 300 320 Z"
              fill="rgba(0, 0, 0, 0.28)"
            />
            {/* GoMining Logo on Side */}
            <text x="318" y="240" fill="#ffffff" opacity="0.85" fontSize="14" fontWeight="bold" transform="rotate(-90 318,240)">
              gomining
            </text>

            {/* Front Body Bezel */}
            <rect
              x="110"
              y="100"
              width="180"
              height="210"
              rx="16"
              fill={customization.bodyColor}
              stroke="#0f172a"
              strokeWidth="4"
            />

            {/* Digital Screen Frame */}
            <rect
              x="125"
              y="115"
              width="150"
              height="115"
              rx="10"
              fill="#052e16"
              stroke="#14532d"
              strokeWidth="3"
            />
            {/* Scanline CRT texture */}
            <rect x="125" y="115" width="150" height="115" rx="10" fill="url(#scanline)" opacity="0.2" />

            {/* Digital Pixel Smile Expression */}
            <g fill={customization.screenColor}>
              {/* Eyes */}
              <rect x="150" y="140" width="16" height="24" rx="4" />
              <rect x="234" y="140" width="16" height="24" rx="4" />
              {/* Smile Curve */}
              <path
                d="M 152 185 Q 200 220 248 185 L 244 195 Q 200 230 156 195 Z"
              />
            </g>

            {/* Twin Cooling Fans */}
            {/* Left Fan */}
            <circle cx="155" cy="265" r="24" fill={customization.fansColor} stroke="#0f172a" strokeWidth="3" />
            <circle cx="155" cy="265" r="8" fill="#475569" />
            <path d="M 155 243 A 22 22 0 0 1 175 258 L 155 265 Z" fill="#64748b" opacity="0.7" />
            <path d="M 175 272 A 22 22 0 0 1 155 287 L 155 265 Z" fill="#64748b" opacity="0.7" />
            <path d="M 135 258 A 22 22 0 0 1 155 243 L 155 265 Z" fill="#64748b" opacity="0.7" />

            {/* Right Fan */}
            <circle cx="245" cy="265" r="24" fill={customization.fansColor} stroke="#0f172a" strokeWidth="3" />
            <circle cx="245" cy="265" r="8" fill="#475569" />
            <path d="M 245 243 A 22 22 0 0 1 265 258 L 245 265 Z" fill="#64748b" opacity="0.7" />
            <path d="M 265 272 A 22 22 0 0 1 245 287 L 245 265 Z" fill="#64748b" opacity="0.7" />
            <path d="M 225 258 A 22 22 0 0 1 245 243 L 245 265 Z" fill="#64748b" opacity="0.7" />

            {/* Knobs / Control Buttons */}
            <circle cx="200" cy="255" r="5" fill={customization.buttonsColor} />
            <circle cx="200" cy="275" r="5" fill={customization.buttonsColor} />
          </svg>
        </div>
      </div>

      {/* Customizer Tabs & Swatches Bar */}
      <div className="customizer-controls-card">
        {/* Navigation Tabs */}
        <div className="customizer-tabs-nav" role="tablist">
          {(['Wall', 'Body', 'Bottom', 'Fans', 'Screen', 'Buttons', 'Top', 'Stickers'] as CustomizerTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              className={`customizer-tab-btn ${activeTab === tab ? 'customizer-tab-btn-active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'Wall' ? 'Carcasa' :
               tab === 'Body' ? 'Frente' :
               tab === 'Bottom' ? 'Base' :
               tab === 'Fans' ? 'Ventiladores' :
               tab === 'Screen' ? 'Pantalla' :
               tab === 'Buttons' ? 'Botones' :
               tab === 'Top' ? 'Antenas' : 'Stickers'}
            </button>
          ))}
        </div>

        {/* Swatches Grid */}
        <div className="customizer-swatches-grid">
          {activeTab === 'Screen' ? (
            <div className="customizer-screen-options">
              {SCREEN_EXPRESSIONS.map((expr) => (
                <button
                  key={expr.id}
                  type="button"
                  className={`screen-expr-chip ${selectedScreenMode === expr.id ? 'screen-expr-chip-active' : ''}`}
                  onClick={() => {
                    setSelectedScreenMode(expr.id)
                    handleColorChange(expr.glow)
                  }}
                >
                  <span className="expr-glow-dot" style={{ backgroundColor: expr.glow }} />
                  {expr.label}
                </button>
              ))}
            </div>
          ) : (
            COLOR_PALETTES.map((color) => {
              const isSelected = activeColor.toLowerCase() === color.hex.toLowerCase()
              return (
                <button
                  key={color.name}
                  type="button"
                  className={`swatch-button ${isSelected ? 'swatch-button-selected' : ''}`}
                  style={{ backgroundColor: color.hex }}
                  title={color.name}
                  onClick={() => handleColorChange(color.hex)}
                  aria-label={color.name}
                >
                  {isSelected && <span className="swatch-check">✓</span>}
                </button>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
