import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import ts from 'typescript'
import { ConnectorController } from '@reown/appkit-controllers'
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
} from '@reown/appkit/networks'
import * as paymentDestinations from '../src/paymentDestinations.ts'
import * as coordinator from '../src/services/payments/checkoutIntentCoordinator.ts'
import * as historyService from '../src/components/payments/clientPaymentHistoryService.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const OFFICIAL_TRON_USDT_MAINNET = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const OFFICIAL_TRON_USDT_HEX41 = '41a614f803b6fd780986a42c78ec9c7f77e6ded13c'
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function makeTronBase58FromHex20(hex20: string): string {
  const payload = Buffer.from(`41${hex20}`, 'hex')
  const hash1 = crypto.createHash('sha256').update(payload).digest()
  const hash2 = crypto.createHash('sha256').update(hash1).digest()
  const full = Buffer.concat([payload, hash2.subarray(0, 4)])
  let leadingZeros = 0
  for (const byte of full) {
    if (byte === 0) leadingZeros += 1
    else break
  }
  let value = BigInt(`0x${full.toString('hex')}`)
  let encoded = ''
  while (value > 0n) {
    encoded = BASE58_ALPHABET[Number(value % 58n)] + encoded
    value /= 58n
  }
  return '1'.repeat(leadingZeros) + encoded
}

const TRON_TREASURY = makeTronBase58FromHex20('1111111111111111111111111111111111111111')
const TRON_SENDER = makeTronBase58FromHex20('2222222222222222222222222222222222222222')
const TRON_OTHER = makeTronBase58FromHex20('3333333333333333333333333333333333333333')
const TRON_ZERO = makeTronBase58FromHex20('0'.repeat(40))
const VALID_EVM = '0x9561aA554476A4C7C77f3B82ba2e16727445D58e'
const VALID_SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
const VALID_TRON_TX_HASH = 'd'.repeat(64)

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8')
}

function extractBlock(src: string, anchor: string): string {
  const start = src.indexOf(anchor)
  assert.notEqual(start, -1, `Expected anchor "${anchor}"`)
  const openBrace = src.indexOf('{', start)
  assert.notEqual(openBrace, -1, `Expected opening brace after "${anchor}"`)
  let depth = 0
  for (let i = openBrace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) return src.slice(start, i + 1)
    }
  }
  throw new Error(`Unclosed block for "${anchor}"`)
}

describe('SCRUM-381 (PG-07 / ADR-0013): Client USDT-First 8 Networks & TRON TRC-20 on Reown AppKit', () => {
  describe('Task 4.1: Synchronous pure-TS Base58Check TRON validation, 8-network catalog parity & Tronscan URLs', () => {
    it('validates TRON Base58Check synchronously with double SHA-256 checksum and enforces fail-closed requireTreasuryAddress(tron)', () => {
      const api = paymentDestinations as unknown as {
        isValidTronAddress?: (address: unknown) => boolean
        tronBase58ToHex41?: (address: string) => string
        requireTreasuryAddress: (address: string | null | undefined, family: 'evm' | 'solana' | 'tron') => string
      }
      assert.equal(typeof api.isValidTronAddress, 'function', 'paymentDestinations must export isValidTronAddress')
      assert.equal(typeof api.tronBase58ToHex41, 'function', 'paymentDestinations must export tronBase58ToHex41')

      assert.equal(api.isValidTronAddress!(OFFICIAL_TRON_USDT_MAINNET), true)
      assert.equal(api.isValidTronAddress!(TRON_TREASURY), true)
      assert.equal(api.tronBase58ToHex41!(OFFICIAL_TRON_USDT_MAINNET), OFFICIAL_TRON_USDT_HEX41)

      const tampered = `${OFFICIAL_TRON_USDT_MAINNET.slice(0, -1)}s`
      for (const bad of [tampered, TRON_ZERO, VALID_EVM, VALID_SOL, '11111111111111111111111111111111', '', '   ']) {
        assert.equal(api.isValidTronAddress!(bad), false, `Must reject invalid TRON address: "${bad}"`)
      }

      assert.equal(api.requireTreasuryAddress(`  ${TRON_TREASURY}  `, 'tron'), TRON_TREASURY)
      assert.throws(() => api.requireTreasuryAddress('', 'tron'), /TREASURY_ADDRESS_REQUIRED/)
      assert.throws(() => api.requireTreasuryAddress(VALID_EVM, 'tron'), /INVALID_TREASURY_ADDRESS/)
      assert.throws(() => api.requireTreasuryAddress(tampered, 'tron'), /INVALID_TREASURY_ADDRESS/)
    })

    it('matches backend 8-network specs 1:1 (contracts, decimals, confirmations, chainIds, RPCs) in USDT-first order and builds Tronscan /#/transaction/ URLs', () => {
      const dests = paymentDestinations.getPaymentDestinations('mainnet', { VITE_PAYMENT_ENABLE_ETHEREUM: 'true' })
      assert.deepEqual(
        dests.map((d) => d.id),
        ['bnb', 'tron', 'polygon', 'solana', 'arbitrum', 'optimism', 'avalanche', 'ethereum'],
        'getPaymentDestinations must use canonical USDT-first ordering',
      )

      const tronMain = paymentDestinations.getPaymentNetworkConfig('tron' as never, 'mainnet', {})
      assert.equal(tronMain.family, 'tron')
      assert.equal(tronMain.chainId, 'tron-mainnet')
      assert.equal(tronMain.usdtContractAddress, OFFICIAL_TRON_USDT_MAINNET)
      assert.equal(tronMain.usdtDecimals, 6)
      assert.equal(tronMain.nativeDecimals, 6)
      assert.equal(tronMain.nativeSymbol, 'TRX')
      assert.equal(tronMain.requiredConfirmations, 20)
      assert.equal(tronMain.rpcUrls[0], 'https://api.trongrid.io')

      const tronTest = paymentDestinations.getPaymentNetworkConfig('tron' as never, 'testnet', {})
      assert.equal(tronTest.chainId, 'tron-nile')
      assert.equal(tronTest.usdtContractAddress, '')
      assert.equal(tronTest.rpcUrls[0], 'https://nile.trongrid.io')

      const arbMain = paymentDestinations.getPaymentNetworkConfig('arbitrum' as never, 'mainnet', {})
      assert.equal(arbMain.chainId, 42161)
      assert.equal(arbMain.usdtContractAddress, '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9')
      assert.equal(arbMain.usdtDecimals, 6)
      assert.equal(arbMain.requiredConfirmations, 20)
      assert.equal(arbMain.rpcUrls[0], 'https://arbitrum-one-rpc.publicnode.com')

      const optMain = paymentDestinations.getPaymentNetworkConfig('optimism' as never, 'mainnet', {})
      assert.equal(optMain.chainId, 10)
      assert.equal(optMain.usdtContractAddress, '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58')
      assert.equal(optMain.usdtDecimals, 6)
      assert.equal(optMain.requiredConfirmations, 20)
      assert.equal(optMain.rpcUrls[0], 'https://optimism-rpc.publicnode.com')

      const avaxMain = paymentDestinations.getPaymentNetworkConfig('avalanche' as never, 'mainnet', {})
      assert.equal(avaxMain.chainId, 43114)
      assert.equal(avaxMain.usdtContractAddress, '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7')
      assert.equal(avaxMain.usdtDecimals, 6)
      assert.equal(avaxMain.nativeSymbol, 'AVAX')
      assert.equal(avaxMain.requiredConfirmations, 12)
      assert.equal(avaxMain.rpcUrls[0], 'https://avalanche-c-chain-rpc.publicnode.com')

      // Explorer URLs
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('tron' as never, VALID_TRON_TX_HASH, 'mainnet'),
        `https://tronscan.org/#/transaction/${VALID_TRON_TX_HASH}`,
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('tron' as never, VALID_TRON_TX_HASH, 'testnet'),
        `https://nile.tronscan.org/#/transaction/${VALID_TRON_TX_HASH}`,
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('arbitrum' as never, '0xabc', 'mainnet'),
        'https://arbiscan.io/tx/0xabc',
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('optimism' as never, '0xabc', 'mainnet'),
        'https://optimistic.etherscan.io/tx/0xabc',
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('avalanche' as never, '0xabc', 'mainnet'),
        'https://snowtrace.io/tx/0xabc',
      )
    })
  })

  describe('Task 4.2: src/appkitConfig.ts registers 8 networks + TronUniversalAdapter preserving PouwMiner.com invariants', () => {
    it('exports dynamic EVM + Solana + TRON resolvers, registers TronUniversalAdapter with 0 legacy connectors, and preserves PouwMiner.com metadata', async () => {
      const appKitSource = readText('src/appkitConfig.ts')
      assert.match(appKitSource, /name:\s*'PouwMiner\.com'/)
      assert.match(appKitSource, /description:\s*'PouwMiner\.com wallet connection'/)
      assert.equal(appKitSource.includes('app.gomining.com'), false)
      assert.equal(appKitSource.includes('walletSession'), false)
      assert.equal(appKitSource.includes('mainnet-beta'), false)
      assert.equal(appKitSource.includes('window.tronLink'), false)
      assert.match(appKitSource, /tronMainnet/)
      assert.match(appKitSource, /tronNileTestnet/)
      assert.match(appKitSource, /arbitrumSepolia/)
      assert.match(appKitSource, /optimismSepolia/)
      assert.match(appKitSource, /avalancheFuji/)
      assert.match(appKitSource, /adapters:\s*\[wagmiAdapter,\s*solanaAdapter,\s*tronAdapter\]/)

      const fnBlockMatch = appKitSource.match(/export function getAppKitEvmNetworksForMode[\s\S]*?(?=export const paymentNetworkMode)/)
      assert.ok(fnBlockMatch, 'src/appkitConfig.ts must export pure network mode resolver functions')

      const wrappedSource = `
        export function createResolvers({
          bsc, bscTestnet, mainnet, polygon, polygonAmoy, sepolia,
          arbitrum, arbitrumSepolia, optimism, optimismSepolia, avalanche, avalancheFuji,
          solana, solanaDevnet, tronMainnet, tronNileTestnet,
          resolvePaymentNetworkMode, isEthereumPaymentEnabled
        }) {
          ${fnBlockMatch[0].replaceAll('export function ', 'function ')}
          return { getAppKitEvmNetworksForMode, getAppKitNetworksForMode, getDefaultAppKitNetworkForMode }
        }
      `
      const transpiled = ts.transpileModule(wrappedSource, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      const mod = await import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`)
      const resolvers = mod.createResolvers({
        bsc,
        bscTestnet,
        mainnet,
        polygon,
        polygonAmoy,
        sepolia,
        arbitrum,
        arbitrumSepolia,
        optimism,
        optimismSepolia,
        avalanche,
        avalancheFuji,
        solana,
        solanaDevnet,
        tronMainnet,
        tronNileTestnet,
        resolvePaymentNetworkMode: paymentDestinations.resolvePaymentNetworkMode,
        isEthereumPaymentEnabled: paymentDestinations.isEthereumPaymentEnabled,
      })

      assert.deepEqual(
        resolvers.getAppKitNetworksForMode('mainnet', {}).map((n: { id: unknown }) => n.id),
        [bsc.id, polygon.id, arbitrum.id, optimism.id, avalanche.id, solana.id, tronMainnet.id],
      )
      assert.deepEqual(
        resolvers.getAppKitNetworksForMode('mainnet', { VITE_PAYMENT_ENABLE_ETHEREUM: 'true' }).map((n: { id: unknown }) => n.id),
        [bsc.id, polygon.id, arbitrum.id, optimism.id, avalanche.id, mainnet.id, solana.id, tronMainnet.id],
      )
      assert.deepEqual(
        resolvers.getAppKitNetworksForMode('testnet', {}).map((n: { id: unknown }) => n.id),
        [bscTestnet.id, polygonAmoy.id, arbitrumSepolia.id, optimismSepolia.id, avalancheFuji.id, solanaDevnet.id, tronNileTestnet.id],
      )
      assert.deepEqual(
        resolvers.getAppKitNetworksForMode('testnet', { VITE_PAYMENT_ENABLE_ETHEREUM: 'true' }).map((n: { id: unknown }) => n.id),
        [bscTestnet.id, polygonAmoy.id, arbitrumSepolia.id, optimismSepolia.id, avalancheFuji.id, sepolia.id, solanaDevnet.id, tronNileTestnet.id],
      )
    })

    it('enables TRON namespace in ConnectorController without disabling other namespaces or filtering out TRON WalletConnect connectors', () => {
      const appKitSource = readText('src/appkitConfig.ts')
      assert.match(
        appKitSource,
        /import\s*\{[^}]*\bConnectorController\b[^}]*\}\s*from\s*'@reown\/appkit-controllers'/,
        'src/appkitConfig.ts must import ConnectorController from @reown/appkit-controllers',
      )

      const setUniversalProviderBlock = extractBlock(appKitSource, 'override async setUniversalProvider(')
      const addConnectorIdx = setUniversalProviderBlock.indexOf('this.addConnector(')
      const filterInAdapterIdx = setUniversalProviderBlock.indexOf("ConnectorController.filterByNamespace('tron', true)")
      assert.ok(addConnectorIdx > 0, 'TronUniversalAdapter.setUniversalProvider must call this.addConnector(...)')
      assert.ok(
        filterInAdapterIdx > addConnectorIdx,
        "TronUniversalAdapter.setUniversalProvider must call ConnectorController.filterByNamespace('tron', true) immediately after this.addConnector(...)",
      )

      const createAppKitIdx = appKitSource.indexOf('export const appKitModal = createAppKit(')
      const filterAfterCreateIdx = appKitSource.indexOf(
        "ConnectorController.filterByNamespace('tron', true)",
        createAppKitIdx,
      )
      assert.ok(createAppKitIdx > 0, 'src/appkitConfig.ts must export appKitModal = createAppKit(...)')
      assert.ok(
        filterAfterCreateIdx > createAppKitIdx,
        "src/appkitConfig.ts must call ConnectorController.filterByNamespace('tron', true) after createAppKit(...)",
      )

      const originalFilterMap = { ...ConnectorController.state.filterByNamespaceMap }
      const originalAllConnectors = [...ConnectorController.state.allConnectors]
      const originalConnectors = [...ConnectorController.state.connectors]

      try {
        // Real ConnectorController behavior before patch: 'tron' is omitted from AVAILABLE_NAMESPACES
        assert.equal(
          ConnectorController.getEnabledNamespaces().includes('tron'),
          false,
          "Before patch, 'tron' must not be in ConnectorController.getEnabledNamespaces()",
        )
        assert.equal(ConnectorController.areAllNamespacesEnabled(), true)

        const tronWcConnector = {
          id: 'walletConnect',
          name: 'WalletConnect',
          type: 'WALLET_CONNECT' as const,
          chain: 'tron' as const,
        }
        ConnectorController.setConnectors([tronWcConnector as never])

        const enabledBefore = ConnectorController.getEnabledConnectors(ConnectorController.getEnabledNamespaces())
        assert.equal(
          enabledBefore.some((connector) => connector.chain === 'tron'),
          false,
          "Before filterByNamespace('tron', true), TRON connector is filtered out by getEnabledConnectors(...)",
        )

        // Apply patch call on real ConnectorController
        ConnectorController.filterByNamespace('tron', true)

        const enabledNamespacesAfter = ConnectorController.getEnabledNamespaces()
        assert.equal(
          enabledNamespacesAfter.includes('tron'),
          true,
          "After filterByNamespace('tron', true), 'tron' must appear in getEnabledNamespaces()",
        )
        assert.equal(
          ConnectorController.areAllNamespacesEnabled(),
          true,
          "After filterByNamespace('tron', true), areAllNamespacesEnabled() must remain true",
        )

        const enabledAfter = ConnectorController.getEnabledConnectors(enabledNamespacesAfter)
        assert.equal(
          enabledAfter.some((connector) => connector.chain === 'tron' && connector.id === 'walletConnect'),
          true,
          "After filterByNamespace('tron', true), TRON WalletConnect connector must not be filtered out",
        )
        assert.equal(
          ConnectorController.state.connectors.some((connector) => connector.chain === 'tron' && connector.id === 'walletConnect'),
          true,
          'ConnectorController.state.connectors must expose the TRON WalletConnect connector',
        )
      } finally {
        for (const key of Object.keys(ConnectorController.state.filterByNamespaceMap)) {
          if (!Object.hasOwn(originalFilterMap, key)) {
            delete (ConnectorController.state.filterByNamespaceMap as Record<string, boolean | undefined>)[key]
          }
        }
        Object.assign(ConnectorController.state.filterByNamespaceMap, originalFilterMap)
        ConnectorController.state.allConnectors.splice(
          0,
          ConnectorController.state.allConnectors.length,
          ...originalAllConnectors,
        )
        ConnectorController.state.connectors = originalConnectors
      }
    })
  })

  describe('Task 4.3: src/tronPayment.ts TRC-20 ABI encoding, TronGrid builders, WalletConnect signing & 4001 no-retry', () => {
    it('encodes TRC-20 transfer(address,uint256) in pure BigInt, builds USDT/TRX transactions, signs via tron_signTransaction, broadcasts, and rethrows 4001 without retry', async () => {
      const tronPayment = await import('../src/tronPayment.ts')

      const param = tronPayment.encodeTrc20TransferParameter(TRON_TREASURY, '100000000')
      assert.equal(param.length, 128)
      assert.equal(param.slice(0, 64), '0'.repeat(24) + '1111111111111111111111111111111111111111')
      assert.equal(param.slice(64), (100_000_000n).toString(16).padStart(64, '0'))

      // Build USDT TRC-20 transaction
      const requests: Array<{ url: string; body: Record<string, unknown> }> = []
      const fakeFetch = async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : {}
        requests.push({ url, body })
        if (url.endsWith('/wallet/triggersmartcontract')) {
          return {
            ok: true,
            async json() {
              return { result: { result: true }, transaction: { txID: VALID_TRON_TX_HASH, raw_data: {} } }
            },
          } as Response
        }
        if (url.endsWith('/wallet/createtransaction')) {
          return {
            ok: true,
            async json() {
              return { txID: VALID_TRON_TX_HASH, raw_data: {} }
            },
          } as Response
        }
        if (url.endsWith('/wallet/broadcasttransaction')) {
          return {
            ok: true,
            async json() {
              return { result: true, txid: VALID_TRON_TX_HASH }
            },
          } as Response
        }
        throw new Error(`Unexpected URL ${url}`)
      }

      const usdtTx = await tronPayment.buildTronPaymentTransaction({
        senderAddress: TRON_SENDER,
        recipientAddress: TRON_TREASURY,
        asset: 'USDT',
        expectedAmountAtomic: '100000000',
        networkMode: 'mainnet',
        env: {},
        fetchImpl: fakeFetch as unknown as typeof fetch,
      })
      assert.equal(usdtTx.txID, VALID_TRON_TX_HASH)
      assert.equal(requests[0].url, 'https://api.trongrid.io/wallet/triggersmartcontract')
      assert.equal(requests[0].body.fee_limit, 100_000_000)
      assert.equal(requests[0].body.function_selector, 'transfer(address,uint256)')
      assert.equal(requests[0].body.parameter, param)

      // Build TRX native transaction
      const trxTx = await tronPayment.buildTronPaymentTransaction({
        senderAddress: TRON_SENDER,
        recipientAddress: TRON_TREASURY,
        asset: 'TRX',
        expectedAmountAtomic: '50000000',
        networkMode: 'testnet',
        env: {},
        fetchImpl: fakeFetch as unknown as typeof fetch,
      })
      assert.equal(trxTx.txID, VALID_TRON_TX_HASH)
      assert.equal(requests[1].url, 'https://nile.trongrid.io/wallet/createtransaction')
      assert.equal(requests[1].body.amount, 50_000_000)

      // Sign via tron_signTransaction + broadcast
      const providerCalls: Array<{ method: string; chain?: string }> = []
      const txHash = await tronPayment.submitTronTransactionViaProvider({
        provider: {
          async request(args: { method: string; params: unknown }, chain?: string) {
            providerCalls.push({ method: args.method, chain })
            return { result: { ...usdtTx, signature: ['sig_hex'] } }
          },
        },
        transaction: usdtTx,
        senderAddress: TRON_SENDER,
        networkMode: 'mainnet',
        env: {},
        fetchImpl: fakeFetch as unknown as typeof fetch,
      })
      assert.equal(txHash, VALID_TRON_TX_HASH)
      assert.deepEqual(providerCalls, [{ method: 'tron_signTransaction', chain: 'tron:0x2b6653dc' }])

      // User rejection 4001 rethrown immediately with 0 retries (no double prompt)
      let signAttempts = 0
      await assert.rejects(
        () => tronPayment.submitTronTransactionViaProvider({
          provider: {
            async request() {
              signAttempts += 1
              const err = new Error('User rejected request') as Error & { code?: number }
              err.code = 4001
              throw err
            },
            async signTransaction() {
              signAttempts += 1
              return {}
            },
          },
          transaction: usdtTx,
          senderAddress: TRON_SENDER,
          networkMode: 'mainnet',
          env: {},
          fetchImpl: fakeFetch as unknown as typeof fetch,
        }),
        (err: { code?: number }) => err.code === 4001,
      )
      assert.equal(signAttempts, 1, '4001 user rejection must NOT trigger fallback signTransaction retry')
    })
  })

  describe('Task 5: 3-Family Coordinator, WalletSession <= 130 lines, WalletPanel, Checkout USDT-First & History', () => {
    it('resolves TRON wallet cleanly, blocks dormant Wagmi hijack, rejects snapshot tears, and validates TRON signer/cluster parity + 8-network F-01 lock', () => {
      // Valid TRON wallet via AppKit
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: TRON_SENDER,
          isAppKitConnected: true,
          appKitCaipAddress: `tron:0x2b6653dc:${TRON_SENDER}`,
          caipNamespace: 'tron',
          wagmiAddress: VALID_EVM,
          isWagmiConnected: true,
        }),
        {
          activeAddress: TRON_SENDER,
          isWalletConnected: true,
          isEvmWallet: false,
          isSolanaWallet: false,
          isTronWallet: true,
        },
      )

      // Dormant Wagmi EVM blocked when caipNamespace === 'tron' && !isAppKitConnected
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: undefined,
          isAppKitConnected: false,
          caipNamespace: 'tron',
          wagmiAddress: VALID_EVM,
          isWagmiConnected: true,
        }),
        {
          activeAddress: '',
          isWalletConnected: false,
          isEvmWallet: false,
          isSolanaWallet: false,
          isTronWallet: false,
        },
      )

      // Snapshot tears rejected (tron + 0x..., solana + T...)
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: VALID_EVM,
          isAppKitConnected: true,
          caipNamespace: 'tron',
          isWagmiConnected: true,
          wagmiAddress: VALID_EVM,
        }),
        { activeAddress: '', isWalletConnected: false, isEvmWallet: false, isSolanaWallet: false, isTronWallet: false },
      )
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: TRON_SENDER,
          isAppKitConnected: true,
          caipNamespace: 'solana',
          isWagmiConnected: false,
        }),
        { activeAddress: '', isWalletConnected: false, isEvmWallet: false, isSolanaWallet: false, isTronWallet: false },
      )

      // TRON signer & cluster parity
      const api = coordinator as unknown as {
        validateTronSigningParity?: (input: { activeAddress?: string | null; intentSenderWallet?: string | null }) => { ok: boolean; error?: string }
        validateTronClusterParity?: (input: { caipNetworkId?: string | null; caipChainId?: string | number | null; expectedNetworkMode: 'mainnet' | 'testnet' }) => { ok: boolean; expectedLabel: string; actualLabel: string; error?: string }
      }
      assert.equal(typeof api.validateTronSigningParity, 'function')
      assert.equal(typeof api.validateTronClusterParity, 'function')

      assert.equal(api.validateTronSigningParity!({ activeAddress: TRON_SENDER, intentSenderWallet: TRON_SENDER }).ok, true)
      assert.equal(api.validateTronSigningParity!({ activeAddress: TRON_SENDER, intentSenderWallet: TRON_OTHER }).ok, false)
      assert.equal(api.validateTronSigningParity!({ activeAddress: VALID_EVM, intentSenderWallet: TRON_SENDER }).ok, false)

      assert.equal(
        api.validateTronClusterParity!({ caipNetworkId: 'tron:0x2b6653dc', caipChainId: '0x2b6653dc', expectedNetworkMode: 'mainnet' }).ok,
        true,
      )
      assert.equal(
        api.validateTronClusterParity!({ caipNetworkId: 'tron:0xcd8690dc', caipChainId: '0xcd8690dc', expectedNetworkMode: 'testnet' }).ok,
        true,
      )
      assert.equal(
        api.validateTronClusterParity!({ caipNetworkId: 'tron:0xcd8690dc', expectedNetworkMode: 'mainnet' }).ok,
        false,
      )
      assert.equal(
        api.validateTronClusterParity!({ caipNetworkId: 'tron:0x2b6653dc', expectedNetworkMode: 'testnet' }).ok,
        false,
      )
      assert.equal(
        api.validateTronClusterParity!({ caipNetworkId: 'eip155:56', expectedNetworkMode: 'mainnet' }).ok,
        false,
      )

      // BroadcastTxLock accepts all 4 new networks (F-01)
      const store = new Map<string, string>()
      const memStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v) },
        removeItem: (k: string) => { store.delete(k) },
      }
      for (const net of ['tron', 'arbitrum', 'optimism', 'avalanche'] as const) {
        const written = coordinator.writeBroadcastTxLock(
          {
            uid: 'u1',
            intentId: `pi_${net}`,
            txHash: VALID_TRON_TX_HASH,
            networkId: net as never,
            networkMode: 'mainnet',
            broadcastAt: 1764096000000,
          },
          memStorage,
        )
        assert.equal(written, true, `BroadcastTxLock must accept ${net}`)
        assert.equal(coordinator.readBroadcastTxLock('u1', `pi_${net}`, memStorage)?.networkId, net)
      }
    })

    it('wires WalletPaymentCheckout USDT-first order, TRON branch + F-01 lock, WalletSession <= 130 lines, WalletPanel & ClientPaymentHistory', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const sessionSrc = readText('src/walletSession.ts')
      const panelSrc = readText('src/WalletPanel.tsx')

      // walletSession <= 130 lines with TRON support
      assert.ok(sessionSrc.split(/\r?\n/).length <= 130, 'walletSession.ts must remain <= 130 lines')
      assert.ok(sessionSrc.includes("'TRON'"), 'walletSession.ts must support TRON protocol')
      assert.ok(sessionSrc.includes('Billetera TRON'), 'walletSession.ts must label Billetera TRON')

      // WalletPanel TRON label
      assert.match(panelSrc, /PASARELA POUWMINER · EVM, SOLANA (&amp;|&) TRON/, 'WalletPanel.tsx must display PASARELA POUWMINER · EVM, SOLANA & TRON')

      // Checkout USDT-first order
      const networksMatch = checkoutSrc.match(/export const networks:[\s\S]*?\]/)
      assert.ok(networksMatch, 'WalletPaymentCheckout.tsx must export networks array')
      const ids = Array.from(networksMatch[0].matchAll(/id:\s*'([a-z]+)'/g)).map((m) => m[1])
      assert.deepEqual(ids, ['bnb', 'tron', 'polygon', 'solana', 'arbitrum', 'optimism', 'avalanche', 'ethereum'])

      // USDT standard badges
      assert.ok(checkoutSrc.includes('TRC-20'), 'WalletPaymentCheckout must render TRC-20 standard for TRON USDT')
      assert.ok(checkoutSrc.includes('BEP-20'), 'WalletPaymentCheckout must render BEP-20 standard for BNB USDT')
      assert.ok(checkoutSrc.includes('ERC-20'), 'WalletPaymentCheckout must render ERC-20 standard for EVM USDT')

      // TRON provider & handlePay guards before F-01 lock & confirmPaymentIntent
      assert.ok(checkoutSrc.includes("useAppKitProvider<TronAppKitProvider>('tron')") || checkoutSrc.includes("useAppKitProvider('tron')"))
      const payBlock = extractBlock(checkoutSrc, 'const handlePay = async')
      const tronClusterIdx = payBlock.indexOf('validateTronClusterParity(')
      const tronSignerIdx = payBlock.indexOf('validateTronSigningParity(')
      const tronBuildIdx = payBlock.indexOf('buildTronPaymentTransaction(')
      const tronSubmitIdx = payBlock.indexOf('submitTronTransactionViaProvider(')
      const writeLockIdx = payBlock.indexOf('writeBroadcastTxLock(')
      const confirmIdx = payBlock.indexOf('confirmPaymentIntent(intent.intentId, txHash)')
      assert.ok(tronClusterIdx > 0 && tronSignerIdx > tronClusterIdx && tronBuildIdx > tronSignerIdx && tronSubmitIdx > tronBuildIdx && writeLockIdx > tronSubmitIdx && confirmIdx > writeLockIdx)

      const retryBlock = extractBlock(checkoutSrc, 'const handleRetryVerification = async')
      assert.equal(retryBlock.includes('submitTronTransactionViaProvider'), false, 'handleRetryVerification must NEVER re-sign TRON tx')

      // Client payment history explorer URLs for all 4 new networks
      assert.equal(
        historyService.buildClientOrderExplorerUrl({ paymentNetwork: 'tron', networkMode: 'mainnet', txHash: VALID_TRON_TX_HASH }),
        `https://tronscan.org/#/transaction/${VALID_TRON_TX_HASH}`,
      )
      assert.equal(
        historyService.buildClientOrderExplorerUrl({ paymentNetwork: 'tron', networkMode: 'testnet', txHash: VALID_TRON_TX_HASH }),
        `https://nile.tronscan.org/#/transaction/${VALID_TRON_TX_HASH}`,
      )
      assert.equal(
        historyService.buildClientOrderExplorerUrl({ paymentNetwork: 'arbitrum', networkMode: 'mainnet', txHash: '0x123' }),
        'https://arbiscan.io/tx/0x123',
      )
      assert.equal(
        historyService.buildClientOrderExplorerUrl({ paymentNetwork: 'optimism', networkMode: 'mainnet', txHash: '0x123' }),
        'https://optimistic.etherscan.io/tx/0x123',
      )
      assert.equal(
        historyService.buildClientOrderExplorerUrl({ paymentNetwork: 'avalanche', networkMode: 'mainnet', txHash: '0x123' }),
        'https://snowtrace.io/tx/0x123',
      )
    })

    it('Review C-01 / I-01 / I-02 / I-03 / I-04: resolves TRON-only WC session when activeChain=eip155, verifies session cluster parity, hardens TronUniversalAdapter, handles testnet switch & WC 5000', async () => {
      // C-01: TRON-only wallet connected via WalletConnect while AppKit default activeChain is still eip155
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: undefined,
          isAppKitConnected: false,
          caipNamespace: 'eip155',
          wagmiAddress: undefined,
          isWagmiConnected: false,
          tronAppKitAddress: TRON_SENDER,
          isTronAppKitConnected: true,
          tronAppKitCaipAddress: `tron:0x2b6653dc:${TRON_SENDER}`,
        } as never),
        {
          activeAddress: TRON_SENDER,
          isWalletConnected: true,
          isEvmWallet: false,
          isSolanaWallet: false,
          isTronWallet: true,
        },
      )

      // C-01: walletSession.ts, WalletPanel.tsx, WalletPaymentCheckout.tsx all subscribe to TRON namespace account
      for (const file of ['src/walletSession.ts', 'src/WalletPanel.tsx', 'src/WalletPaymentCheckout.tsx']) {
        const src = readText(file)
        assert.ok(
          src.includes("useAppKitAccount({ namespace: 'tron' })"),
          `${file} must call useAppKitAccount({ namespace: 'tron' }) so TRON-only WC sessions are visible when activeChain defaults to eip155`,
        )
      }
      assert.ok(readText('src/walletSession.ts').split(/\r?\n/).length <= 130, 'walletSession.ts must remain <= 130 lines')

      // I-01: validateTronClusterParity fails closed when WC session approved Nile even if caipNetwork fell back to Mainnet
      const mismatchSession = (coordinator.validateTronClusterParity as unknown as (input: Record<string, unknown>) => { ok: boolean; error?: string })({
        caipNetworkId: 'tron:0x2b6653dc',
        caipChainId: '0x2b6653dc',
        expectedNetworkMode: 'mainnet',
        sessionAccounts: [`tron:0xcd8690dc:${TRON_SENDER}`],
        sessionChains: ['tron:0xcd8690dc'],
      })
      assert.equal(mismatchSession.ok, false, 'Must reject Nile WalletConnect session even when AppKit fallback caipNetwork reports Mainnet')

      const matchingSession = (coordinator.validateTronClusterParity as unknown as (input: Record<string, unknown>) => { ok: boolean })({
        caipNetworkId: 'tron:0x2b6653dc',
        caipChainId: '0x2b6653dc',
        expectedNetworkMode: 'mainnet',
        sessionAccounts: [`tron:0x2b6653dc:${TRON_SENDER}`],
        sessionChains: ['tron:0x2b6653dc'],
      })
      assert.equal(matchingSession.ok, true)

      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      assert.ok(
        checkoutSrc.includes('tronProvider.session?.namespaces?.tron'),
        'WalletPaymentCheckout.tsx must pass tronProvider.session?.namespaces?.tron into validateTronClusterParity',
      )

      // I-02: TronUniversalAdapter lifecycle fixes in src/appkitConfig.ts
      const appKitSrc = readText('src/appkitConfig.ts')
      assert.match(appKitSrc, /finally\s*\{\s*this\.emit\('disconnect'\)/, 'TronUniversalAdapter.disconnect must emit disconnect in finally')
      assert.ok(appKitSrc.includes("session?.namespaces?.tron?.accounts"), 'TronUniversalAdapter must read session TRON accounts in getAccounts/syncConnection')

      // I-03: Network chip switch in WalletPaymentCheckout auto-falls back when target testnet USDT contract is unset
      assert.match(
        checkoutSrc,
        /getPaymentNetworkConfig\(net\.id,\s*intent\?\.networkMode\)\.usdtContractAddress/,
        'Network chip click must guard against unset testnet USDT contract on target network',
      )

      // I-04: tronPayment handles already-broadcast { result: true, txid }, signedTransaction, rejects unsigned tx, and WalletPaymentCheckout classifies WC 5000 rejection
      const tronPayment = await import('../src/tronPayment.ts')
      const alreadyBroadcast = await tronPayment.submitTronTransactionViaProvider({
        provider: {
          async request() {
            return { result: true, txid: VALID_TRON_TX_HASH }
          },
        },
        transaction: { txID: VALID_TRON_TX_HASH },
        senderAddress: TRON_SENDER,
        networkMode: 'mainnet',
        env: {},
        fetchImpl: (async () => {
          throw new Error('Must NOT re-broadcast when wallet already returned { result: true, txid }')
        }) as unknown as typeof fetch,
      })
      assert.equal(alreadyBroadcast, VALID_TRON_TX_HASH)

      await assert.rejects(
        () => tronPayment.submitTronTransactionViaProvider({
          provider: {
            async request() {
              return { txID: VALID_TRON_TX_HASH } // missing signature
            },
          },
          transaction: { txID: VALID_TRON_TX_HASH },
          senderAddress: TRON_SENDER,
          networkMode: 'mainnet',
          env: {},
          fetchImpl: (async () => {
            throw new Error('Must NOT broadcast unsigned transaction')
          }) as unknown as typeof fetch,
        }),
        /TRON_SIGN_FAILED/,
      )

      assert.match(checkoutSrc, /code === 5000/, 'classifyPaymentError must map WalletConnect 5000 to USER_REJECTION')
    })
  })
})
