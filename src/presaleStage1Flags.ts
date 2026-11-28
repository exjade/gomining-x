/**
 * Roadmap V1 · Etapa 1 (Preventa):
 * Visible en Etapa 1: Granja / Mi Miner (HUB 3D), Unilevel & Referidos Directos,
 * Retiros USDT, Cartera / Historial de Compras y Compra de Mineros con Skin Base gratuita ($0).
 *
 * Todos los módulos de Etapa 2+ permanecen implementados en código (nunca eliminados)
 * y se reactivan poniendo su flag correspondiente en `true`.
 */

export const SHOW_STAGE2_SUBSCRIPTIONS = false
export const SHOW_STAGE2_TOPUP_AND_DEPOSIT = false
export const SHOW_STAGE2_TRAIT_CUSTOMIZER = false
export const SHOW_STAGE2_MINER_TASKS_AND_UPGRADES = false
export const SHOW_STAGE2_POBOXES_AND_PROMOS = false
export const SHOW_STAGE2_BATTLES_MINER_WARS = false
export const SHOW_STAGE2_LEADERBOARDS = false
export const SHOW_STAGE2_EXTRA_EXPLORE_MODULES = false

const STAGE2_SUBSCRIPTION_PREFIXES = ['/subscriptions', '/sub', '/subs'] as const
const STAGE2_TOPUP_DEPOSIT_PREFIXES = ['/deposit', '/buy', '/finance/wallets/virtual', '/finance/instant-funds', '/finance/banking-cards', '/finance/simple-earn'] as const
const STAGE2_POBOXES_PROMOS_PREFIXES = ['/goboxes', '/promos', '/raffles', '/raffle', '/offers', '/bonus-miner-v3', '/launchpad', '/marketplace', '/gominers-collection', '/travel', '/shop', '/nft-sell'] as const
const STAGE2_BATTLES_PREFIXES = ['/miner-wars', '/nft-rewards/pool'] as const
const STAGE2_LEADERBOARD_PREFIXES = ['/leaderboard'] as const
const STAGE2_EXTRA_MODULE_PREFIXES = ['/mining-calculator', '/calculator', '/operator-economics', '/lock/ve-voting', '/academy', '/blog'] as const

function matchesAnyPrefix(cleanPathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(
    (prefix) => cleanPathname === prefix || cleanPathname.startsWith(`${prefix}/`),
  )
}

export function isHiddenInPresaleStage1(rawPath: string): boolean {
  const clean = (rawPath.split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase() || '/')
  if (!SHOW_STAGE2_SUBSCRIPTIONS && matchesAnyPrefix(clean, STAGE2_SUBSCRIPTION_PREFIXES)) {
    return true
  }
  if (!SHOW_STAGE2_TOPUP_AND_DEPOSIT && matchesAnyPrefix(clean, STAGE2_TOPUP_DEPOSIT_PREFIXES)) {
    return true
  }
  if (!SHOW_STAGE2_POBOXES_AND_PROMOS && matchesAnyPrefix(clean, STAGE2_POBOXES_PROMOS_PREFIXES)) {
    return true
  }
  if (!SHOW_STAGE2_BATTLES_MINER_WARS && matchesAnyPrefix(clean, STAGE2_BATTLES_PREFIXES)) {
    return true
  }
  if (!SHOW_STAGE2_LEADERBOARDS && matchesAnyPrefix(clean, STAGE2_LEADERBOARD_PREFIXES)) {
    return true
  }
  if (!SHOW_STAGE2_EXTRA_EXPLORE_MODULES && matchesAnyPrefix(clean, STAGE2_EXTRA_MODULE_PREFIXES)) {
    return true
  }
  return false
}
