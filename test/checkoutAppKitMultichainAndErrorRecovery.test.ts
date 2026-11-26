import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import ts from 'typescript'
import * as coordinator from '../src/services/payments/checkoutIntentCoordinator.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8')
}

async function loadCheckoutErrorClassifiers() {
  const checkoutSource = readText('src/WalletPaymentCheckout.tsx')
  const match = checkoutSource.match(/export function sanitizeErrorReason[\s\S]*?(?=export function WalletPaymentCheckout)/)
  assert.ok(match, 'Expected sanitizeErrorReason..classifyPaymentError block in src/WalletPaymentCheckout.tsx')
  const transpiled = ts.transpileModule(match[0], {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  })
  const dataUrl = `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`
  return (await import(dataUrl)) as {
    sanitizeErrorReason: (raw: unknown) => string
    classifyPaymentError: (err: unknown, networkName: string) => {
      message: string
      kind: string
      name?: string
      code?: number | string
      shortMessage?: string
      category: string
    }
  }
}

describe('Checkout Error Classification, Deadlock Recovery & AppKit Multichain Compatibility', () => {
  describe('Suite 1: Firebase HttpsError object details never render as [object Object]', () => {
    it('classifies TOKEN_CONTRACT_NOT_CONFIGURED from Firebase HttpsError.details object without [object Object]', async () => {
      const { sanitizeErrorReason, classifyPaymentError } = await loadCheckoutErrorClassifiers()

      assert.equal(sanitizeErrorReason({ reasonCode: 'TOKEN_CONTRACT_NOT_CONFIGURED' }), 'TOKEN_CONTRACT_NOT_CONFIGURED')
      assert.equal(sanitizeErrorReason({}), '')
      assert.equal(sanitizeErrorReason({ foo: 'bar' }).includes('[object Object]'), false)

      const firebaseHttpsError = Object.assign(new Error('Internal payment service error'), {
        name: 'FirebaseError',
        code: 'functions/internal',
        details: { reasonCode: 'TOKEN_CONTRACT_NOT_CONFIGURED' },
      })

      const classified = classifyPaymentError(firebaseHttpsError, 'Solana Devnet')
      assert.equal(classified.message.includes('[object Object]'), false, `Must never contain [object Object], got: ${classified.message}`)
      assert.equal(classified.kind, 'ASSET_NOT_CONFIGURED')
      assert.equal(classified.category, 'ASSET_NOT_CONFIGURED')
      assert.match(classified.message, /USDT no está disponible en Solana Devnet/i)
      assert.match(classified.message, /moneda nativa/i)
    })

    it('surfaces real message for non-config Firebase HttpsError with object details (never [object Object])', async () => {
      const { classifyPaymentError } = await loadCheckoutErrorClassifiers()

      const err = Object.assign(new Error('Commercial package not found: pkg-missing'), {
        name: 'FirebaseError',
        code: 'functions/not-found',
        details: { reasonCode: 'PACKAGE_NOT_FOUND' },
      })

      const classified = classifyPaymentError(err, 'Solana Devnet')
      assert.equal(classified.message.includes('[object Object]'), false)
      assert.match(classified.message, /Commercial package not found: pkg-missing/)
    })

    it('preserves viem string details behavior', async () => {
      const { classifyPaymentError } = await loadCheckoutErrorClassifiers()
      const viemErr = {
        name: 'ExecutionRevertedError',
        details: 'ERC20: transfer amount exceeds balance',
      }
      const classified = classifyPaymentError(viemErr, 'BNB Smart Chain Testnet')
      assert.equal(classified.kind, 'EXECUTION_REVERTED')
      assert.match(classified.message, /ERC20: transfer amount exceeds balance/)
    })
  })

  describe('Suite 2: AppKit Multichain (Wagmi EVM + Solana) Active Namespace Resolution', () => {
    it('prevents dormant Wagmi EVM connection from hijacking active Reown AppKit Solana session', () => {
      const resolveWallet = (coordinator as {
        resolveActiveMultichainWallet?: (input: {
          appKitAddress?: string | null
          isAppKitConnected: boolean
          appKitCaipAddress?: string | null
          caipNamespace?: string | null
          wagmiAddress?: string | null
          isWagmiConnected: boolean
          fallbackAddress?: string | null
        }) => { activeAddress: string; isWalletConnected: boolean; isEvmWallet: boolean; isSolanaWallet: boolean }
      }).resolveActiveMultichainWallet

      assert.equal(typeof resolveWallet, 'function', 'checkoutIntentCoordinator must export resolveActiveMultichainWallet')

      const solAddr = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      const evmAddr = '0x9561aA554476A4C7C77f3B82ba2e16727445D58e'

      // Both connected, AppKit active namespace is Solana -> Solana MUST win
      assert.deepEqual(
        resolveWallet({
          appKitAddress: solAddr,
          isAppKitConnected: true,
          appKitCaipAddress: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:${solAddr}`,
          caipNamespace: 'solana',
          wagmiAddress: evmAddr,
          isWagmiConnected: true,
        }),
        {
          activeAddress: solAddr,
          isWalletConnected: true,
          isEvmWallet: false,
          isSolanaWallet: true,
        },
      )

      // Both connected, AppKit active namespace is EVM -> EVM MUST win
      assert.deepEqual(
        resolveWallet({
          appKitAddress: evmAddr,
          isAppKitConnected: true,
          appKitCaipAddress: `eip155:97:${evmAddr}`,
          caipNamespace: 'eip155',
          wagmiAddress: evmAddr,
          isWagmiConnected: true,
        }),
        {
          activeAddress: evmAddr,
          isWalletConnected: true,
          isEvmWallet: true,
          isSolanaWallet: false,
        },
      )

      // Only Wagmi connected (AppKit disconnected) -> EVM fallback works
      assert.deepEqual(
        resolveWallet({
          appKitAddress: undefined,
          isAppKitConnected: false,
          wagmiAddress: evmAddr,
          isWagmiConnected: true,
        }),
        {
          activeAddress: evmAddr,
          isWalletConnected: true,
          isEvmWallet: true,
          isSolanaWallet: false,
        },
      )

      // Disconnected -> all false
      assert.deepEqual(
        resolveWallet({
          appKitAddress: undefined,
          isAppKitConnected: false,
          wagmiAddress: undefined,
          isWagmiConnected: false,
        }),
        {
          activeAddress: '',
          isWalletConnected: false,
          isEvmWallet: false,
          isSolanaWallet: false,
        },
      )
    })
  })

  describe('Suite 3: Checkout Deadlock Recovery, Native Default on Testnet & AppKit Wiring', () => {
    it('wires multichain resolution, native fallback when USDT contract is absent, intent-null retry, AppKitNetwork switchNetwork, and Solana signTransaction fallback', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const sessionSrc = readText('src/walletSession.ts')
      const appSrc = readText('src/App.tsx')

      assert.ok(checkoutSrc.includes('resolveActiveMultichainWallet'), 'WalletPaymentCheckout must resolve active wallet via resolveActiveMultichainWallet')
      assert.ok(checkoutSrc.includes('caipNetwork'), 'WalletPaymentCheckout must read caipNetwork from useAppKitNetwork')
      assert.ok(checkoutSrc.includes('usdtContractAddress'), 'WalletPaymentCheckout must default useUsdt based on configured usdtContractAddress')
      assert.ok(checkoutSrc.includes('initRetryNonce'), 'WalletPaymentCheckout must allow Step 1 retry when intent is null')
      assert.ok(checkoutSrc.includes('Reintentar cotización'), 'Quote card must render retry CTA when intent creation failed')
      assert.equal(
        checkoutSrc.includes('switchNetwork(expectedEvmChainId as never)'),
        false,
        'handleSwitchNetwork must pass an AppKitNetwork object instead of raw numeric chainId',
      )
      assert.ok(checkoutSrc.includes('signTransaction'), 'Solana checkout must support signTransaction + sendRawTransaction fallback')

      assert.ok(sessionSrc.includes('resolveActiveMultichainWallet'), 'walletSession.ts must use resolveActiveMultichainWallet')
      assert.ok(sessionSrc.split(/\r?\n/).length <= 130, 'walletSession.ts must remain <= 130 lines')

      assert.ok(
        appSrc.includes("const activeWalletAddress = walletSession.connection?.address ?? ''"),
        'App.tsx must consume walletSession.connection without allowing dormant wagmiAddress hijack',
      )
    })

    it('Hallazgo 2A: Step 2 (OPEN -> wallet connected) falls back to native asset when testnet USDT contract is absent before syncKey & selectPaymentMethod', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const step2Start = checkoutSrc.indexOf('// Step 2:')
      const step2End = checkoutSrc.indexOf('// Real TTL countdown timer')
      assert.notEqual(step2Start, -1, 'Expected Step 2 section in WalletPaymentCheckout.tsx')
      assert.notEqual(step2End, -1, 'Expected TTL timer marker after Step 2')
      const step2Src = checkoutSrc.slice(step2Start, step2End)

      assert.match(
        step2Src,
        /intent\.status === 'OPEN'[\s\S]*?sel\.selectedAsset === 'USDT'[\s\S]*?!getPaymentNetworkConfig\(sel\.effectiveNetworkId[^)]*\)\.usdtContractAddress[\s\S]*?NATIVE_SYMBOL_BY_NETWORK\[sel\.effectiveNetworkId\]/,
        'Step 2 must fall back to NATIVE_SYMBOL_BY_NETWORK[sel.effectiveNetworkId] when OPEN intent has USDT selected without configured usdtContractAddress',
      )

      const fallbackIdx = step2Src.indexOf('NATIVE_SYMBOL_BY_NETWORK[sel.effectiveNetworkId]')
      const syncKeyIdx = step2Src.indexOf('resolvePendingMethodSyncKey(')
      const selectCallIdx = step2Src.indexOf('await selectPaymentMethod(')
      assert.ok(fallbackIdx > 0 && fallbackIdx < syncKeyIdx, 'Native fallback must run BEFORE resolvePendingMethodSyncKey')
      assert.ok(syncKeyIdx < selectCallIdx, 'resolvePendingMethodSyncKey must run BEFORE selectPaymentMethod')

      assert.equal(
        step2Src.includes('targetAsset: sel.selectedAsset'),
        false,
        'Step 2 resolvePendingMethodSyncKey must use resolved targetAsset, not raw sel.selectedAsset',
      )
      assert.equal(
        step2Src.includes('assetSymbol: sel.selectedAsset'),
        false,
        'Step 2 selectPaymentMethod must pass resolved targetAsset, not raw sel.selectedAsset',
      )
      assert.match(step2Src, /targetAsset\b/, 'Step 2 must pass resolved targetAsset to resolvePendingMethodSyncKey')
      assert.match(step2Src, /assetSymbol:\s*targetAsset\b/, 'Step 2 must pass resolved targetAsset to selectPaymentMethod')

      // Behavioral check on resolvePendingMethodSyncKey with fallback SOL vs USDT
      const validNow = Date.parse('2026-11-24T10:05:00.000Z')
      const solAddr = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
      const openIntent = {
        intentId: 'pi_open_sol_001',
        status: 'OPEN' as const,
        txHash: null,
        expiresAt: '2026-11-24T10:15:00.000Z',
        isExpired: false,
        senderWallet: null,
      }
      const solSyncKey = coordinator.resolvePendingMethodSyncKey({
        intent: openIntent,
        isWalletConnected: true,
        isEvmWallet: false,
        activeAddress: solAddr,
        targetNetworkId: 'solana',
        targetAsset: 'SOL',
        failedSyncKey: null,
        nowMs: validNow,
      })
      assert.equal(solSyncKey, `pi_open_sol_001|OPEN|solana|SOL|${solAddr}`)
    })

    it('Hallazgo 2B: "Reintentar cotización" retries in-place via handleSelectNetworkOrAsset when intent is OPEN/AWAITING (0 SCRUM-373 duplicates) and only bumps initRetryNonce when !intent', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const retryIdx = checkoutSrc.indexOf('Reintentar cotización')
      assert.notEqual(retryIdx, -1, 'Expected Reintentar cotización button in WalletPaymentCheckout.tsx')
      const buttonStart = checkoutSrc.lastIndexOf('<button', retryIdx)
      const buttonEnd = checkoutSrc.indexOf('</button>', retryIdx)
      assert.notEqual(buttonStart, -1)
      assert.notEqual(buttonEnd, -1)
      const retryButtonSrc = checkoutSrc.slice(buttonStart, buttonEnd)

      // Must branch on !intent for Step 1 retry
      assert.match(
        retryButtonSrc,
        /if\s*\(\s*!intent\s*\)\s*\{[\s\S]*?setError\(''\)[\s\S]*?setInitRetryNonce\(\(n\)\s*=>\s*n\s*\+\s*1\)[\s\S]*?return[\s\S]*?\}/,
        'Reintentar cotización must clear error, bump initRetryNonce, and return ONLY when !intent',
      )

      // Must retry in-place when intent can mutate in-place (OPEN/AWAITING) without calling createPaymentIntent or bumping initRetryNonce
      assert.match(
        retryButtonSrc,
        /canMutateIntentMethodInPlace\(\s*intent\s*,\s*Date\.now\(\)\s*\)/,
        'Reintentar cotización must check canMutateIntentMethodInPlace(intent, Date.now())',
      )
      assert.ok(
        retryButtonSrc.includes('failedSyncKeyRef.current = null'),
        'Reintentar cotización must reset failedSyncKeyRef.current = null before in-place retry',
      )
      assert.match(
        retryButtonSrc,
        /const retryUseUsdt\s*=\s*useUsdt\s*&&\s*Boolean\(getPaymentNetworkConfig\(effectiveNetworkId[^)]*\)\.usdtContractAddress\)/,
        'Reintentar cotización must derive retryUseUsdt with native fallback when usdtContractAddress is absent',
      )
      assert.ok(
        retryButtonSrc.includes('void handleSelectNetworkOrAsset(effectiveNetworkId, retryUseUsdt)'),
        'Reintentar cotización must invoke handleSelectNetworkOrAsset(effectiveNetworkId, retryUseUsdt) in-place',
      )
      assert.equal(
        retryButtonSrc.includes('createPaymentIntent'),
        false,
        'Reintentar cotización must never call createPaymentIntent directly',
      )
      const initRetryMatches = retryButtonSrc.match(/setInitRetryNonce/g) ?? []
      assert.equal(
        initRetryMatches.length,
        1,
        'setInitRetryNonce must only appear once inside the !intent branch of Reintentar cotización',
      )

      // handleSelectNetworkOrAsset must re-record failedSyncKeyRef on error to prevent an immediate Step 2 auto-retry loop
      const selectStart = checkoutSrc.indexOf('const handleSelectNetworkOrAsset = async')
      const selectEnd = checkoutSrc.indexOf('const handleCopy = async')
      assert.ok(selectStart > 0 && selectEnd > selectStart)
      const selectSrc = checkoutSrc.slice(selectStart, selectEnd)
      const catchIdx = selectSrc.indexOf('catch (err)')
      assert.notEqual(catchIdx, -1)
      const catchSrc = selectSrc.slice(catchIdx)
      assert.ok(
        catchSrc.includes('failedSyncKeyRef.current'),
        'handleSelectNetworkOrAsset catch block must preserve/record failedSyncKeyRef so Step 2 does not immediately loop on failed retry',
      )
    })

    it('IMP-1: scopes numericChainId, isWrongEvmChain, handleSwitchNetwork, and EVM handlePay strictly to active EVM wallet (never dormant Wagmi when Solana is active)', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')

      assert.match(
        checkoutSrc,
        /const numericChainId = isEvmWallet \?/,
        'numericChainId must read chainId only when isEvmWallet is true',
      )
      assert.match(
        checkoutSrc,
        /const isWrongEvmChain\s*=\s*!isSolana\s*&&\s*isEvmWallet\s*&&\s*!hasNetworkSelectionMismatch\s*&&\s*numericChainId > 0\s*&&\s*numericChainId !== expectedEvmChainId/,
        'isWrongEvmChain must require isEvmWallet and !hasNetworkSelectionMismatch so dormant Wagmi never hijacks active Solana CTA',
      )

      const switchStart = checkoutSrc.indexOf('const handleSwitchNetwork = async')
      const cancelStart = checkoutSrc.indexOf('const handleCancelIntent = async')
      assert.ok(switchStart > 0 && cancelStart > switchStart)
      const switchSrc = checkoutSrc.slice(switchStart, cancelStart)
      assert.match(
        switchSrc,
        /if\s*\(\s*isEvmWallet\s*&&\s*isEvmConnected\s*&&\s*switchChainAsync\s*\)/,
        'handleSwitchNetwork must gate Wagmi switchChainAsync on isEvmWallet',
      )

      const payStart = checkoutSrc.indexOf('const handlePay = async')
      assert.ok(payStart > 0)
      const paySrc = checkoutSrc.slice(payStart)
      assert.ok(paySrc.includes('if (hasNetworkSelectionMismatch)'), 'handlePay must reject network selection mismatch defensively')
      assert.ok(paySrc.includes('!isEvmWallet || !isEvmConnected || !writeContractAsync'), 'handlePay USDT EVM path must require isEvmWallet')
      assert.ok(paySrc.includes('!isEvmWallet || !isEvmConnected || !sendTransactionAsync'), 'handlePay native EVM path must require isEvmWallet')
    })

    it('IMP-2: Solana provider submission falls back to sendTransaction / signTransaction+sendRawTransaction when AppKit throws unsupported-feature/method error, and NEVER double-prompts on user rejection', async () => {
      const submitSolana = (coordinator as {
        submitSolanaTransactionViaProvider?: (
          provider: {
            signAndSendTransaction?: (tx: unknown) => Promise<string | { signature?: string }>
            sendTransaction?: (tx: unknown, connection: unknown) => Promise<string>
            signTransaction?: (tx: unknown) => Promise<{ serialize: () => Uint8Array }>
          },
          tx: unknown,
          getConnection: () => Promise<{ sendRawTransaction: (raw: Uint8Array) => Promise<string> }>,
        ) => Promise<string>
      }).submitSolanaTransactionViaProvider

      assert.equal(
        typeof submitSolana,
        'function',
        'checkoutIntentCoordinator must export submitSolanaTransactionViaProvider',
      )

      const fakeTx = { mock: 'tx' }
      const rawBytes = new Uint8Array([1, 2, 3])
      const fakeConnection = {
        sendRawTransaction: async (bytes: Uint8Array) => {
          assert.deepEqual(bytes, rawBytes)
          return 'sig_raw_fallback'
        },
      }

      // 1. Real AppKit WalletStandardProvider defines all 3 methods on prototype;
      //    when wallet lacks solana:signAndSendTransaction it throws WalletStandardFeatureNotSupportedError -> falls back to sendTransaction
      class WalletStandardFeatureNotSupportedError extends Error {
        constructor(feature: string) {
          super(`The wallet does not support the "${feature}" feature`)
        }
      }
      let sendTxCalls = 0
      const wsProvider = {
        signAndSendTransaction: async () => {
          throw new WalletStandardFeatureNotSupportedError('solana:signAndSendTransaction')
        },
        sendTransaction: async () => {
          sendTxCalls += 1
          return 'sig_send_tx_fallback'
        },
        signTransaction: async () => ({ serialize: () => rawBytes }),
      }
      assert.equal(await submitSolana(wsProvider, fakeTx, async () => fakeConnection), 'sig_send_tx_fallback')
      assert.equal(sendTxCalls, 1)

      // 2. Real AppKit SolanaWalletConnectProvider throws WalletConnectMethodNotSupportedError -> falls back to signTransaction + sendRawTransaction when sendTransaction also unsupported
      class WalletConnectMethodNotSupportedError extends Error {
        constructor(method: string) {
          super(`The method "${method}" is not supported by the wallet`)
        }
      }
      const wcProvider = {
        signAndSendTransaction: async () => {
          throw new WalletConnectMethodNotSupportedError('solana_signAndSendTransaction')
        },
        sendTransaction: async () => {
          throw new WalletConnectMethodNotSupportedError('solana_sendTransaction')
        },
        signTransaction: async () => ({ serialize: () => rawBytes }),
      }
      assert.equal(await submitSolana(wcProvider, fakeTx, async () => fakeConnection), 'sig_raw_fallback')

      // 3. User rejection MUST rethrow immediately without falling back (zero double-signing prompt)
      let fallbackTouched = false
      const rejectingProvider = {
        signAndSendTransaction: async () => {
          throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
        },
        sendTransaction: async () => {
          fallbackTouched = true
          return 'must_not_run'
        },
        signTransaction: async () => {
          fallbackTouched = true
          return { serialize: () => rawBytes }
        },
      }
      await assert.rejects(
        () => submitSolana(rejectingProvider, fakeTx, async () => fakeConnection),
        /User rejected the request/,
      )
      assert.equal(fallbackTouched, false, 'User rejection must never trigger fallback signing prompt')

      // 4. WalletPaymentCheckout.tsx must wire submitSolanaTransactionViaProvider
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      assert.ok(
        checkoutSrc.includes('submitSolanaTransactionViaProvider'),
        'WalletPaymentCheckout.tsx must submit Solana transactions through submitSolanaTransactionViaProvider',
      )
    })
  })

  describe('Suite 4: Hallazgo 3 — WalletPanel.tsx Multichain Consistency (Reown AppKit over dormant Wagmi)', () => {
    it('prioritizes session.connection / resolveActiveMultichainWallet with caipNetwork, scopes useBalance to active EVM, and preserves AppKit + ClientPaymentHistory', () => {
      const panelSrc = readText('src/WalletPanel.tsx')

      assert.ok(panelSrc.includes('@reown/appkit/react'), 'WalletPanel.tsx must keep @reown/appkit/react')
      assert.equal(panelSrc.includes('directWallets'), false, 'WalletPanel.tsx must have 0 directWallets (SCRUM-346)')
      assert.ok(
        panelSrc.includes('<ClientPaymentHistory uid={authenticatedUid} />'),
        'WalletPanel.tsx must preserve <ClientPaymentHistory uid={authenticatedUid} /> (SCRUM-370)',
      )

      assert.ok(panelSrc.includes('useAppKitNetwork'), 'WalletPanel.tsx must read caipNetwork via useAppKitNetwork')
      assert.ok(panelSrc.includes('resolveActiveMultichainWallet'), 'WalletPanel.tsx must resolve active wallet via resolveActiveMultichainWallet')
      assert.equal(
        panelSrc.includes('wagmiAddress || appKitAddress'),
        false,
        'WalletPanel.tsx must NOT prioritize dormant wagmiAddress ahead of appKitAddress',
      )
      assert.match(
        panelSrc,
        /const isEvmActive = resolvedWallet\.isEvmWallet/,
        'WalletPanel.tsx must derive isEvmActive from resolvedWallet.isEvmWallet',
      )
      assert.equal(
        panelSrc.includes('const currentNetwork = chain?.name ??'),
        false,
        'WalletPanel.tsx must NOT unconditionally prioritize dormant Wagmi chain?.name over active Solana session',
      )
      assert.match(
        panelSrc,
        /const currentNetwork = isEvmActive[\s\S]*?caipNetwork\?\.name[\s\S]*?'Solana'/,
        'WalletPanel.tsx must derive currentNetwork from active family without prioritizing dormant Wagmi over Solana',
      )
      assert.doesNotMatch(
        panelSrc,
        /useBalance\(\{\s*address:\s*wagmiAddress\b/,
        'WalletPanel.tsx must NOT pass dormant wagmiAddress unconditionally to useBalance',
      )
      assert.match(
        panelSrc,
        /useBalance\(\{\s*address:\s*isEvmActive \? \(activeAddress as `0x\$\{string\}`\) : undefined,?\s*\}\)/,
        'WalletPanel.tsx must scope useBalance address strictly to active EVM wallet',
      )
    })
  })
})
