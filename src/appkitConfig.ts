import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import { AdapterBlueprint, ConnectorController, CoreHelperUtil, WalletConnectConnector } from '@reown/appkit-controllers'
import {
  arbitrum,
  arbitrumSepolia,
  avalanche,
  avalancheFuji,
  bsc,
  bscTestnet,
  mainnet,
  optimism,
  optimismSepolia,
  polygon,
  polygonAmoy,
  sepolia,
  solana,
  solanaDevnet,
  tronMainnet,
  tronNileTestnet,
  type AppKitNetwork,
} from '@reown/appkit/networks'
import { QueryClient } from '@tanstack/react-query'
import {
  isEthereumPaymentEnabled,
  resolvePaymentNetworkMode,
  type PaymentEnv,
  type PaymentNetworkMode,
} from './paymentDestinations.ts'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 0,
      staleTime: 60_000,
      gcTime: 300_000,
    },
  },
})

// Reown AppKit Project ID from environment variable with fallback
const envProjectId = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_REOWN_PROJECT_ID : undefined
if (typeof import.meta !== 'undefined' && import.meta.env?.PROD && !envProjectId) {
  console.warn('[AppKit] VITE_REOWN_PROJECT_ID is not set in production; using fallback projectId.')
}
export const projectId = envProjectId || '0343399f08f86b28ceaf084ae4e45a01'

const canonicalOrigin =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://pouwminer.com'

export const metadata = {
  name: 'PouwMiner.com',
  description: 'PouwMiner.com wallet connection',
  url: canonicalOrigin,
  icons: [`${canonicalOrigin}/favicon.ico`],
}

export const DEFAULT_EVM_WC_METHODS = [
  'eth_accounts',
  'eth_requestAccounts',
  'eth_sendRawTransaction',
  'eth_signTransaction',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
  'eth_sendTransaction',
  'personal_sign',
  'wallet_switchEthereumChain',
  'wallet_addEthereumChain',
  'wallet_watchAsset',
] as const

type UniversalProviderLike = Parameters<NonNullable<AdapterBlueprint['setUniversalProvider']>>[0]

/**
 * Minimal WalletConnect v2 UniversalAdapter blueprint for the TRON namespace on @reown/appkit@1.8.24.
 * Required because AppKitBaseClient.getChainNamespacesSet() derives namespaces exclusively from
 * registered adapters when EVM/Solana adapters are present. Uses zero external npm dependencies.
 */
class TronUniversalAdapter extends AdapterBlueprint {
  constructor() {
    super({ namespace: 'tron', adapterType: 'tron' })
  }

  override construct(params: AdapterBlueprint.Params): void {
    super.construct({ ...params, adapterType: params.adapterType ?? 'tron' })
  }

  override async setUniversalProvider(universalProvider: UniversalProviderLike): Promise<void> {
    this.provider = universalProvider
    this.addConnector(
      new WalletConnectConnector({
        provider: universalProvider,
        caipNetworks: this.getCaipNetworks(),
        namespace: 'tron',
      }),
    )
    ConnectorController.filterByNamespace('tron', true)
  }

  override async connect(params: AdapterBlueprint.ConnectParams): Promise<AdapterBlueprint.ConnectResult> {
    return {
      id: 'WALLET_CONNECT',
      type: 'WALLET_CONNECT',
      chainId: params.chainId ?? '0x2b6653dc',
      provider: this.provider,
      address: '',
    }
  }

  override async disconnect(): Promise<AdapterBlueprint.DisconnectResult> {
    try {
      const connector = this.getWalletConnectConnector()
      await connector.disconnect()
    } catch {
      // Ignore disconnect errors when another adapter already closed the shared WalletConnect session
    } finally {
      this.emit('disconnect')
    }
    return { connections: [] }
  }

  override async syncConnections(): Promise<void> {}
  override async syncConnectors(): Promise<void> {}

  override async syncConnection(params?: AdapterBlueprint.SyncConnectionParams): Promise<AdapterBlueprint.ConnectResult> {
    const provider = this.provider as UniversalProviderLike | undefined
    const accounts = provider?.session?.namespaces?.tron?.accounts ?? []
    const firstAccount = accounts[0]
    if (!firstAccount) {
      return undefined as unknown as AdapterBlueprint.ConnectResult
    }
    const [, parsedChainId, parsedAddress] = firstAccount.split(':')
    return {
      id: 'walletConnect',
      type: 'WALLET_CONNECT',
      chainId: parsedChainId || params?.chainId || '0x2b6653dc',
      provider,
      address: parsedAddress || '',
    }
  }

  override async getAccounts(): Promise<AdapterBlueprint.GetAccountsResult> {
    const provider = this.provider as UniversalProviderLike | undefined
    const caipAccounts = (provider?.session?.namespaces?.tron?.accounts ?? []).filter(
      (account, index, self) => self.indexOf(account) === index,
    )
    return {
      accounts: caipAccounts.map((caipAddress) =>
        CoreHelperUtil.createAccount({
          caipAddress: caipAddress as `tron:${string}:${string}`,
          type: 'eoa',
        }),
      ),
    }
  }

  override async getBalance(params: AdapterBlueprint.GetBalanceParams): Promise<AdapterBlueprint.GetBalanceResult> {
    return {
      balance: '0.00',
      symbol: params.caipNetwork?.nativeCurrency?.symbol || 'TRX',
    }
  }

  private hydrateTronRpcMethods(wcProvider: UniversalProviderLike | undefined): void {
    const providerWithRpc = wcProvider as
      | (UniversalProviderLike & {
          rpcProviders?: Record<string, { namespace?: { methods?: string[] } } | undefined>
        })
      | undefined
    const tronNamespace = providerWithRpc?.rpcProviders?.tron?.namespace
    if (tronNamespace && (!Array.isArray(tronNamespace.methods) || tronNamespace.methods.length === 0)) {
      const sessionMethods = providerWithRpc?.session?.namespaces?.tron?.methods
      tronNamespace.methods =
        Array.isArray(sessionMethods) && sessionMethods.length > 0
          ? [...sessionMethods]
          : ['tron_signTransaction', 'tron_signMessage']
    }
  }

  override async signMessage(params: AdapterBlueprint.SignMessageParams): Promise<AdapterBlueprint.SignMessageResult> {
    const provider = params.provider as UniversalProviderLike | undefined
    if (!provider) {
      throw new Error('TronUniversalAdapter:signMessage - provider is undefined')
    }
    this.hydrateTronRpcMethods(provider)
    const tronChainId =
      provider.session?.namespaces?.tron?.chains?.[0] ??
      (provider.session?.namespaces?.tron?.accounts?.[0]
        ? provider.session.namespaces.tron.accounts[0].split(':').slice(0, 2).join(':')
        : 'tron:0x2b6653dc')
    const res = (await provider.request(
      {
        method: 'tron_signMessage',
        params: { address: params.address, message: params.message },
      },
      tronChainId,
    )) as string | { signature?: string }
    return { signature: typeof res === 'string' ? res : (res?.signature ?? '') }
  }

  override async switchNetwork(params: AdapterBlueprint.SwitchNetworkParams): Promise<void> {
    try {
      const connector = this.getWalletConnectConnector()
      const wcProvider = connector.provider as (UniversalProviderLike & { rpcProviders?: Record<string, unknown> }) | undefined
      if (wcProvider?.rpcProviders?.tron) {
        wcProvider.setDefaultChain(params.caipNetwork.caipNetworkId)
      }
    } catch {
      // Ignore setDefaultChain errors when TRON RPC provider map is not yet initialized
    }
  }

  override getWalletConnectProvider(params?: AdapterBlueprint.GetWalletConnectProviderParams): UniversalProviderLike {
    const connector = this.connectors.find((c) => c.type === 'WALLET_CONNECT')
    const wcProvider = (connector?.provider ?? params?.provider ?? this.provider) as UniversalProviderLike | undefined
    this.hydrateTronRpcMethods(wcProvider)
    return wcProvider as UniversalProviderLike
  }

  override async estimateGas(): Promise<AdapterBlueprint.EstimateGasTransactionResult> { return { gas: 0n } }
  override async sendTransaction(): Promise<AdapterBlueprint.SendTransactionResult> { return { hash: '' } }
  override async writeContract(): Promise<AdapterBlueprint.WriteContractResult> { return { hash: '' } }
  override async writeSolanaTransaction(): Promise<AdapterBlueprint.WriteSolanaTransactionResult> { return { hash: '' } }
  override emitFirstAvailableConnection(): void {}
  override parseUnits(): AdapterBlueprint.ParseUnitsResult { return 0n }
  override formatUnits(): AdapterBlueprint.FormatUnitsResult { return '0' }
  override async getCapabilities(): Promise<unknown> { return {} }
  override async grantPermissions(): Promise<unknown> { return {} }
  override async revokePermissions(): Promise<`0x${string}`> { return '0x' }
  override async walletGetAssets(): Promise<AdapterBlueprint.WalletGetAssetsResponse> { return {} }
}

export function getAppKitEvmNetworksForMode(
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): [AppKitNetwork, ...AppKitNetwork[]] {
  const activeMode = mode ?? resolvePaymentNetworkMode(env)
  const ethereumEnabled = isEthereumPaymentEnabled(env)
  if (activeMode === 'mainnet') {
    return ethereumEnabled
      ? [bsc, polygon, arbitrum, optimism, avalanche, mainnet]
      : [bsc, polygon, arbitrum, optimism, avalanche]
  }
  return ethereumEnabled
    ? [bscTestnet, polygonAmoy, arbitrumSepolia, optimismSepolia, avalancheFuji, sepolia]
    : [bscTestnet, polygonAmoy, arbitrumSepolia, optimismSepolia, avalancheFuji]
}

export function getAppKitNetworksForMode(
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): [AppKitNetwork, ...AppKitNetwork[]] {
  const activeMode = mode ?? resolvePaymentNetworkMode(env)
  const evmNetworks = getAppKitEvmNetworksForMode(activeMode, env)
  return activeMode === 'mainnet'
    ? [...evmNetworks, solana, tronMainnet]
    : [...evmNetworks, solanaDevnet, tronNileTestnet]
}

export function getDefaultAppKitNetworkForMode(
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): AppKitNetwork {
  const activeMode = mode ?? resolvePaymentNetworkMode(env)
  return activeMode === 'mainnet' ? bsc : bscTestnet
}

export const paymentNetworkMode = resolvePaymentNetworkMode()
export const appKitEvmNetworks = getAppKitEvmNetworksForMode(paymentNetworkMode)
export const appKitNetworks = getAppKitNetworksForMode(paymentNetworkMode)

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: appKitEvmNetworks,
})

export const solanaAdapter = new SolanaAdapter({
  wallets: [],
})

export const tronAdapter = new TronUniversalAdapter()

export const appKitModal = createAppKit({
  adapters: [wagmiAdapter, solanaAdapter, tronAdapter],
  networks: appKitNetworks,
  defaultNetwork: getDefaultAppKitNetworkForMode(paymentNetworkMode),
  projectId,
  metadata,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#7c3aed',
    '--w3m-border-radius-master': '12px',
  },
  features: {
    analytics: false,
    email: false,
    socials: false,
    swaps: false,
  },
  universalProviderConfigOverride: {
    methods: {
      eip155: [...DEFAULT_EVM_WC_METHODS],
    },
  },
})

// @reown/appkit-common@1.8.24 omits 'tron' from AVAILABLE_NAMESPACES, filtering TRON connectors out by default
ConnectorController.filterByNamespace('tron', true)

export interface EvmUniversalProviderLike {
  isWalletConnect?: boolean
  session?: {
    topic?: string
    namespaces?: Record<
      string,
      { accounts?: string[]; chains?: string[]; methods?: string[]; events?: string[] } | undefined
    >
  }
  namespaces?: Record<
    string,
    { chains?: string[]; methods?: string[]; events?: string[]; defaultChain?: string } | undefined
  >
  rpcProviders?: Record<
    string,
    { namespace?: { accounts?: string[]; chains?: string[]; methods?: string[]; defaultChain?: string } } | undefined
  >
  client?: {
    request?: (args: {
      topic: string
      chainId: string
      request: { method: string; params?: unknown }
    }) => Promise<unknown>
  }
  events?: {
    emit?: (event: string, ...args: unknown[]) => unknown
  }
  emit?: (event: string, ...args: unknown[]) => unknown
  setDefaultChain?: (chainId: string, rpcUrl?: string) => void
  request?: (args: { method: string; params?: unknown }, chainId?: string) => Promise<unknown>
}

const EVM_SIGNING_METHODS = new Set([
  'eth_sendTransaction',
  'eth_signTransaction',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4',
])

const guardedEvmWcProviders = new WeakSet<object>()
const preferredEvmChainByProvider = new WeakMap<object, number>()

function isWalletConnectUniversalProvider(provider: unknown): provider is EvmUniversalProviderLike {
  return Boolean(
    provider &&
      typeof provider === 'object' &&
      ('rpcProviders' in provider ||
        'isWalletConnect' in provider ||
        ('session' in provider && 'namespaces' in provider)),
  )
}

function resolveEvmSessionNamespace(provider: EvmUniversalProviderLike): {
  accounts: string[]
  chains: string[]
  methods: string[]
  events: string[]
} | undefined {
  const namespaces = provider.session?.namespaces
  if (!namespaces) return undefined
  const accounts = new Set<string>()
  const chains = new Set<string>()
  const methods = new Set<string>()
  const events = new Set<string>()
  let found = false
  for (const [key, ns] of Object.entries(namespaces)) {
    if (!ns || (key !== 'eip155' && !key.startsWith('eip155:'))) continue
    found = true
    if (key.startsWith('eip155:')) chains.add(key)
    for (const ch of ns.chains ?? []) {
      if (typeof ch === 'string' && ch.startsWith('eip155:')) chains.add(ch)
    }
    for (const acc of ns.accounts ?? []) {
      if (typeof acc !== 'string' || !acc.startsWith('eip155:')) continue
      accounts.add(acc)
      const parts = acc.split(':')
      if (parts.length >= 2 && parts[1]) chains.add(`eip155:${parts[1]}`)
    }
    for (const method of ns.methods ?? []) {
      if (typeof method === 'string' && method) methods.add(method)
    }
    for (const ev of ns.events ?? []) {
      if (typeof ev === 'string' && ev) events.add(ev)
    }
  }
  if (!found) return undefined
  return { accounts: [...accounts], chains: [...chains], methods: [...methods], events: [...events] }
}

function mergeMissingMethods(existing: string[] | undefined, required: readonly string[]): string[] {
  const merged = Array.isArray(existing) ? [...existing] : []
  for (const method of required) {
    if (!merged.includes(method)) merged.push(method)
  }
  return merged
}

function resolveActiveApprovedEvmCaipChain(
  provider: EvmUniversalProviderLike,
  sessionEvm: { chains: string[] },
  explicitChainId?: string,
): string {
  const approved = sessionEvm.chains
  const isAllowed = (caip: string) => approved.length === 0 || approved.includes(caip)

  if (explicitChainId && String(explicitChainId).startsWith('eip155:') && isAllowed(String(explicitChainId))) {
    return String(explicitChainId)
  }
  const preferredChainId = preferredEvmChainByProvider.get(provider)
  if (preferredChainId && isAllowed(`eip155:${preferredChainId}`)) {
    return `eip155:${preferredChainId}`
  }
  const defaultChainRaw = provider.namespaces?.eip155?.defaultChain
  if (defaultChainRaw) {
    const normalized = defaultChainRaw.startsWith('eip155:') ? defaultChainRaw : `eip155:${defaultChainRaw}`
    if (isAllowed(normalized)) return normalized
  }
  return approved[0] ?? 'eip155:1'
}

export function ensureEvmProviderMethodsHydrated(
  provider: EvmUniversalProviderLike | null | undefined,
  expectedChainId?: number,
): void {
  if (!isWalletConnectUniversalProvider(provider)) return

  const sessionEvm = resolveEvmSessionNamespace(provider)
  const resolvedMethods =
    sessionEvm && sessionEvm.methods.length > 0 ? [...sessionEvm.methods] : [...DEFAULT_EVM_WC_METHODS]
  const approvedChains = sessionEvm?.chains ?? []
  const hasExpectedChain = typeof expectedChainId === 'number' && Number.isInteger(expectedChainId) && expectedChainId > 0
  const targetCaipChain = hasExpectedChain ? `eip155:${expectedChainId}` : ''
  const isExpectedChainApproved =
    hasExpectedChain && (approvedChains.length === 0 || approvedChains.includes(targetCaipChain))

  const repairEvmNamespacesAndMethods = () => {
    // Heal missing or truncated rpcProviders.eip155.namespace.methods (e.g. after updateNamespaceChain wipe)
    const eip155RpcNs = provider.rpcProviders?.eip155?.namespace
    if (eip155RpcNs) {
      eip155RpcNs.methods = mergeMissingMethods(eip155RpcNs.methods, resolvedMethods)
    }

    // Keep 'eip155' first in provider.namespaces so UniversalProvider.validateChain(undefined) routes Wagmi/Viem calls to EVM
    const nsMap = provider.namespaces
    const hasEvmContext = Boolean(
      sessionEvm ||
        provider.rpcProviders?.eip155 ||
        (nsMap && Object.keys(nsMap).some((k) => k === 'eip155' || k.startsWith('eip155:'))),
    )
    if (nsMap && typeof nsMap === 'object' && hasEvmContext) {
      const existingEntries = Object.entries(nsMap)
      const existingEip155 = nsMap.eip155
      for (const key of Object.keys(nsMap)) {
        delete nsMap[key]
      }
      const fallbackChains =
        approvedChains.length > 0
          ? approvedChains
          : isExpectedChainApproved
            ? [targetCaipChain]
            : ['eip155:1']
      nsMap.eip155 = {
        ...existingEip155,
        chains:
          Array.isArray(existingEip155?.chains) && existingEip155.chains.length > 0
            ? existingEip155.chains
            : fallbackChains,
        methods: mergeMissingMethods(existingEip155?.methods, resolvedMethods),
        events:
          Array.isArray(existingEip155?.events) && existingEip155.events.length > 0
            ? existingEip155.events
            : (sessionEvm?.events.length ? [...sessionEvm.events] : ['chainChanged', 'accountsChanged']),
        ...(isExpectedChainApproved ? { defaultChain: String(expectedChainId) } : {}),
      }
      for (const [key, val] of existingEntries) {
        if (key === 'eip155') continue
        if (key.startsWith('eip155:') && val) {
          val.methods = mergeMissingMethods(val.methods, resolvedMethods)
        }
        nsMap[key] = val
      }
    }
  }

  // Repair namespaces & methods BEFORE calling setDefaultChain so UniversalProvider.validateChain passes
  repairEvmNamespacesAndMethods()

  if (isExpectedChainApproved) {
    preferredEvmChainByProvider.set(provider, expectedChainId)
    if (provider.rpcProviders?.eip155) {
      try {
        provider.setDefaultChain?.(targetCaipChain)
      } catch {
        // Ignore setDefaultChain errors when UniversalProvider RPC map is not yet ready
      }
      // Re-heal methods/namespaces in case updateNamespaceChain cleared methods to []
      repairEvmNamespacesAndMethods()
    }
  }

  if (typeof provider.request === 'function' && !guardedEvmWcProviders.has(provider)) {
    const origRequest = provider.request
    guardedEvmWcProviders.add(provider)
    provider.request = (args, chainId) => {
      const isEvmTarget = !chainId || String(chainId).startsWith('eip155')
      const liveSessionEvm = resolveEvmSessionNamespace(provider)
      if (isEvmTarget && args?.method === 'wallet_sendTransaction') {
        if (!liveSessionEvm || !liveSessionEvm.methods.includes('wallet_sendTransaction')) {
          return Promise.reject(
            Object.assign(new Error('Method wallet_sendTransaction not supported'), { code: -32601 }),
          )
        }
      }
      if (isEvmTarget && !provider.rpcProviders?.eip155 && provider.session?.topic && liveSessionEvm) {
        const activeCaipChain = resolveActiveApprovedEvmCaipChain(provider, liveSessionEvm, chainId)
        const method = args?.method
        if (method === 'eth_chainId') {
          const parsedChainId = Number.parseInt(activeCaipChain.split(':')[1] ?? '1', 10)
          return Promise.resolve(`0x${(Number.isInteger(parsedChainId) && parsedChainId > 0 ? parsedChainId : 1).toString(16)}`)
        }
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') {
          const matched = liveSessionEvm.accounts
            .filter((acc) => acc.startsWith(`${activeCaipChain}:`))
            .map((acc) => acc.split(':')[2])
            .filter(Boolean)
          const source =
            matched.length > 0
              ? matched
              : liveSessionEvm.accounts.map((acc) => acc.split(':')[2]).filter(Boolean)
          const seen = new Set<string>()
          const unique = source.filter((addr) => {
            const lower = addr.toLowerCase()
            if (seen.has(lower)) return false
            seen.add(lower)
            return true
          })
          return Promise.resolve(unique)
        }
        if (method === 'wallet_switchEthereumChain') {
          const firstParam = Array.isArray(args?.params) ? (args.params[0] as { chainId?: string } | undefined) : undefined
          const targetHex = typeof firstParam?.chainId === 'string' ? firstParam.chainId : ''
          const targetNum = targetHex ? Number.parseInt(targetHex, 16) : Number.NaN
          const targetCaip = Number.isInteger(targetNum) && targetNum > 0 ? `eip155:${targetNum}` : ''
          const applyLocalSwitch = () => {
            if (Number.isInteger(targetNum) && targetNum > 0) {
              preferredEvmChainByProvider.set(provider, targetNum)
              if (provider.namespaces?.eip155) {
                provider.namespaces.eip155.defaultChain = String(targetNum)
              }
              if (provider.events?.emit) {
                provider.events.emit('chainChanged', `0x${targetNum.toString(16)}`)
              } else {
                provider.emit?.('chainChanged', `0x${targetNum.toString(16)}`)
              }
            }
          }
          if (targetCaip && liveSessionEvm.chains.includes(targetCaip)) {
            applyLocalSwitch()
            return Promise.resolve(null)
          }
          if (typeof provider.client?.request === 'function') {
            return provider.client
              .request({
                topic: provider.session.topic,
                chainId: liveSessionEvm.chains[0] ?? activeCaipChain,
                request: { method, params: args?.params },
              })
              .then((res) => {
                applyLocalSwitch()
                return res
              })
          }
        }
        if (method === 'wallet_addEthereumChain' && typeof provider.client?.request === 'function') {
          return provider.client.request({
            topic: provider.session.topic,
            chainId: liveSessionEvm.chains[0] ?? activeCaipChain,
            request: { method, params: args?.params },
          })
        }
        if (method && EVM_SIGNING_METHODS.has(method) && typeof provider.client?.request === 'function') {
          return provider.client.request({
            topic: provider.session.topic,
            chainId: activeCaipChain,
            request: { method, params: args?.params },
          })
        }
        return Promise.reject(
          Object.assign(new Error(`Method ${method ?? 'unknown'} unavailable without eip155 provider`), { code: -32601 }),
        )
      }
      return origRequest.call(provider, args, chainId)
    }
  }
}

export async function prepareWagmiEvmSigningProvider(
  expectedChainId?: number,
  connector?: { id?: string; type?: string; getProvider?: (params?: { chainId?: number }) => Promise<unknown> } | null,
): Promise<void> {
  if (connector && typeof connector.getProvider === 'function') {
    const connectorProvider = await connector.getProvider().catch(() => undefined)
    if (connectorProvider) {
      if (isWalletConnectUniversalProvider(connectorProvider)) {
        ensureEvmProviderMethodsHydrated(connectorProvider, expectedChainId)
      }
      return
    }
    if (connector.id && connector.id !== 'walletConnect' && connector.type !== 'walletConnect') {
      return
    }
  }
  const wcProvider = wagmiAdapter.getWalletConnectProvider()
  if (isWalletConnectUniversalProvider(wcProvider)) {
    ensureEvmProviderMethodsHydrated(wcProvider, expectedChainId)
  }
}
