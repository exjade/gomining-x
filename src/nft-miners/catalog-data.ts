export const MINER_APPEARANCE_CATALOG_DATA = {
  editable: [
    { id: 'wall', label: 'Wall', values: ['Black', 'Blue', 'Green', 'Green Plastic', 'Grey', 'Pink', 'Red', 'Violet', 'White', 'Yellow'] },
    { id: 'body', label: 'Body', values: ['Gold Curves', 'Gold Holes', 'Gold Lines', 'Silver Curves', 'Silver Holes', 'Silver Lines', 'Bronze Curves', 'Bronze Holes', 'Bronze Lines', 'Black Curves', 'Black Holes', 'Black Lines', 'Green Curves', 'Green Holes', 'Green Lines', 'Violet Curves', 'Violet Holes', 'Violet Lines', 'Wood Curves', 'Wood Holes', 'Wood Lines'] },
    { id: 'bottom', label: 'Bottom', values: ['White treads', 'Black treads', 'Purple treads'] },
    { id: 'fans', label: 'Fans', values: ['Gold Curves', 'Gold Holes', 'Gold Lines', 'Silver Curves', 'Silver Holes', 'Silver Lines', 'Bronze Curves', 'Bronze Holes', 'Bronze Lines', 'Black Curves', 'Black Holes', 'Black Lines', 'Green Curves', 'Green Holes', 'Green Lines', 'Violet Curves', 'Violet Holes', 'Violet Lines', 'Wood Curves', 'Wood Holes', 'Wood Lines'] },
    { id: 'screen', label: 'Screen', values: ['Gold Curves', 'Gold Holes', 'Gold Lines', 'Silver Curves', 'Silver Holes', 'Silver Lines', 'Bronze Curves', 'Bronze Holes', 'Bronze Lines', 'Black Curves', 'Black Holes', 'Black Lines', 'Green Curves', 'Green Holes', 'Green Lines', 'Violet Curves', 'Violet Holes', 'Violet Lines', 'Wood Curves', 'Wood Holes', 'Wood Lines'] },
    { id: 'buttons', label: 'Buttons', values: ['Gold Curves', 'Gold Holes', 'Gold Lines', 'Silver Curves', 'Silver Holes', 'Silver Lines', 'Bronze Curves', 'Bronze Holes', 'Bronze Lines', 'Black Curves', 'Black Holes', 'Black Lines', 'Green Curves', 'Green Holes', 'Green Lines', 'Violet Curves', 'Violet Holes', 'Violet Lines', 'Wood Curves', 'Wood Holes', 'Wood Lines'] },
    { id: 'top', label: 'Top', values: ['Gold Curves', 'Gold Holes', 'Gold Lines', 'Silver Curves', 'Silver Holes', 'Silver Lines', 'Bronze Curves', 'Bronze Holes', 'Bronze Lines', 'None'] },
    { id: 'stickers', label: 'Stickers', values: ['Bag', 'Coins', 'Grow', 'HODL', 'Moon', 'Phone', 'Pickaxe', 'Present', 'x1000', 'None'] },
  ],
  readOnly: {
    display: ['BTC', 'GoMining', 'Power', '1up', 'Arrow', 'Capacity', 'Cherry', 'Coin', 'Crown', 'Cup', 'Diamond', 'Heart', 'Level Up', 'Pizza', 'Present'],
    items: ['15 BTC', '15 PEARL', '10 BTC', '10 PEARL', '5 BTC', '5 PEARL', 'None'],
  },
} as const

export type CatalogCategoryId = typeof MINER_APPEARANCE_CATALOG_DATA.editable[number]['id']
export type CatalogReadOnlyCategoryId = keyof typeof MINER_APPEARANCE_CATALOG_DATA.readOnly

/**
 * PROPOSED frontend key: derived from the observed category/value labels.
 * The authoritative GoMining trait IDs were not present in the supplied catalog transcription.
 */
export function proposedTraitId(category: string, value: string) {
  return `${category}-${value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

// `None` remains in purchase-result counts, but it is not a trait or an unlock-map row.
export const MINER_APPEARANCE_CATALOG_ENTRIES = [
  ...MINER_APPEARANCE_CATALOG_DATA.editable.flatMap(({ id, values }) => values.filter((value) => value !== 'None').map((value) => ({
    trait_id: proposedTraitId(id, value), category: id, value,
  }))),
  ...Object.entries(MINER_APPEARANCE_CATALOG_DATA.readOnly).flatMap(([category, values]) => values.filter((value) => value !== 'None').map((value) => ({
    trait_id: proposedTraitId(category, value), category, value,
  }))),
] as const
