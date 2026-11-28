import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import ts from 'typescript'
import { WcHelpersUtil } from '@reown/appkit-controllers'
import { bsc, mainnet, solana, tronMainnet, type AppKitNetwork } from '@reown/appkit/networks'
import { createWalletClient, custom } from 'viem'
import { mainnet as viemMainnet } from 'viem/chains'

const projectRoot = path.resolve(import.meta.dirname, '..')

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

async function loadAppKitEvmHelpers() {
  const appKitSource = readText('src/appkitConfig.ts')
  const methodsMatch = appKitSource.match(/export const DEFAULT_EVM_WC_METHODS = \[[\s\S]*?\] as const/)
  assert.ok(methodsMatch, 'src/appkitConfig.ts must export DEFAULT_EVM_WC_METHODS')

  const helpersStart = appKitSource.indexOf('export interface EvmUniversalProviderLike')
  assert.notEqual(helpersStart, -1, 'src/appkitConfig.ts must export EvmUniversalProviderLike')
  const prepareStart = appKitSource.indexOf('export async function prepareWagmiEvmSigningProvider')
  assert.notEqual(prepareStart, -1, 'src/appkitConfig.ts must export prepareWagmiEvmSigningProvider')
  assert.ok(prepareStart > helpersStart, 'prepareWagmiEvmSigningProvider must appear after ensureEvmProviderMethodsHydrated')

  const pureSource = `${methodsMatch[0]}\n${appKitSource.slice(helpersStart, prepareStart)}`
  const transpiled = ts.transpileModule(pureSource, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const mod = (await import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  )) as {
    DEFAULT_EVM_WC_METHODS: readonly string[]
    ensureEvmProviderMethodsHydrated: (provider: unknown, expectedChainId?: number) => void
  }
  return mod
}

async function loadCheckoutErrorClassifier() {
  const checkoutSource = readText('src/WalletPaymentCheckout.tsx')
  const fnMatch = checkoutSource.match(
    /export function sanitizeErrorReason[\s\S]*?(?=export function WalletPaymentCheckout)/,
  )
  assert.ok(fnMatch, 'WalletPaymentCheckout.tsx must export sanitizeErrorReason and classifyPaymentError')
  const transpiled = ts.transpileModule(fnMatch[0], {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  return (await import(
    `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  )) as {
    sanitizeErrorReason: (raw: unknown) => string
    classifyPaymentError: (
      err: unknown,
      networkName: string,
    ) => {
      message: string
      kind: string
      name?: string
      code?: number | string
      shortMessage?: string
      category: string
    }
  }
}

describe('AppKit / WalletConnect Mobile EVM RPC Signing Fix (5201 Unknown method(s) requested & Viem UnknownRpcError)', () => {
  describe('Suite 1: Clean EVM WalletConnect namespace method negotiation in src/appkitConfig.ts', () => {
    it('exports standard EOA DEFAULT_EVM_WC_METHODS excluding experimental EIP-5792/7715/7811 methods and wires universalProviderConfigOverride', async () => {
      const appKitSource = readText('src/appkitConfig.ts')
      const { DEFAULT_EVM_WC_METHODS } = await loadAppKitEvmHelpers()

      const expectedStandardMethods = [
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
      ]
      assert.deepEqual([...DEFAULT_EVM_WC_METHODS], expectedStandardMethods)

      for (const forbidden of [
        'wallet_sendCalls',
        'wallet_getCapabilities',
        'wallet_getCallsStatus',
        'wallet_showCallsStatus',
        'wallet_grantPermissions',
        'wallet_revokePermissions',
        'wallet_getAssets',
        'eth_sign',
        'wallet_scanQRCode',
      ]) {
        assert.equal(
          DEFAULT_EVM_WC_METHODS.includes(forbidden),
          false,
          `DEFAULT_EVM_WC_METHODS must exclude unsupported/experimental method ${forbidden}`,
        )
      }

      const createAppKitBlock = extractBlock(appKitSource, 'export const appKitModal = createAppKit(')
      assert.match(
        createAppKitBlock,
        /universalProviderConfigOverride:\s*\{[\s\S]*?methods:\s*\{[\s\S]*?eip155:\s*\[\.\.\.DEFAULT_EVM_WC_METHODS\]/,
        'createAppKit must pass universalProviderConfigOverride.methods.eip155 = [...DEFAULT_EVM_WC_METHODS]',
      )

      // Real @reown/appkit-controllers WcHelpersUtil.createNamespaces behavior check
      const caipNetworks: AppKitNetwork[] = [bsc, mainnet, solana, tronMainnet]
      const namespaces = WcHelpersUtil.createNamespaces(caipNetworks as never, {
        methods: { eip155: [...DEFAULT_EVM_WC_METHODS] },
      })
      assert.deepEqual(namespaces.eip155?.methods, expectedStandardMethods)
      assert.ok(
        namespaces.solana?.methods?.includes('solana_signAndSendTransaction'),
        'Solana namespace methods must remain intact',
      )
      assert.ok(
        namespaces.tron?.methods?.includes('tron_signTransaction'),
        'TRON namespace methods must remain intact',
      )
    })
  })

  describe('Suite 2: UniversalProvider EVM hydration, multichain namespace ordering, wallet_sendTransaction guard & direct client fallback', () => {
    it('hydrates missing/empty rpcProviders.eip155.namespace.methods, reorders namespaces so eip155 is first while preserving tron/solana, and re-hydrates after setDefaultChain', async () => {
      const { DEFAULT_EVM_WC_METHODS, ensureEvmProviderMethodsHydrated } = await loadAppKitEvmHelpers()

      const setDefaultChainCalls: string[] = []
      const namespacesRef: Record<string, { chains?: string[]; methods?: string[]; events?: string[]; defaultChain?: string }> = {
        tron: { chains: ['tron:0x2b6653dc'], methods: ['tron_signTransaction'], events: [] },
        solana: { chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'], methods: ['solana_signTransaction'], events: [] },
      }
      const provider = {
        isWalletConnect: true,
        session: {
          topic: 'wc_topic_eth_1',
          namespaces: {
            tron: {
              accounts: ['tron:0x2b6653dc:TTest11111111111111111111111111111'],
              chains: ['tron:0x2b6653dc'],
              methods: ['tron_signTransaction', 'tron_signMessage'],
            },
            eip155: {
              accounts: ['eip155:1:0x9561aA554476A4C7C77f3B82ba2e16727445D58e', 'eip155:56:0x9561aA554476A4C7C77f3B82ba2e16727445D58e'],
              chains: ['eip155:1', 'eip155:56'],
              methods: ['eth_sendTransaction', 'personal_sign', 'wallet_switchEthereumChain'],
            },
          },
        },
        namespaces: namespacesRef,
        rpcProviders: {
          eip155: {
            namespace: {
              chains: ['eip155:1', 'eip155:56'],
              methods: [] as string[],
            },
          },
        },
        setDefaultChain(caipChain: string) {
          setDefaultChainCalls.push(caipChain)
          // Reproduce UniversalProvider.updateNamespaceChain() wiping methods to []
          this.rpcProviders.eip155.namespace.methods = []
        },
        async request() {
          return '0x1'
        },
      }

      ensureEvmProviderMethodsHydrated(provider, 1)

      assert.deepEqual(setDefaultChainCalls, ['eip155:1'])
      assert.equal(provider.namespaces, namespacesRef, 'Must mutate provider.namespaces in-place to preserve UniversalProvider reference')
      assert.deepEqual(Object.keys(provider.namespaces), ['eip155', 'tron', 'solana'])
      assert.deepEqual(provider.rpcProviders.eip155.namespace.methods, [
        'eth_sendTransaction',
        'personal_sign',
        'wallet_switchEthereumChain',
      ])
      assert.deepEqual(provider.namespaces.eip155.methods, [
        'eth_sendTransaction',
        'personal_sign',
        'wallet_switchEthereumChain',
      ])
      assert.deepEqual(provider.namespaces.tron.methods, ['tron_signTransaction'])
      assert.deepEqual(provider.namespaces.solana.methods, ['solana_signTransaction'])

      // Fallback to DEFAULT_EVM_WC_METHODS when session.namespaces.eip155.methods is empty/missing
      const emptySessionProvider = {
        isWalletConnect: true,
        session: {
          namespaces: {
            eip155: {
              chains: ['eip155:1'],
              methods: [],
            },
          },
        },
        rpcProviders: {
          eip155: {
            namespace: {
              chains: ['eip155:1'],
              methods: undefined as unknown as string[],
            },
          },
        },
      }
      ensureEvmProviderMethodsHydrated(emptySessionProvider, 1)
      assert.deepEqual(emptySessionProvider.rpcProviders.eip155.namespace.methods, [...DEFAULT_EVM_WC_METHODS])
    })

    it('Review CRITICAL #2 + IMPORTANT #5 + MINOR #7.1: repairs namespaces BEFORE calling setDefaultChain (real UniversalProvider validateChain), merges partial method arrays, and reads CAIP-qualified session keys', async () => {
      const { ensureEvmProviderMethodsHydrated } = await loadAppKitEvmHelpers()

      let setDefaultChainSucceeded = false
      const multichainProvider = {
        isWalletConnect: true,
        session: {
          topic: 'wc_topic_caip_key',
          namespaces: {
            'eip155:1': {
              accounts: ['eip155:1:0x9561aA554476A4C7C77f3B82ba2e16727445D58e'],
              chains: ['eip155:1'],
              methods: ['eth_sendTransaction', 'personal_sign', 'wallet_switchEthereumChain'],
            },
          },
        },
        // Non-empty namespaces lacking eip155 — real UniversalProvider.validateChain('eip155:1') throws if called before repair
        namespaces: {
          tron: { chains: ['tron:0x2b6653dc'], methods: ['tron_signTransaction'], events: [] },
        } as Record<string, { chains?: string[]; methods?: string[]; events?: string[]; defaultChain?: string }>,
        rpcProviders: {
          eip155: {
            namespace: {
              chains: ['eip155:1'],
              // Truncated/partial method list missing eth_sendTransaction (IMPORTANT #5)
              methods: ['eth_accounts'],
            },
          },
        },
        setDefaultChain(caipChain: string) {
          // Mirror real UniversalProvider.validateChain(): throws if namespaces is non-empty and lacks eip155
          const keys = Object.keys(this.namespaces)
          if (keys.length > 0 && !keys.some((k) => k === 'eip155' || k.startsWith('eip155:'))) {
            throw new Error("Namespace 'eip155' is not configured. Please call connect() first with namespace config.")
          }
          // Mirror synchronous listener checking methods are already hydrated before DEFAULT_CHAIN_CHANGED fires
          assert.equal(this.rpcProviders.eip155.namespace.methods.includes('eth_sendTransaction'), true)
          assert.equal(caipChain, 'eip155:1')
          setDefaultChainSucceeded = true
          // Mirror updateNamespaceChain wiping methods to []
          this.rpcProviders.eip155.namespace.methods = []
        },
      }

      ensureEvmProviderMethodsHydrated(multichainProvider, 1)
      assert.equal(setDefaultChainSucceeded, true, 'setDefaultChain must run AFTER namespaces.eip155 is repaired so validateChain passes')
      assert.deepEqual(Object.keys(multichainProvider.namespaces), ['eip155', 'tron'])
      assert.equal(multichainProvider.rpcProviders.eip155.namespace.methods.includes('eth_sendTransaction'), true)
      assert.equal(multichainProvider.namespaces.eip155.methods?.includes('eth_sendTransaction'), true)

      // IMPORTANT #3.2: Must NOT poison defaultChain with an unapproved chainId
      const unapprovedCheckProvider = {
        isWalletConnect: true,
        session: {
          namespaces: {
            eip155: {
              chains: ['eip155:56'],
              methods: ['eth_sendTransaction'],
            },
          },
        },
        namespaces: {
          eip155: { chains: ['eip155:56'], methods: ['eth_accounts'], events: [], defaultChain: '56' },
        },
        rpcProviders: {
          eip155: { namespace: { chains: ['eip155:56'], methods: ['eth_accounts'] } },
        },
        setDefaultChain() {
          throw new Error('Must NOT call setDefaultChain for unapproved chain eip155:1')
        },
      }
      ensureEvmProviderMethodsHydrated(unapprovedCheckProvider, 1)
      assert.equal(unapprovedCheckProvider.namespaces.eip155.defaultChain, '56', 'Must NOT overwrite defaultChain with unapproved chainId')
      assert.equal(unapprovedCheckProvider.rpcProviders.eip155.namespace.methods.includes('eth_sendTransaction'), true)
    })

    it('guards unapproved wallet_sendTransaction with -32601 so real Viem sendTransaction preserves original eth_sendTransaction error instead of triggering 5201 UnknownRpcError', async () => {
      const { ensureEvmProviderMethodsHydrated } = await loadAppKitEvmHelpers()

      const receivedMethods: string[] = []
      const wcProvider = {
        isWalletConnect: true,
        session: {
          topic: 'wc_topic_viem_guard',
          namespaces: {
            eip155: {
              accounts: ['eip155:1:0x9561aA554476A4C7C77f3B82ba2e16727445D58e'],
              chains: ['eip155:1'],
              methods: ['eth_sendTransaction', 'personal_sign', 'wallet_switchEthereumChain'],
            },
          },
        },
        namespaces: {
          eip155: { chains: ['eip155:1'], methods: ['eth_sendTransaction'], events: [] },
        },
        rpcProviders: {
          eip155: { namespace: { chains: ['eip155:1'], methods: ['eth_sendTransaction'] } },
        },
        async request(args: { method: string; params?: unknown }) {
          receivedMethods.push(args.method)
          if (args.method === 'eth_chainId') return '0x1'
          if (args.method === 'eth_sendTransaction') {
            throw Object.assign(new Error('insufficient funds for gas * price + value'), { code: -32000 })
          }
          if (args.method === 'wallet_sendTransaction') {
            // Mobile wallet would throw 5201 Unknown method(s) requested
            throw Object.assign(new Error('Unknown method(s) requested'), { code: 5201 })
          }
          throw Object.assign(new Error(`Unexpected method ${args.method}`), { code: -32601 })
        },
      }

      // Idempotent double hydration
      ensureEvmProviderMethodsHydrated(wcProvider, 1)
      ensureEvmProviderMethodsHydrated(wcProvider, 1)

      const walletClient = createWalletClient({
        chain: viemMainnet,
        transport: custom(wcProvider),
      })

      let caughtError: unknown
      try {
        await walletClient.sendTransaction({
          account: '0x9561aA554476A4C7C77f3B82ba2e16727445D58e',
          to: '0x1111111111111111111111111111111111111111',
          value: 12159680929973n,
          data: '0x',
        })
      } catch (err) {
        caughtError = err
      }

      assert.ok(caughtError, 'Expected sendTransaction to throw insufficient funds error')
      assert.equal(
        receivedMethods.includes('wallet_sendTransaction'),
        false,
        'Unapproved wallet_sendTransaction MUST NOT reach the underlying WalletConnect transport',
      )
      assert.equal(receivedMethods.includes('eth_sendTransaction'), true)

      const { classifyPaymentError } = await loadCheckoutErrorClassifier()
      const classified = classifyPaymentError(caughtError, 'Ethereum')
      assert.equal(
        classified.kind,
        'INSUFFICIENT_FUNDS',
        `Expected real eth_sendTransaction error to survive Viem fallback and classify as INSUFFICIENT_FUNDS, got ${classified.kind}: ${classified.message}`,
      )

      // When wallet_sendTransaction IS explicitly approved by the session, pass it through
      let approvedWalletSendCalled = false
      const smartWcProvider = {
        isWalletConnect: true,
        session: {
          namespaces: {
            eip155: {
              chains: ['eip155:1'],
              methods: ['eth_sendTransaction', 'wallet_sendTransaction'],
            },
          },
        },
        rpcProviders: {
          eip155: { namespace: { chains: ['eip155:1'], methods: ['eth_sendTransaction', 'wallet_sendTransaction'] } },
        },
        async request(args: { method: string }) {
          if (args.method === 'wallet_sendTransaction') {
            approvedWalletSendCalled = true
            return '0xabc123'
          }
          return '0x1'
        },
      }
      ensureEvmProviderMethodsHydrated(smartWcProvider, 1)
      assert.equal(await smartWcProvider.request({ method: 'wallet_sendTransaction' }), '0xabc123')
      assert.equal(approvedWalletSendCalled, true)

      // Non-WalletConnect injected EIP-1193 provider (e.g. MetaMask desktop) must remain completely untouched
      const originalInjectedRequest = async () => '0xinjected'
      const injectedProvider = {
        isMetaMask: true,
        request: originalInjectedRequest,
      }
      ensureEvmProviderMethodsHydrated(injectedProvider, 1)
      assert.equal(injectedProvider.request, originalInjectedRequest, 'Injected browser wallet request must NOT be wrapped')
    })

    it('falls back to provider.client.request when rpcProviders.eip155 is missing and preserves 0-retry on 4001/5000 user rejection', async () => {
      const { ensureEvmProviderMethodsHydrated } = await loadAppKitEvmHelpers()

      const clientCalls: Array<{ topic: string; chainId: string; request: { method: string; params: unknown } }> = []
      const missingRpcProvider = {
        isWalletConnect: true,
        session: {
          topic: 'wc_topic_direct_eth',
          namespaces: {
            eip155: {
              accounts: ['eip155:1:0x9561aA554476A4C7C77f3B82ba2e16727445D58e'],
              chains: ['eip155:1'],
              methods: ['eth_sendTransaction', 'personal_sign'],
            },
          },
        },
        rpcProviders: {},
        client: {
          async request(payload: { topic: string; chainId: string; request: { method: string; params: unknown } }) {
            clientCalls.push(payload)
            return '0xdeadbeef'
          },
        },
        async request() {
          throw new Error('Must NOT fall through to broken provider.request when rpcProviders.eip155 is absent')
        },
      }

      ensureEvmProviderMethodsHydrated(missingRpcProvider, 1)

      // CRITICAL #1: Real Viem createWalletClient.sendTransaction invokes eth_chainId BEFORE eth_sendTransaction
      const missingRpcWalletClient = createWalletClient({
        chain: viemMainnet,
        transport: custom(missingRpcProvider as never),
      })
      const txHash = await missingRpcWalletClient.sendTransaction({
        account: '0x9561aA554476A4C7C77f3B82ba2e16727445D58e',
        to: '0x1111111111111111111111111111111111111111',
        value: 1n,
        data: '0x',
      })
      assert.equal(txHash, '0xdeadbeef')
      assert.equal(clientCalls.length, 1)
      assert.equal(clientCalls[0].topic, 'wc_topic_direct_eth')
      assert.equal(clientCalls[0].chainId, 'eip155:1')
      assert.equal(clientCalls[0].request.method, 'eth_sendTransaction')

      // eth_accounts returns session accounts locally without crashing on undefined rpcProviders.eip155
      const accounts = await missingRpcProvider.request({ method: 'eth_accounts' } as never)
      assert.deepEqual(accounts, ['0x9561aA554476A4C7C77f3B82ba2e16727445D58e'])

      // IMPORTANT #4: wallet_switchEthereumChain switches locally for already-approved chains and uses approved chainId for unapproved chains
      const switchClientCalls: Array<{ chainId: string; method: string }> = []
      const emittedChains: string[] = []
      const switchMissingRpcProvider = {
        isWalletConnect: true,
        session: {
          topic: 'wc_topic_switch_fallback',
          namespaces: {
            eip155: {
              accounts: ['eip155:56:0x9561aA554476A4C7C77f3B82ba2e16727445D58e', 'eip155:1:0x9561aA554476A4C7C77f3B82ba2e16727445D58e'],
              chains: ['eip155:56', 'eip155:1'],
              methods: ['eth_sendTransaction', 'wallet_switchEthereumChain', 'wallet_addEthereumChain'],
            },
          },
        },
        namespaces: { eip155: { chains: ['eip155:56', 'eip155:1'], methods: ['eth_sendTransaction'], defaultChain: '56' } },
        rpcProviders: {},
        events: {
          emit(event: string, value: string) {
            if (event === 'chainChanged') emittedChains.push(value)
          },
        },
        client: {
          async request(payload: { topic: string; chainId: string; request: { method: string; params?: unknown } }) {
            switchClientCalls.push({ chainId: payload.chainId, method: payload.request.method })
            return null
          },
        },
        async request() {
          throw new Error('Must NOT fall through to broken origRequest when rpcProviders.eip155 is missing')
        },
      }
      ensureEvmProviderMethodsHydrated(switchMissingRpcProvider, 56)
      // Approved chain (0x1 = Ethereum) switches locally with 0 wallet RPC calls
      await switchMissingRpcProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] } as never)
      assert.equal(switchClientCalls.length, 0, 'Already-approved chain switch must succeed locally without prompting wallet')
      assert.equal(await switchMissingRpcProvider.request({ method: 'eth_chainId' } as never), '0x1')
      assert.deepEqual(emittedChains, ['0x1'])

      // Unapproved chain (0x89 = Polygon) dispatches via approved session chain (eip155:56), NOT unapproved eip155:137
      await switchMissingRpcProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x89' }] } as never)
      assert.deepEqual(switchClientCalls, [{ chainId: 'eip155:56', method: 'wallet_switchEthereumChain' }])

      // 4001 and 5000 rejections rethrow immediately with 0 retries
      for (const code of [4001, 5000]) {
        let attempts = 0
        const rejectingProvider = {
          isWalletConnect: true,
          session: {
            topic: `wc_topic_reject_${code}`,
            namespaces: {
              eip155: { chains: ['eip155:1'], methods: ['eth_sendTransaction'] },
            },
          },
          rpcProviders: {},
          client: {
            async request() {
              attempts += 1
              throw Object.assign(new Error('User rejected'), { code })
            },
          },
          async request() {
            attempts += 1
            return '0xnever'
          },
        }
        ensureEvmProviderMethodsHydrated(rejectingProvider, 1)
        await assert.rejects(
          () => rejectingProvider.request({ method: 'eth_sendTransaction', params: [{}] } as never),
          (err: { code?: number }) => err.code === code,
        )
        assert.equal(attempts, 1, `Direct client.request rejection ${code} must not retry`)
      }
    })
  })

  describe('Suite 3: WalletPaymentCheckout.tsx wires prepareWagmiEvmSigningProvider & explicit data: 0x', () => {
    it('prepares EVM WalletConnect provider in handleSwitchNetwork & handlePay and passes data: 0x in sendTransactionAsync', async () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      assert.match(
        checkoutSrc,
        /import\s*\{[^}]*\bprepareWagmiEvmSigningProvider\b[^}]*\}\s*from\s*'\.\/appkitConfig'/,
        'WalletPaymentCheckout.tsx must import prepareWagmiEvmSigningProvider from ./appkitConfig',
      )

      const switchBlock = extractBlock(checkoutSrc, 'const handleSwitchNetwork = async')
      assert.ok(
        switchBlock.includes('prepareWagmiEvmSigningProvider(undefined, evmConnector)'),
        'handleSwitchNetwork must hydrate methods/namespace order WITHOUT forcing expectedEvmChainId before user approval',
      )
      assert.equal(
        switchBlock.includes('finally'),
        false,
        'handleSwitchNetwork must NOT force setDefaultChain in finally when switching fails or is rejected (prevents chain-switch spoofing)',
      )
      const switchSuccessPrepareIdx = switchBlock.indexOf('prepareWagmiEvmSigningProvider(expectedEvmChainId, evmConnector)')
      const switchCatchIdx = switchBlock.indexOf('} catch')
      assert.ok(
        switchSuccessPrepareIdx > 0 && switchSuccessPrepareIdx < switchCatchIdx,
        'handleSwitchNetwork must only sync expectedEvmChainId after switch resolves cleanly',
      )

      // IMPORTANT #3.3 + MINOR #6 source & runtime invariants in src/appkitConfig.ts
      const appKitSrc = readText('src/appkitConfig.ts')
      const prepareStart = appKitSrc.indexOf('export async function prepareWagmiEvmSigningProvider(')
      assert.notEqual(prepareStart, -1, 'Expected prepareWagmiEvmSigningProvider export')
      const prepareBlock = appKitSrc.slice(prepareStart)
      assert.match(
        prepareBlock,
        /if\s*\(connectorProvider\)\s*\{[\s\S]*?return\b/,
        'prepareWagmiEvmSigningProvider must return early when an injected/non-WC connector yields its own provider so dormant WC providers are untouched',
      )

      // Runtime proof of IMPORTANT #3.3: injected connector must NOT touch dormant wagmiAdapter WC provider
      const methodsMatch = appKitSrc.match(/export const DEFAULT_EVM_WC_METHODS = \[[\s\S]*?\] as const/)
      assert.ok(methodsMatch)
      const helpersStart = appKitSrc.indexOf('export interface EvmUniversalProviderLike')
      const fullHelperSrc = `
        export function makePrepareWithAdapter(wagmiAdapter: { getWalletConnectProvider: () => unknown }) {
          ${methodsMatch[0].replace('export ', '')}
          ${appKitSrc.slice(helpersStart).replaceAll('export async function ', 'async function ').replaceAll('export function ', 'function ').replaceAll('export interface ', 'interface ')}
          return { prepareWagmiEvmSigningProvider }
        }
      `
      const transpiledPrep = ts.transpileModule(fullHelperSrc, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      const prepMod = (await import(
        `data:text/javascript;base64,${Buffer.from(transpiledPrep.outputText).toString('base64')}`
      )) as {
        makePrepareWithAdapter: (adapter: { getWalletConnectProvider: () => unknown }) => {
          prepareWagmiEvmSigningProvider: (
            expectedChainId?: number,
            connector?: { id?: string; type?: string; getProvider?: () => Promise<unknown> } | null,
          ) => Promise<void>
        }
      }
      let dormantWcTouched = false
      const dormantWcProvider = {
        isWalletConnect: true,
        session: { namespaces: { eip155: { chains: ['eip155:1'], methods: ['eth_sendTransaction'] } } },
        rpcProviders: { eip155: { namespace: { chains: ['eip155:1'], methods: [] as string[] } } },
        setDefaultChain() {
          dormantWcTouched = true
        },
      }
      const { prepareWagmiEvmSigningProvider } = prepMod.makePrepareWithAdapter({
        getWalletConnectProvider: () => dormantWcProvider,
      })
      await prepareWagmiEvmSigningProvider(1, {
        id: 'io.metamask',
        type: 'injected',
        getProvider: async () => ({ isMetaMask: true, request: async () => '0x1' }),
      })
      assert.equal(dormantWcTouched, false, 'Injected connector must NOT call setDefaultChain on dormant WC provider')
      assert.deepEqual(dormantWcProvider.rpcProviders.eip155.namespace.methods, [], 'Injected connector must NOT mutate dormant WC provider')

      // Fallback without connector hydrates wagmiAdapter WC provider cleanly
      await prepareWagmiEvmSigningProvider(1, null)
      assert.equal(dormantWcTouched, true)
      assert.equal(dormantWcProvider.rpcProviders.eip155.namespace.methods.includes('eth_sendTransaction'), true)

      const signMsgBlock = extractBlock(appKitSrc, 'override async signMessage(')
      assert.match(
        signMsgBlock,
        /provider\.request\(\s*\{[\s\S]*?method:\s*'tron_signMessage'[\s\S]*?\},\s*tronChainId\s*,?\s*\)/,
        'TronUniversalAdapter.signMessage must pass explicit tron CAIP chainId as 2nd argument to provider.request',
      )

      const payBlock = extractBlock(checkoutSrc, 'const handlePay = async')
      const prepareIdx = payBlock.indexOf('prepareWagmiEvmSigningProvider(')
      const writeContractIdx = payBlock.indexOf('writeContractAsync(')
      const sendTxIdx = payBlock.indexOf('sendTransactionAsync(')
      assert.ok(
        prepareIdx > 0 && prepareIdx < writeContractIdx && prepareIdx < sendTxIdx,
        'handlePay must invoke prepareWagmiEvmSigningProvider before writeContractAsync and sendTransactionAsync',
      )

      const sendTxMatch = payBlock.match(/sendTransactionAsync\(\{[\s\S]*?\}\)/)
      assert.ok(sendTxMatch, 'Expected sendTransactionAsync call in handlePay')
      assert.match(sendTxMatch[0], /account:\s*activeAddress as `0x\$\{string\}`/)
      assert.match(sendTxMatch[0], /data:\s*'0x'/, 'Native EVM transfer must include explicit data: "0x" for mobile WalletConnect compatibility')
    })
  })

  describe('Suite 4: classifyPaymentError unmasks Viem UnknownRpcError details & classifies UNSUPPORTED_METHOD', () => {
    it('unmasks screenshot error (5201 Unknown method(s) requested inside UnknownRpcError) into actionable UNSUPPORTED_METHOD guidance <= 250 chars', async () => {
      const { classifyPaymentError } = await loadCheckoutErrorClassifier()

      const innerRpcErr = {
        name: 'UnknownRpcError',
        code: 5201,
        shortMessage: 'An unknown RPC error occurred.',
        details: 'Unknown method(s) requested',
        message: 'An unknown RPC error occurred.\n\nDetails: Unknown method(s) requested',
      }
      const outerTxErr = {
        name: 'TransactionExecutionError',
        shortMessage: 'An unknown RPC error occurred.',
        details: 'Unknown method(s) requested',
        cause: innerRpcErr,
        walk: () => innerRpcErr,
        message: 'An unknown RPC error occurred.\n\nDetails: Unknown method(s) requested',
      }

      const result = classifyPaymentError(outerTxErr, 'Ethereum')
      assert.equal(result.kind, 'UNSUPPORTED_METHOD')
      assert.equal(result.category, 'UNSUPPORTED_METHOD')
      assert.equal(result.code, 5201)
      assert.equal(result.shortMessage, 'Unknown method(s) requested')
      assert.match(result.message, /Ethereum/)
      assert.match(result.message, /Unknown method\(s\) requested/)
      assert.doesNotMatch(result.message, /An unknown RPC error occurred/)
      assert.ok(result.message.length <= 250, `Message length ${result.message.length} must be <= 250`)

      // WalletConnect 5101, EIP-1193 4200, UnsupportedProviderMethodError & MethodNotSupportedRpcError
      for (const sample of [
        { code: 5101, message: 'Unsupported methods' },
        { code: 4200, name: 'UnsupportedProviderMethodError', shortMessage: 'The Provider does not support the requested method.' },
        { name: 'MethodNotSupportedRpcError', shortMessage: 'Method not supported' },
      ]) {
        const res = classifyPaymentError(sample, 'BNB Chain')
        assert.equal(res.kind, 'UNSUPPORTED_METHOD', `Expected UNSUPPORTED_METHOD for ${JSON.stringify(sample)}`)
        assert.ok(res.message.length <= 250)
      }
    })

    it('unmasks nested cause.details inside generic UnknownRpcError for both INSUFFICIENT_FUNDS and genuine RPC_ERROR', async () => {
      const { classifyPaymentError } = await loadCheckoutErrorClassifier()

      const nestedInsufficient = {
        name: 'TransactionExecutionError',
        shortMessage: 'An unknown RPC error occurred.',
        message: 'An unknown RPC error occurred.',
        cause: {
          name: 'UnknownRpcError',
          shortMessage: 'An unknown RPC error occurred.',
          details: 'insufficient funds for gas * price + value',
        },
      }
      const resFunds = classifyPaymentError(nestedInsufficient, 'Ethereum')
      assert.equal(resFunds.kind, 'INSUFFICIENT_FUNDS')

      const genuineRpc = {
        name: 'UnknownRpcError',
        shortMessage: 'An unknown RPC error occurred.',
        details: 'HTTP 502 Bad Gateway',
        message: 'An unknown RPC error occurred.',
      }
      const resRpc = classifyPaymentError(genuineRpc, 'Ethereum')
      assert.equal(resRpc.kind, 'RPC_ERROR')
      assert.match(resRpc.message, /HTTP 502 Bad Gateway/)
      assert.doesNotMatch(resRpc.message, /An unknown RPC error occurred/)

      // MINOR #7.2: ERC-20 writeContractAsync ContractFunctionExecutionError placeholder wrapping 5201 UnknownRpcError
      const innerContractRpc = {
        name: 'UnknownRpcError',
        code: 5201,
        shortMessage: 'An unknown RPC error occurred.',
        details: 'Unknown method(s) requested',
      }
      const contractErr = {
        name: 'ContractFunctionExecutionError',
        shortMessage: 'An unknown error occurred while executing the contract function "transfer".',
        cause: innerContractRpc,
        walk: () => innerContractRpc,
      }
      const resContract = classifyPaymentError(contractErr, 'Ethereum')
      assert.equal(resContract.kind, 'UNSUPPORTED_METHOD')
      assert.match(resContract.message, /Unknown method\(s\) requested/)
      assert.doesNotMatch(resContract.message, /executing the contract function/)
    })
  })
})
