import { useMemo } from 'react'
import {
  DEFAULT_TEARDOWN_DESIGN,
  TEARDOWN_PRESALE_DESIGNS,
  getTeardownDesignById,
  type TeardownDesignSpec,
} from '../teardown-miner-preview/designCatalog'
import './builderLandingTheme.css'

export function resolveBuilderDesignSpec(slugOrId?: string | null): TeardownDesignSpec {
  return getTeardownDesignById(slugOrId) ?? DEFAULT_TEARDOWN_DESIGN
}

export interface BuilderSkinShowcaseProps {
  selectedSkin: string
  powerTh: number
  priceUsd: number
  productName: string
  onSelectDesign: (design: TeardownDesignSpec) => void
}

/**
 * EMBUDO-BUILDER-CORRECCIONES:
 * Strictly 2D Skin Selector for MinerBuilderDialog (10 presale skins v01-scorpion .. v10-nova).
 * No 3D simulator is mounted inside the funnel builder —
 * per EMBUDO-F2 (SCRUM-334), the live 3D teardown simulator lives exclusively in Mi Miner (detail + editor).
 */
export function BuilderSkinShowcase({
  selectedSkin,
  powerTh,
  priceUsd,
  productName,
  onSelectDesign,
}: BuilderSkinShowcaseProps) {
  const activeDesign = useMemo(
    () => resolveBuilderDesignSpec(selectedSkin),
    [selectedSkin],
  )

  const formattedPrice = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(priceUsd),
    [priceUsd],
  )

  return (
    <div
      className="builder-skin-showcase"
      data-testid="builder-skin-showcase"
      data-selected-skin={activeDesign.slug}
    >
      {/* Selected 2D Skin Spotlight (Strictly 2D image — 3D sim unlocks in Mi Miner) */}
      <section
        className="builder-skin-hero-2d"
        aria-label="Vista previa 2D de la skin seleccionada"
        data-testid="builder-skin-2d-preview"
      >
        <div className="builder-skin-hero-head">
          <div className="builder-skin-hero-identity">
            <span
              className="builder-skin-accent-dot"
              style={{ backgroundColor: activeDesign.accentHex }}
              aria-hidden="true"
            />
            <div className="builder-skin-hero-titles">
              <strong className="builder-skin-hero-name">{activeDesign.name}</strong>
              <span className="builder-skin-hero-sub">{activeDesign.subtitle}</span>
            </div>
          </div>
          <span className="builder-skin-free-pill">Skin 2D · Gratis ($0)</span>
        </div>

        <div className="builder-skin-hero-stage">
          <img
            key={activeDesign.slug}
            src={activeDesign.thumbnailPath}
            alt={`${activeDesign.name} — ${activeDesign.subtitle} (${productName})`}
            className="builder-skin-hero-img"
            loading="eager"
          />
        </div>

        <div className="builder-skin-hero-foot">
          <span className="builder-skin-hero-spec">
            {powerTh.toLocaleString('es-MX')} TH/s · {formattedPrice}
          </span>
          <span className="builder-skin-hero-note">
            Vista 2D · El sim 3D en vivo se abre al activar en Mi Miner
          </span>
        </div>
      </section>

      {/* 10 Presale 2D Skin Thumbnails (v01-scorpion .. v10-nova) */}
      <section
        className="builder-skin-picker-card"
        aria-label="Selector de skin 2D del minero"
        data-testid="builder-skin-grid-section"
      >
        <div className="builder-skin-picker-head">
          <div>
            <span className="builder-skin-eyebrow">SELECTOR DE SKIN 2D · 10 EDICIONES</span>
            <p className="builder-skin-subtitle">
              Elige tu diseño 2D de preventa (gratis · $0). Se guardará en tu compra y se activará en Mi Miner.
            </p>
          </div>
          <span className="builder-skin-selected-pill" data-testid="builder-selected-skin-label">
            <span
              className="builder-skin-accent-dot"
              style={{ backgroundColor: activeDesign.accentHex }}
              aria-hidden="true"
            />
            {activeDesign.name}
          </span>
        </div>

        <div
          className="builder-skin-thumb-grid"
          role="listbox"
          aria-label="Skins 2D disponibles de preventa"
        >
          {TEARDOWN_PRESALE_DESIGNS.map((design) => {
            const isSelected = design.slug === activeDesign.slug
            const shortName = design.name.replace(/^V\d+\s+/, '')
            return (
              <button
                key={design.slug}
                type="button"
                role="option"
                aria-selected={isSelected}
                data-skin-slug={design.slug}
                data-design-id={design.designId}
                data-skin-trait={design.skinTraitId}
                className={`builder-skin-thumb-btn${isSelected ? ' builder-skin-thumb-btn-active' : ''}`}
                onClick={() => onSelectDesign(design)}
                title={`${design.name} · ${design.subtitle} (Gratis por preventa · $0)`}
              >
                <span className="builder-skin-thumb-frame">
                  <img
                    src={design.thumbnailPath}
                    alt={`${design.name} — ${design.subtitle}`}
                    className="builder-skin-thumb-img"
                    loading="eager"
                  />
                  {isSelected && (
                    <span
                      className="builder-skin-thumb-check"
                      data-testid="builder-skin-selected-check"
                      aria-label="Skin seleccionada"
                    >
                      ✓
                    </span>
                  )}
                </span>
                <span className="builder-skin-thumb-meta">
                  <span className="builder-skin-thumb-code">
                    <i
                      className="builder-skin-thumb-dot"
                      style={{ backgroundColor: design.accentHex }}
                      aria-hidden="true"
                    />
                    {design.designId}
                  </span>
                  <span className="builder-skin-thumb-name">{shortName}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
