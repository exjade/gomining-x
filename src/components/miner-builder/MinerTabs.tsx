export type MinerCategoryTab = 'packages' | 'presale' | 'launch' | 'monthly'

const tabs: Array<{ id: MinerCategoryTab; label: string }> = [
  { id: 'packages', label: 'Paquetes MinerX' },
  { id: 'presale', label: 'Preventa' },
  { id: 'launch', label: 'Lanzamiento' },
  { id: 'monthly', label: 'Mensual' },
]

export function MinerTabs({ activeTab, onChange, visibleTabs }: {
  activeTab: MinerCategoryTab
  onChange: (tab: MinerCategoryTab) => void
  visibleTabs: MinerCategoryTab[]
}) {
  return (
    <div className="miner-builder-tabs" role="tablist" aria-label="Modalidades de compra">
      {tabs.filter((tab) => visibleTabs.includes(tab.id)).map((tab) => (
        <button
          key={tab.id}
          type="button"
          id={`miner-tab-${tab.id}`}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls="miner-option-panel"
          className={activeTab === tab.id ? 'miner-builder-tab-active' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
