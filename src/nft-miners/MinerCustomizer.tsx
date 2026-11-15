import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import type { StoredMiner } from '../firebase'
import { usePersonalization } from '../personalization'
import { subscribeToSingleMinerDoc } from '../userMinersStore'
import { LockedTraitModal } from './LockedTraitModal'
import { MinerAppearancePreview } from './MinerAppearancePreview'
import { derivedDemoBlockedDetail } from './derived-demo-recolor'
import { getActiveProgressProvider, getDevUnlockRules, type PieceAccessRule } from './unlock-engine'
import { EXPLICIT_NONE_APPEARANCE, getTraitAccess } from './appearance'
import { getPaginationItems } from './pagination'
import { appearanceCategoriesFromCatalog, useCustomizationCatalog } from './catalog-repository'
import { unlockRulesFromCatalog } from './catalog-unlocks'
import type { CustomizationCatalog } from './catalog-contract'
import { customizationMinerFromStored, type MinerCustomizationMiner } from './miner-customization-model'
import { saveOwnedMinerAppearance } from './miner-customization-repository'
import { DEV_PARITY_UID, getDevParityMiner } from './dev-parity-miners'
import {
  MINER_APPEARANCE_PAGE_SIZE,
  MINER_APPEARANCE_TRAIT_BY_ID,
  appearanceDraftFromSaved,
  getAppearancePageCount,
  getTraitStatus,
  isMinerAppearanceDirty,
  isTraitLocked,
  minerAppearanceFromDraft,
  selectAppearanceTrait,
  validateAppearanceDraft,
  TRAIT_PRESENTATION_BY_ID,
  type AppearancePart,
  type Trait,
  type MinerAppearance,
  type MinerAppearanceDraft,
} from './appearance'
import './miner-customization.css'

const DETAIL_TABS = ['tasks', 'appearance', 'upgrades', 'properties'] as const
type DetailTab = typeof DETAIL_TABS[number]
type TaskFilter = 'active' | 'inactive'

export function MinerCustomizer() {
  const location = useLocation()
  const { t } = usePersonalization()
  const { user } = useAuth()
  const { catalog, error } = useCustomizationCatalog(location.search, location.pathname)
  const normalizedPath = location.pathname.replace(/\/+$/, '')
  const routeMatch = normalizedPath.match(/^\/(?:nft-)?miners\/([^/]+)(?:\/customize)?$/)
  const minerId = routeMatch ? decodeURIComponent(routeMatch[1]) : ''
  const isCustomizeRoute = normalizedPath.endsWith('/customize')
  const parityMiner = getDevParityMiner(location.search, minerId)
  const uid = user && !user.isAnonymous ? user.uid : parityMiner ? DEV_PARITY_UID : ''
  const [storedMiner, setStoredMiner] = useState<StoredMiner | null>(null)
  const [lookupState, setLookupState] = useState<'loading' | 'found' | 'missing'>('loading')

  useEffect(() => {
    if (parityMiner) {
      setStoredMiner(null)
      setLookupState('found')
      return
    }
    if (!routeMatch || !uid || !minerId) {
      setStoredMiner(null)
      setLookupState('missing')
      return
    }
    setLookupState('loading')
    return subscribeToSingleMinerDoc(uid, minerId, (nextMiner) => {
      setStoredMiner(nextMiner)
      setLookupState(nextMiner ? 'found' : 'missing')
    })
  }, [minerId, parityMiner?.id, uid])

  if (!routeMatch || !uid) return <MinerNotFound />
  if (lookupState === 'loading') return <MinerLoading />
  if (!storedMiner && !parityMiner) return <MinerNotFound />
  const miner = parityMiner ?? customizationMinerFromStored(storedMiner!)
  const saveAppearance = parityMiner
    ? async (_targetId: string, _appearance: MinerAppearance) => {}
    : (targetId: string, appearance: MinerAppearance) => saveOwnedMinerAppearance(uid, targetId, appearance)
  return <>
    {error && <p className="pwm-catalog-error" role="alert">{t('minerCustomization.catalogUnavailable')}</p>}
    {isCustomizeRoute ? <CustomizeMiner miner={miner} catalog={catalog} saveAppearance={saveAppearance} /> : <MinerDetails miner={miner} catalog={catalog} />}
  </>
}

function MinerLoading() {
  return <section className="pwm-miner-flow pwm-miner-not-found"><p>Cargando minero...</p></section>
}

function MinerNotFound() {
  const { t } = usePersonalization()
  return (
    <section className="pwm-miner-flow pwm-miner-not-found">
      <h1>{t('minerCustomization.minerNotFound')}</h1>
      <Link className="pwm-button pwm-button-primary" to="/nft-miners">{t('minerCustomization.backToMiners')}</Link>
    </section>
  )
}
function MinerDetails({ miner, catalog }: { miner: MinerCustomizationMiner; catalog: CustomizationCatalog }) {
  const { t } = usePersonalization()
  const [activeTab, setActiveTab] = useState<DetailTab>('tasks')
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('active')
  const detailTabButtons = useRef<Array<HTMLButtonElement | null>>([])
  const appearance = miner.appearance
  const appearanceCategories = appearanceCategoriesFromCatalog(catalog)
  const purchasedTraitValues = (category: 'display' | 'items') => (miner.traits?.purchased ?? [])
    .map((traitId) => MINER_APPEARANCE_TRAIT_BY_ID.get(traitId))
    .filter((trait): trait is Trait => trait?.category === category)
    .map((trait) => trait.value)
    .join(', ') || '—'
  const purchasedTraitIds = (miner.traits?.purchased ?? []).join(', ') || '—'
  const selectDetailTab = (tab: DetailTab, index: number) => {
    setActiveTab(tab)
    detailTabButtons.current[index]?.focus()
  }
  const handleDetailTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + direction + DETAIL_TABS.length) % DETAIL_TABS.length
    selectDetailTab(DETAIL_TABS[nextIndex], nextIndex)
  }

  return (
    <section className="pwm-miner-flow pwm-detail-flow">
      <Link className="pwm-back-link" to="/nft-miners"><span aria-hidden="true">‹</span> {t('common.back').replace(/^←\s*/, '')}</Link>
      <div className="pwm-miner-detail-layout">
        <div className="pwm-detail-art-panel">
          <MinerAppearancePreview miner={miner} appearanceOverride={appearanceDraftFromSaved(miner.appearance)} catalogOverride={catalog} />
          <div className="pwm-detail-art-actions">
            <Link className="pwm-button pwm-button-primary" to={`/nft-miners/${encodeURIComponent(miner.id)}/customize`}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5M4 20l4.2-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.2 16 4 20Zm9.6-13.6 3 3M3 5h4M5 3v4" /></svg>{t('minerCustomization.customize')}</Link>
            <button className="pwm-button pwm-button-muted" type="button" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 14.4 5l3.5-.1.4 3.5 2.8 2.1-1.5 3.2 1.1 3.4-3.2 1.4-1.7 3.1-3.4-1.1-3.4 1.1-1.7-3.1-3.2-1.4 1.1-3.4-1.5-3.2 2.8-2.1.4-3.5 3.5.1L12 2.5Z"/><path d="m9 15 6-6m-4.7.2h.1m2.4 5.6h.1" /></svg>{t('minerCustomization.applyPromoCode')}</button>
          </div>
        </div>
        <div className="pwm-miner-detail-content">
          <div className="pwm-detail-title-row">
            <div>
              <p className="pwm-brand-label">Pouwminers</p>
              <h1>{miner.name}</h1>
              <span className="pwm-detail-miner-id">#{miner.id}</span>
            </div>
            <button className="pwm-icon-button" type="button" disabled aria-label={t('minerCustomization.share')} title={t('minerCustomization.share')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" /></svg></button>
          </div>
          <div className="pwm-miner-stats">
            <div><span className="pwm-stat-icon pwm-stat-power"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.7 2 5.5 13h5.3L10.1 22 19 10.4h-5.4L13.7 2Z" /></svg></span><span><small>{t('minerCustomization.power').toUpperCase()}</small><strong>{miner.powerTh.toFixed(4)} TH</strong></span></div>
            <div><span className="pwm-stat-icon pwm-stat-efficiency"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v7M16 2v7M6 9h12v3a6 6 0 0 1-5 5.9V22h-2v-4.1A6 6 0 0 1 6 12V9Z" /></svg></span><span><small>{t('minerCustomization.efficiency').toUpperCase()}</small><strong>{miner.efficiency} W/TH</strong></span></div>
          </div>
          <section className="pwm-detail-content-card">
            <div className="pwm-detail-tabs" role="tablist" aria-label={t('minerCustomization.detailTabs')}>
              {DETAIL_TABS.map((tab, index) => (
                <button
                  ref={(element) => { detailTabButtons.current[index] = element }}
                  key={tab}
                  type="button"
                  role="tab"
                  id={`pwm-detail-tab-${tab}`}
                  aria-selected={activeTab === tab}
                  aria-controls="pwm-detail-tabpanel"
                  tabIndex={activeTab === tab ? 0 : -1}
                  className={activeTab === tab ? 'pwm-detail-tab pwm-detail-tab-active' : 'pwm-detail-tab'}
                  onClick={() => selectDetailTab(tab, index)}
                  onKeyDown={(event) => handleDetailTabKey(event, index)}
                >{t(`minerCustomization.detail.${tab}`)}</button>
              ))}
            </div>
            <div id="pwm-detail-tabpanel" className="pwm-detail-appearance-body" role="tabpanel" aria-labelledby={`pwm-detail-tab-${activeTab}`}>
              {activeTab === 'tasks' && <div className="pwm-detail-tasks">
                <div className="pwm-task-status-tabs" role="group" aria-label={t('minerCustomization.taskStatus')}>
                  <button type="button" className={taskFilter === 'active' ? 'pwm-task-status-tab pwm-task-status-tab-active' : 'pwm-task-status-tab'} aria-pressed={taskFilter === 'active'} onClick={() => setTaskFilter('active')}>{t('minerCustomization.activeTasks')}</button>
                  <button type="button" className={taskFilter === 'inactive' ? 'pwm-task-status-tab pwm-task-status-tab-active' : 'pwm-task-status-tab'} aria-pressed={taskFilter === 'inactive'} onClick={() => setTaskFilter('inactive')}>{t('minerCustomization.inactiveTasks')}</button>
                </div>
                <div className="pwm-detail-task-panel">
                  <p className="pwm-detail-task-empty" role="status">{t('minerCustomization.tasksEmpty')}</p>
                </div>
              </div>}
              {activeTab === 'upgrades' && <div className="pwm-detail-neutral-empty" role="status">{t('minerCustomization.emptyState')}</div>}
              {activeTab === 'properties' && <dl className="pwm-detail-properties">
                <dt>{t('minerCustomization.properties.id')}</dt><dd>{miner.id}</dd>
                <dt>{t('minerCustomization.properties.power')}</dt><dd>{miner.powerTh.toFixed(4)} TH</dd>
                <dt>{t('minerCustomization.properties.efficiency')}</dt><dd>{miner.efficiency} W/TH</dd>
                <dt>{t('minerCustomization.properties.purchasedTraits')}</dt><dd>{purchasedTraitIds}</dd>
              </dl>}              {activeTab === 'appearance' && <ul className="pwm-detail-trait-list">
                {appearanceCategories.map((category) => {
                  const traitId = appearance?.[category.payloadKey]
                  const effectiveTraitId = traitId === EXPLICIT_NONE_APPEARANCE ? null : traitId ?? catalog.base.default_appearance[category.id]
                  const trait = category.traits.find((item) => item.trait_id === effectiveTraitId)
                  return <li key={category.id}><span>{t(`minerCustomization.category.${category.id}`)}</span><strong>{trait?.value ?? 'None'}</strong></li>
                })}
                <li><span>Display</span><strong>{purchasedTraitValues('display')}</strong></li>
                <li><span>Items</span><strong>{purchasedTraitValues('items')}</strong></li>
              </ul>}
            </div>
          </section>
        </div>
      </div>
    </section>
  )
}

function CustomizeMiner({ miner, catalog, saveAppearance }: { miner: MinerCustomizationMiner; catalog: CustomizationCatalog; saveAppearance: (minerId: string, appearance: MinerAppearance) => Promise<void> }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = usePersonalization()
  const progress = getActiveProgressProvider(location.search).getSnapshot()
  const appearanceCategories = appearanceCategoriesFromCatalog(catalog)
  const [devUnlockRules, setDevUnlockRules] = useState<ReadonlyMap<string, PieceAccessRule>>()
  useEffect(() => {
    let active = true
    getDevUnlockRules(location.search).then((rules) => {
      if (active) setDevUnlockRules(rules)
    })
    return () => { active = false }
  }, [location.search])
  const unlockRules = devUnlockRules ?? unlockRulesFromCatalog(catalog)
  const [activePart, setActivePart] = useState<AppearancePart>('wall')
  const [currentPage, setCurrentPage] = useState(1)
  const [focusedOptionIndex, setFocusedOptionIndex] = useState(0)
  const [draft, setDraft] = useState<MinerAppearanceDraft>(() => appearanceDraftFromSaved(miner.appearance))
  const [lockedTrait, setLockedTrait] = useState<Trait | null>(null)
  const returnFocusTo = useRef<HTMLButtonElement | null>(null)
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([])
  const optionButtons = useRef<Array<HTMLButtonElement | null>>([])
  const closeModal = useCallback(() => setLockedTrait(null), [])
  const category = appearanceCategories.find((item) => item.id === activePart)!
  const categoryOptions = [
    ...category.traits.map((trait) => ({ kind: 'trait' as const, trait })),
    { kind: 'none' as const },
  ]
  const activeCategoryLabel = t(`minerCustomization.category.${category.id}`)
  const savedAppearance = miner.appearance
  const isDirty = isMinerAppearanceDirty(draft, savedAppearance)
  const activeTraitId = draft[category.payloadKey]
  const effectiveTraitId = activeTraitId === EXPLICIT_NONE_APPEARANCE ? null : activeTraitId ?? catalog.base.default_appearance[activePart]
  const noneSelected = activeTraitId === EXPLICIT_NONE_APPEARANCE || (activeTraitId === null && catalog.base.default_appearance[activePart] === null)
  const activeTrait = category.traits.find((trait) => trait.trait_id === effectiveTraitId)
  const canSave = isDirty && validateAppearanceDraft(draft, miner, progress, savedAppearance, unlockRules, appearanceCategories)
  const pageCount = getAppearancePageCount(categoryOptions.length)
  const visibleOptions = categoryOptions.slice((currentPage - 1) * MINER_APPEARANCE_PAGE_SIZE, currentPage * MINER_APPEARANCE_PAGE_SIZE)
  const emptySlotCount = Math.max(0, MINER_APPEARANCE_PAGE_SIZE - visibleOptions.length)
  const gridSlots = [
    ...visibleOptions,
    ...Array.from({ length: emptySlotCount }, (_, index) => ({ kind: 'empty' as const, key: `empty-${index}` })),
  ]
  const optionRows = Array.from({ length: MINER_APPEARANCE_PAGE_SIZE / 6 }, (_, index) => gridSlots.slice(index * 6, index * 6 + 6))
  const lockedMissing = lockedTrait ? getTraitAccess(lockedTrait, progress, miner, unlockRules).missing : []
  const lockedAsset = lockedTrait ? catalog.assets.find((asset) => asset.trait_id === lockedTrait.trait_id) : undefined
  const requiredLevels = new Set(lockedMissing.flatMap((requirement) => requirement.kind === 'progression_level' ? [requirement.minLevel] : []))
  const lockedBenefitIds = new Set([
    ...(lockedAsset?.benefit_ids ?? []),
    ...catalog.levels.filter((level) => requiredLevels.has(level.level)).flatMap((level) => level.benefit_ids ?? []),
  ])
  const lockedBenefits = catalog.benefits.filter((benefit) => lockedBenefitIds.has(benefit.benefit_id))

  const save = async () => {
    if (!canSave || !validateAppearanceDraft(draft, miner, progress, savedAppearance, unlockRules, appearanceCategories)) return
    const appearance = minerAppearanceFromDraft(draft, new Date().toISOString())
    await saveAppearance(miner.id, appearance)
    setDraft(draft)
  }

  const chooseCategory = (part: AppearancePart, index: number) => {
    setActivePart(part)
    setCurrentPage(1)
    setFocusedOptionIndex(0)
    tabButtons.current[index]?.focus()
  }

  const choosePage = (page: number) => {
    setCurrentPage(page)
    setFocusedOptionIndex(0)
  }

  const moveOptionFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    const currentIndex = optionButtons.current.indexOf(document.activeElement as HTMLButtonElement)
    if (currentIndex < 0) return
    const targetIndex = event.key === 'ArrowLeft' ? currentIndex - 1
      : event.key === 'ArrowRight' ? currentIndex + 1
        : event.key === 'ArrowUp' ? currentIndex - 6 : currentIndex + 6
    if (targetIndex < 0 || targetIndex >= visibleOptions.length) return
    event.preventDefault()
    setFocusedOptionIndex(targetIndex)
    optionButtons.current[targetIndex]?.focus()
  }

  const moveTabFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex = (index + direction + appearanceCategories.length) % appearanceCategories.length
    chooseCategory(appearanceCategories[nextIndex].id, nextIndex)
  }

  return (
    <section className="pwm-miner-flow pwm-customizer-flow">
      <header className="pwm-customizer-header">
        <button className="pwm-back-link" type="button" onClick={() => navigate(`/nft-miners/${encodeURIComponent(miner.id)}`)}><span aria-hidden="true">‹</span> {t('common.back').replace(/^←\s*/, '')}</button>
        <div className="pwm-customizer-header-actions">
          <button className="pwm-icon-button" type="button" disabled aria-label={t('minerCustomization.saveAsProfilePhoto')} title={t('minerCustomization.saveAsProfilePhoto')}>◉</button>
          <button className="pwm-button pwm-button-save" type="button" disabled={!canSave} onClick={save}>{t('common.save')}</button>
        </div>
      </header>

      <div className="pwm-customizer-column">
        <MinerAppearancePreview miner={miner} appearanceOverride={draft} catalogOverride={catalog} />
        <section className="pwm-customizer-card" aria-label={t('minerCustomization.customizerLabel')}>
          <div className="pwm-customizer-tabs" role="tablist" aria-label={t('minerCustomization.categories')}>
            {appearanceCategories.map((item, index) => (
              <button
                ref={(element) => { tabButtons.current[index] = element }}
                key={item.id}
                id={`pwm-category-tab-${item.id}`}
                aria-controls="pwm-category-panel"
                aria-selected={activePart === item.id}
                className={activePart === item.id ? 'pwm-customizer-tab pwm-customizer-tab-active' : 'pwm-customizer-tab'}
                onClick={() => chooseCategory(item.id, index)}
                onKeyDown={(event) => moveTabFocus(event, index)}
                role="tab"
                tabIndex={activePart === item.id ? 0 : -1}
                type="button"
              >{t(`minerCustomization.category.${item.id}`)}</button>
            ))}
          </div>
          <div id="pwm-category-panel" role="tabpanel" aria-labelledby={`pwm-category-tab-${activePart}`}>
            <div id="pwm-customizer-options" className={`pwm-option-grid${activePart === 'wall' ? ' pwm-option-grid-wall' : ''}${activePart === 'screen' ? ' pwm-option-grid-screen' : ''}`} role="grid" aria-rowcount={3} aria-colcount={6} aria-label={t('minerCustomization.optionsFor').replace('{category}', activeCategoryLabel)} onKeyDown={moveOptionFocus}>
              {optionRows.map((row, rowIndex) => <div className="pwm-option-grid-row" role="row" aria-rowindex={rowIndex + 1} key={`row-${rowIndex}`}>
                {row.map((option, columnIndex) => {
                  const index = rowIndex * 6 + columnIndex
                  if (option.kind === 'empty') return <div className="pwm-option-cell pwm-option-empty" role="presentation" aria-hidden="true" key={option.key}><div className="pwm-option pwm-option-empty-tile" /></div>
                  if (option.kind === 'none') {
                    const selected = noneSelected
                    return <div className="pwm-option-cell" role="gridcell" aria-colindex={columnIndex + 1} aria-selected={selected} key="none">
                      <button
                        ref={(element) => { optionButtons.current[index] = element }}
                        tabIndex={focusedOptionIndex === index ? 0 : -1}
                        aria-label="None"
                        aria-pressed={selected}
                        data-trait-status="None"
                        className={`pwm-option pwm-option-none-select${selected ? ' pwm-option-selected' : ''}`}
                        onClick={() => setDraft((current) => ({ ...current, [category.payloadKey]: EXPLICIT_NONE_APPEARANCE }))}
                        onFocus={() => setFocusedOptionIndex(index)}
                        type="button"
                      >None</button>
                    </div>
                  }

                  const { trait } = option
                  const selected = effectiveTraitId === trait.trait_id
                  const locked = isTraitLocked(trait, progress, miner, unlockRules)
                  const assetBlocked = trait.presentationKind === 'blocked'
                  const traitStatus = getTraitStatus(trait, savedAppearance, draft, progress, miner, unlockRules)
                  const presentation = trait.link_picture
                    ? { kind: 'catalog-thumbnail' as const, source: trait.link_picture }
                    : TRAIT_PRESENTATION_BY_ID[trait.trait_id]
                      ?? (trait.presentationKind === 'overlay' || trait.presentationKind === 'recolor'
                        ? { kind: 'miner-thumbnail' as const }
                        : { kind: 'placeholder' as const })
                  return <div key={trait.trait_id} className="pwm-option-cell" role="gridcell" aria-colindex={columnIndex + 1} aria-selected={selected}>
                    <button
                      ref={(element) => { optionButtons.current[index] = element }}
                      tabIndex={focusedOptionIndex === index ? 0 : -1}
                      aria-disabled={locked || assetBlocked}
                      aria-label={assetBlocked
                        ? trait.value ?? t('minerCustomization.visualUnavailable')
                        : traitStatus === 'Upcoming'
                        ? `${trait.value ?? t('minerCustomization.visualUnavailable')} · SOON`
                        : locked
                          ? t('minerCustomization.lockedTrait').replace('{value}', trait.value ?? '')
                          : trait.value ?? t('minerCustomization.visualUnavailable')}
                      aria-pressed={selected}
                      data-trait-status={traitStatus}
                      className={`pwm-option${selected ? ' pwm-option-selected' : ''}${locked ? ' pwm-option-vip' : ''}${assetBlocked ? ' pwm-option-blocked' : ''}`}
                      onClick={(event) => {
                        if (assetBlocked) return
                        if (locked) {
                          returnFocusTo.current = event.currentTarget
                          setLockedTrait(trait)
                          return
                        }
                        setDraft((current) => selectAppearanceTrait(current, activePart, trait.trait_id, progress, miner, unlockRules, appearanceCategories))
                      }}
                      title={trait.value ?? ''}
                      onFocus={() => setFocusedOptionIndex(index)}
                      type="button"
                    >
                      {presentation.kind === 'measured-color'
                        ? <span className="pwm-option-color" style={{ backgroundColor: presentation.color }} />
                        : presentation.kind === 'catalog-thumbnail'
                          ? <span className="pwm-option-thumbnail"><img src={presentation.source} alt="" /></span>
                        : presentation.kind === 'miner-thumbnail'
                          ? <span className="pwm-option-thumbnail"><MinerAppearancePreview miner={miner} appearanceOverride={{ ...draft, [category.payloadKey]: trait.trait_id }} catalogOverride={catalog} /></span>
                          : <span className="pwm-option-placeholder" aria-hidden="true">▧</span>}
                      {locked && <span className="pwm-option-lock" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><rect x="4" y="10" width="16" height="12" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg></span>}
                      {traitStatus === 'Applied' && <span className="pwm-option-state pwm-option-state-applied" aria-hidden="true">✓</span>}
                      {traitStatus === 'Upcoming' && <span className="pwm-option-state pwm-option-state-soon" aria-hidden="true">SOON</span>}
                      {traitStatus === 'Available' && <span className="pwm-option-help" aria-hidden="true">?</span>}
                      {import.meta.env.DEV && assetBlocked && <span className="pwm-option-blocked-label" aria-hidden="true">{derivedDemoBlockedDetail(category.id, trait.value ?? '')}</span>}
                    </button>
                  </div>
                })}
              </div>)}
            </div>
            {activeTrait && <p className="pwm-selected-trait" aria-live="polite"><span>{activeCategoryLabel}</span><strong>{activeTrait.value}</strong></p>}
            {pageCount >= 1 && <nav className="pwm-pagination" aria-label={t('minerCustomization.pages')}>
              <button type="button" aria-label={t('minerCustomization.previousPage')} disabled={currentPage === 1} onClick={() => choosePage(currentPage - 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg></button>
              {getPaginationItems(pageCount, currentPage).map((item, index) => item === 'ellipsis'
                ? <span className="pwm-pagination-ellipsis" aria-hidden="true" key={`ellipsis-${index}`}>…</span>
                : <button type="button" aria-current={currentPage === item ? 'page' : undefined} className={currentPage === item ? 'pwm-page-current' : ''} key={item} onClick={() => choosePage(item)}>{item}</button>)}
              <button type="button" aria-label={t('minerCustomization.nextPage')} disabled={currentPage === pageCount} onClick={() => choosePage(currentPage + 1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg></button>
            </nav>}
          </div>
        </section>
      </div>

      {lockedTrait && <LockedTraitModal trait={lockedTrait} missing={lockedMissing} benefits={lockedBenefits} returnFocusTo={returnFocusTo} onClose={closeModal} />}
    </section>
  )
}
