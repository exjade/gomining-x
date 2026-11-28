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
    const res = (await provider.request({
      method: 'tron_signMessage',
      params: { address: params.address, message: params.message },
    })) as string | { signature?: string }
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
})

// @reown/appkit-common@1.8.24 omits 'tron' from AVAILABLE_NAMESPACES, filtering TRON connectors out by default
ConnectorController.filterByNamespace('tron', true)
