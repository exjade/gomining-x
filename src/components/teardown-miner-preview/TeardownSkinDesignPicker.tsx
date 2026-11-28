import {
  PRESALE_TEARDOWN_FREE_SKIN_COPY,
  TEARDOWN_PRESALE_DESIGNS,
  type TeardownDesignSpec,
} from './designCatalog'
import './teardownMinerPreview.css'

export interface TeardownSkinDesignPickerProps {
  activeDesign: TeardownDesignSpec
  onSelectDesign: (design: TeardownDesignSpec) => void
}

/**
 * EMBUDO-F2 (SCRUM-334):
 * Presale 10-design selector wired directly to skin -> designId in Mi Miner customizer.
 * Displays free presale skin notice ($0) and never displays +$X pricing.
 */
export function TeardownSkinDesignPicker({
  activeDesign,
  onSelectDesign,
}: TeardownSkinDesignPickerProps) {
  return (
    <section
      className="teardown-skin-picker"
      aria-label="Selector de diseño 3D y skin de preventa"
    >
      <div className="teardown-skin-picker-header">
        <div>
          <p className="teardown-skin-picker-eyebrow">DISEÑO 3D DE PREVENTA · 10 EDICIONES</p>
          <p className="teardown-skin-picker-copy">{PRESALE_TEARDOWN_FREE_SKIN_COPY}</p>
        </div>
        <span className="teardown-skin-picker-active">{activeDesign.name}</span>
      </div>

      <div className="teardown-skin-picker-grid" role="listbox" aria-label="Diseños 3D disponibles">
        {TEARDOWN_PRESALE_DESIGNS.map((design) => {
          const isSelected = design.slug === activeDesign.slug
          return (
            <button
              key={design.slug}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-design-slug={design.slug}
              data-design-id={design.designId}
              data-skin-trait={design.skinTraitId}
              className={`teardown-skin-pill${isSelected ? ' teardown-skin-pill-selected' : ''}`}
              onClick={() => onSelectDesign(design)}
              title={`${design.name} · ${design.subtitle} (Skin ${design.skinLabel} · Gratis)`}
            >
              <span
                className="teardown-skin-pill-dot"
                style={{ backgroundColor: design.accentHex }}
                aria-hidden="true"
              />
              <span className="teardown-skin-pill-text">
                <strong>{design.designId}</strong>
                <small>{design.name.replace(/^V\d+\s+/, '')}</small>
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
