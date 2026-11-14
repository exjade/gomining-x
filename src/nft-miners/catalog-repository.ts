import { useEffect, useState } from 'react'
import { MINER_APPEARANCE_CATALOG_DATA, proposedTraitId } from './catalog-data.ts'
import { APPEARANCE_PARTS, DEFAULT_LAYER_ORDER, type AppearancePart } from './catalog-types.ts'
import { CUSTOMIZATION_COLLECTIONS, type CustomAsset, type CustomizationCatalog } from './catalog-contract.ts'
import { toCustomizationCatalog, validateAdminCatalogDocuments } from './admin-catalog-contract.ts'
import { derivedDemoRecolor } from './derived-demo-recolor.ts'
import { isDevCatalogLabRequest } from './catalog-dev-route.ts'
import type { AppearanceCategory, Trait } from './appearance.ts'

const LOCAL_CATALOG_VERSION = 'local-seed-v1'
const LOCAL_UPDATED_AT = '1970-01-01T00:00:00.000Z'

function emptyDefaults() {
  return Object.fromEntries(APPEARANCE_PARTS.map((part) => [part, null])) as Record<AppearancePart, string | null>
}

function createLocalSeedCatalog(): CustomizationCatalog {
  const assets: CustomAsset[] = MINER_APPEARANCE_CATALOG_DATA.editable.flatMap(({ id: part, values }) =>
    values.filter((value) => value !== 'None').map((value, index) => {
      const layer = derivedDemoRecolor(part, value)
      return ({
      asset_id: `local-${part}-${index + 1}`,
      trait_id: proposedTraitId(part, value),
      part,
      value,
      asset_url: null,
      thumbnail_url: null,
      z_index: DEFAULT_LAYER_ORDER.indexOf(part) * 100 + index,
      unlock_rule: null,
      ...(layer ? { layer } : {}),
      status: 'published',
      version: LOCAL_CATALOG_VERSION,
      updated_at: LOCAL_UPDATED_AT,
    })}),
  )
  return {
    version: LOCAL_CATALOG_VERSION,
    base: {
      base_image_url: null,
      default_appearance: emptyDefaults(),
      canvas: { width: 600, height: 600 },
      layer_order: DEFAULT_LAYER_ORDER,
      version: LOCAL_CATALOG_VERSION,
      updated_at: LOCAL_UPDATED_AT,
    },
    assets,
    levels: Array.from({ length: 20 }, (_, index) => ({ level: index + 1, benefit_ids: [], description_es: '', is_active: true, version: LOCAL_CATALOG_VERSION, updated_at: LOCAL_UPDATED_AT })),
    benefits: [],
  }
}

export const LOCAL_SEED_CATALOG = createLocalSeedCatalog()

export function appearanceCategoriesFromCatalog(catalog: CustomizationCatalog): AppearanceCategory[] {
  return APPEARANCE_PARTS.map((part) => ({
    id: part,
    payloadKey: `${part}_id` as AppearanceCategory['payloadKey'],
    label: part,
    traits: catalog.assets.filter((asset) => asset.part === part && asset.status === 'published').map((asset): Trait => ({
      trait_id: asset.trait_id,
      value: asset.value,
      description: asset.description_es ?? null,
      category: part,
      link_catalogue: null,
      link_picture: asset.thumbnail_url,
      status: 'Available',
      completion_requirements: null,
      link_to_task: asset.link_to ?? null,
      button_text: asset.button_text ?? null,
      unlocked_at: null,
      is_external_link: false,
      presentationKind: asset.asset_url ? 'overlay' : asset.layer?.kind === 'recolor' ? 'recolor' : 'blocked',
    })),
  }))
}

export type CatalogSource = 'local' | 'firestore'

export interface CatalogRepository {
  load(): Promise<CustomizationCatalog>
}

export class LocalSeedCatalogAdapter implements CatalogRepository {
  load() {
    return Promise.resolve(LOCAL_SEED_CATALOG)
  }
}

export class FirestoreCatalogAdapter implements CatalogRepository {
  async load() {
    const [{ collection, doc, getDoc, getDocs, query, where }, { db }] = await Promise.all([
      import('firebase/firestore'),
      import('../firebase'),
    ])
    const [baseSnapshot, assetsSnapshot, levelsSnapshot, benefitsSnapshot] = await Promise.all([
      getDoc(doc(db, CUSTOMIZATION_COLLECTIONS.base, 'current')),
      getDocs(query(collection(db, CUSTOMIZATION_COLLECTIONS.assets), where('status', '==', 'published'))),
      getDocs(query(collection(db, CUSTOMIZATION_COLLECTIONS.levels), where('isActive', '==', true))),
      getDocs(collection(db, CUSTOMIZATION_COLLECTIONS.benefits)),
    ])
    if (!baseSnapshot.exists()) throw new Error('Firestore catalog document custom_base/current is missing')

    const documents = (snapshot: typeof assetsSnapshot, idField: 'assetId' | 'benefitId') => snapshot.docs.map((document) => ({
      ...document.data(),
      [idField]: document.id,
    }))
    const adminDocuments = validateAdminCatalogDocuments({
      base: baseSnapshot.data(),
      assets: documents(assetsSnapshot, 'assetId'),
      levels: levelsSnapshot.docs.map((document) => document.data()),
      benefits: documents(benefitsSnapshot, 'benefitId'),
    }, allowedAssetOrigins())
    return toCustomizationCatalog(adminDocuments)
  }
}

function allowedAssetOrigins() {
  const configuredOrigins: string = import.meta.env.VITE_ASSET_ALLOWED_ORIGINS ?? ''
  return new Set<string>(configuredOrigins.split(',').map((origin: string) => origin.trim()).filter(Boolean))
}

function getConfiguredSource(): CatalogSource {
  const source = import.meta.env.VITE_CATALOG_SOURCE ?? 'local'
  if (source !== 'local' && source !== 'firestore') throw new Error(`Unsupported VITE_CATALOG_SOURCE: ${source}`)
  return source
}

let sessionCatalogCache = new Map<string, CustomizationCatalog>()
let sessionCatalogLoads = new Map<string, Promise<CustomizationCatalog>>()

export function clearCatalogSessionCache() {
  sessionCatalogCache = new Map()
  sessionCatalogLoads = new Map()
}

export async function loadCustomizationCatalog(search = '', pathname = '') {
  if (import.meta.env.DEV) {
    if (isDevCatalogLabRequest(true, pathname, search)) {
      const { loadDevCatalogFixture } = await import('./dev-catalog-fixture.ts')
      return loadDevCatalogFixture(LOCAL_SEED_CATALOG)
    }
  }
  const source = getConfiguredSource()
  const cacheKey = `${source}:${import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'local'}`
  const cached = sessionCatalogCache.get(cacheKey)
  if (cached) return cached
  const loading = sessionCatalogLoads.get(cacheKey)
  if (loading) return loading
  const adapter: CatalogRepository = source === 'firestore' ? new FirestoreCatalogAdapter() : new LocalSeedCatalogAdapter()
  const request = adapter.load().then((catalog) => {
    sessionCatalogCache.set(cacheKey, catalog)
    sessionCatalogLoads.delete(cacheKey)
    return catalog
  }, (error: unknown) => {
    sessionCatalogLoads.delete(cacheKey)
    throw error
  })
  sessionCatalogLoads.set(cacheKey, request)
  return request
}

export function useCustomizationCatalog(search: string, pathname: string) {
  const [catalog, setCatalog] = useState(LOCAL_SEED_CATALOG)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    loadCustomizationCatalog(search, pathname).then((loaded) => {
      if (!active) return
      setCatalog(loaded)
      setLoading(false)
    }).catch((reason: unknown) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : String(reason))
      setLoading(false)
    })
    return () => { active = false }
  }, [pathname, search])

  return { catalog, loading, error }
}
