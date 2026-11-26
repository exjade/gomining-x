import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import * as coordinator from '../src/services/payments/checkoutIntentCoordinator.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const EXPECTED_RULES_SHA256 = 'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779'

const VALID_EVM_A = '0x9561aA554476A4C7C77f3B82ba2e16727445D58e'
const VALID_EVM_A_LOWER = VALID_EVM_A.toLowerCase()
const VALID_EVM_B = '0x1111111111111111111111111111111111111111'
const ZERO_EVM = '0x0000000000000000000000000000000000000000'
const VALID_SOL_A = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
const VALID_SOL_43 = 'bZJ38AysbUzwB2MCkaJrsvgpooEE5bjVjzJc5heXogk'
const TRON_USDT_ADDR = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'
const SOL_ALL_ONES = '11111111111111111111111111111111'

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8')
}

function createMemoryStorage(initial: Record<string, string> = {}): StorageLike & { dump: () => Record<string, string> } {
  const store = new Map<string, string>(Object.entries(initial))
  return {
    getItem(key: string): string | null {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string): void {
      store.set(key, String(value))
    },
    removeItem(key: string): void {
      store.delete(key)
    },
    dump: () => Object.fromEntries(store.entries()),
  }
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

describe('SCRUM-382: Pre-Mainnet Reown AppKit Multichain Hardening (F-01..F-07)', () => {
  describe('F-01: Post-broadcast anti-double-payment lock & confirmation retry', () => {
    it('reads, writes, isolates by uid+intentId, clears on terminal states, and tolerates missing/throwing/corrupt storage', () => {
      const api = coordinator as unknown as {
        readBroadcastTxLock?: (uid: string, intentId: string, storage?: StorageLike | null) => {
          uid: string
          intentId: string
          txHash: string
          networkId: string
          networkMode: string
          broadcastAt: number
        } | null
        writeBroadcastTxLock?: (lock: {
          uid: string
          intentId: string
          txHash: string
          networkId: 'bsc' | 'ethereum' | 'polygon' | 'solana'
          networkMode: 'mainnet' | 'testnet'
          broadcastAt: number
        }, storage?: StorageLike | null) => boolean
        clearBroadcastTxLock?: (uid: string, intentId: string, storage?: StorageLike | null) => void
        shouldClearBroadcastTxLock?: (status: string | null | undefined) => boolean
      }

      assert.equal(typeof api.readBroadcastTxLock, 'function', 'must export readBroadcastTxLock')
      assert.equal(typeof api.writeBroadcastTxLock, 'function', 'must export writeBroadcastTxLock')
      assert.equal(typeof api.clearBroadcastTxLock, 'function', 'must export clearBroadcastTxLock')
      assert.equal(typeof api.shouldClearBroadcastTxLock, 'function', 'must export shouldClearBroadcastTxLock')

      const storage = createMemoryStorage()
      const lock = {
        uid: 'uid_alpha',
        intentId: 'pi_lock_001',
        txHash: '0xabc123def456',
        networkId: 'bsc' as const,
        networkMode: 'mainnet' as const,
        broadcastAt: 1764096000000,
      }

      assert.equal(api.readBroadcastTxLock('uid_alpha', 'pi_lock_001', storage), null)
      assert.equal(api.writeBroadcastTxLock(lock, storage), true)

      // Exact storage key scoping
      const expectedKey = 'pouw_checkout_broadcast_tx:uid_alpha:pi_lock_001'
      assert.ok(storage.getItem(expectedKey), `Must store lock under key ${expectedKey}`)
      assert.deepEqual(api.readBroadcastTxLock('uid_alpha', 'pi_lock_001', storage), lock)

      // Strict isolation by uid and intentId
      assert.equal(api.readBroadcastTxLock('uid_beta', 'pi_lock_001', storage), null)
      assert.equal(api.readBroadcastTxLock('uid_alpha', 'pi_lock_002', storage), null)

      // Clear removes only targeted lock
      api.clearBroadcastTxLock('uid_alpha', 'pi_lock_001', storage)
      assert.equal(api.readBroadcastTxLock('uid_alpha', 'pi_lock_001', storage), null)
      assert.equal(storage.getItem(expectedKey), null)

      // Rejects corrupt JSON or mismatched payload
      storage.setItem(expectedKey, '{bad-json')
      assert.equal(api.readBroadcastTxLock('uid_alpha', 'pi_lock_001', storage), null)
      storage.setItem(expectedKey, JSON.stringify({ ...lock, uid: 'uid_other' }))
      assert.equal(api.readBroadcastTxLock('uid_alpha', 'pi_lock_001', storage), null)
      storage.setItem(expectedKey, JSON.stringify({ ...lock, txHash: '   ' }))
      assert.equal(api.readBroadcastTxLock('uid_alpha', 'pi_lock_001', storage), null)

      // Resilient to null storage and throwing Storage APIs (SecurityError / QuotaExceededError)
      assert.equal(api.readBroadcastTxLock('uid_alpha', 'pi_lock_001', null), null)
      assert.equal(api.writeBroadcastTxLock(lock, null), false)
      assert.doesNotThrow(() => api.clearBroadcastTxLock('uid_alpha', 'pi_lock_001', null))

      const throwingStorage: StorageLike = {
        getItem() {
          throw new Error('SecurityError: sessionStorage blocked')
        },
        setItem() {
          throw new Error('QuotaExceededError: sessionStorage full')
        },
        removeItem() {
          throw new Error('SecurityError: sessionStorage blocked')
        },
      }
      assert.equal(api.readBroadcastTxLock('uid_alpha', 'pi_lock_001', throwingStorage), null)
      assert.equal(api.writeBroadcastTxLock(lock, throwingStorage), false)
      assert.doesNotThrow(() => api.clearBroadcastTxLock('uid_alpha', 'pi_lock_001', throwingStorage))

      // Terminal status clearing contract
      for (const terminal of ['SETTLED', 'FAILED', 'UNDERPAID', 'EXPIRED', 'CANCELLED']) {
        assert.equal(api.shouldClearBroadcastTxLock(terminal), true, `Expected clear on ${terminal}`)
      }
      for (const active of ['OPEN', 'AWAITING', 'PROCESSING', null, undefined]) {
        assert.equal(api.shouldClearBroadcastTxLock(active), false, `Must NOT clear on ${String(active)}`)
      }
    })

    it('wires post-broadcast lock before confirmPaymentIntent, blocks duplicate handlePay/cancel/method-change, preserves retry over TTL expiry, and exposes handleRetryVerification', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')

      assert.ok(checkoutSrc.includes('readBroadcastTxLock'), 'Checkout must import/use readBroadcastTxLock')
      assert.ok(checkoutSrc.includes('writeBroadcastTxLock'), 'Checkout must import/use writeBroadcastTxLock')
      assert.ok(checkoutSrc.includes('clearBroadcastTxLock'), 'Checkout must import/use clearBroadcastTxLock')
      assert.ok(checkoutSrc.includes('shouldClearBroadcastTxLock'), 'Checkout must import/use shouldClearBroadcastTxLock')

      // Lock persisted BEFORE confirmPaymentIntent in handlePay
      const payBlock = extractBlock(checkoutSrc, 'const handlePay = async')
      const writeLockIdx = payBlock.indexOf('writeBroadcastTxLock(')
      const setLockIdx = payBlock.indexOf('setBroadcastTxLock(')
      const confirmIdx = payBlock.indexOf('await confirmPaymentIntent(')
      assert.ok(writeLockIdx > 0 && setLockIdx > 0 && confirmIdx > 0, 'handlePay must write lock and confirmPaymentIntent')
      assert.ok(writeLockIdx < confirmIdx, 'writeBroadcastTxLock MUST run BEFORE confirmPaymentIntent')
      assert.ok(setLockIdx < confirmIdx, 'setBroadcastTxLock MUST run BEFORE confirmPaymentIntent')

      // Duplicate handlePay strictly blocked when lock exists
      assert.match(
        payBlock,
        /hasBroadcastTxLock|readBroadcastTxLock\(/,
        'handlePay must early-return when a broadcast lock already exists for this intent',
      )

      // handleRetryVerification exclusively calls confirmPaymentIntent without re-signing
      const retryBlock = extractBlock(checkoutSrc, 'const handleRetryVerification = async')
      assert.ok(retryBlock.includes('confirmPaymentIntent('), 'handleRetryVerification must call confirmPaymentIntent')
      assert.equal(retryBlock.includes('writeContractAsync'), false, 'handleRetryVerification must NEVER call writeContractAsync')
      assert.equal(retryBlock.includes('sendTransactionAsync'), false, 'handleRetryVerification must NEVER call sendTransactionAsync')
      assert.equal(retryBlock.includes('submitSolanaTransactionViaProvider'), false, 'handleRetryVerification must NEVER re-sign Solana tx')
      assert.equal(retryBlock.includes('submitTronTransactionViaProvider'), false, 'handleRetryVerification must NEVER re-sign TRON tx')

      // UI exposes retry verification CTA and blocks expired view from pushing user to pay twice while lock active
      assert.ok(checkoutSrc.includes('Reintentar verificación on-chain'), 'Checkout must render retry verification CTA')
      assert.ok(checkoutSrc.includes('handleRetryVerification'), 'Checkout must bind handleRetryVerification')
      assert.match(
        checkoutSrc,
        /isIntentExpired\s*&&\s*!hasBroadcastTxLock/,
        'Local TTL expiration must not replace active post-broadcast verification lock with Generar nueva cotización',
      )

      // Network/asset mutations and cancellation blocked while lock is active
      const selectBlock = extractBlock(checkoutSrc, 'const handleSelectNetworkOrAsset = async')
      assert.ok(selectBlock.includes('hasBroadcastTxLock'), 'handleSelectNetworkOrAsset must block changes while broadcast lock is active')
      const cancelBlock = extractBlock(checkoutSrc, 'const handleCancelIntent = async')
      assert.ok(cancelBlock.includes('hasBroadcastTxLock'), 'handleCancelIntent must block cancellation while broadcast lock is active')
    })

    it('blocks rapid double-click in handlePay with synchronous payInFlightRef, derives persisted lock synchronously without 1-render lag, and keeps retry banner visible when !isWalletConnected', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')

      // Critical #1: synchronous ref lock in handlePay
      assert.match(checkoutSrc, /const payInFlightRef = useRef\(false\)/, 'Checkout must declare synchronous payInFlightRef')
      const payBlock = extractBlock(checkoutSrc, 'const handlePay = async')
      const refGuardIdx = payBlock.indexOf('if (payInFlightRef.current) return')
      const refSetIdx = payBlock.indexOf('payInFlightRef.current = true')
      const refResetIdx = payBlock.indexOf('payInFlightRef.current = false')
      assert.ok(refGuardIdx > 0, 'handlePay must check if (payInFlightRef.current) return')
      assert.ok(refSetIdx > refGuardIdx, 'handlePay must set payInFlightRef.current = true synchronously before wallet signing')
      assert.ok(refResetIdx > refSetIdx, 'handlePay must release payInFlightRef.current = false in finally')

      // Important #3: synchronous useMemo hydration of persisted lock (0-frame lag before Step 2 effect)
      assert.match(
        checkoutSrc,
        /const persistedBroadcastTxLock = useMemo\([\s\S]*?readBroadcastTxLock\(userUid,\s*activeIntentId\)/,
        'Checkout must derive persistedBroadcastTxLock synchronously via useMemo to eliminate 1-render hydration lag',
      )

      // Important #2: anti-double-payment banner and retry CTA stay accessible even when !isWalletConnected
      assert.match(
        checkoutSrc,
        /\{!isWalletConnected && !hasBroadcastTxLock \? \(/,
        'Connect-wallet gate must NOT hide the post-broadcast lock banner and retry verification CTA when !isWalletConnected',
      )
    })
  })

  describe('F-02: Strict namespace isolation and address validation in resolveActiveMultichainWallet', () => {
    it('prevents dormant Wagmi EVM hijack when caipNamespace === solana and AppKit is disconnected', () => {
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: undefined,
          isAppKitConnected: false,
          caipNamespace: 'solana',
          isWagmiConnected: true,
          wagmiAddress: VALID_EVM_A,
        }),
        {
          activeAddress: '',
          isWalletConnected: false,
          isEvmWallet: false,
          isSolanaWallet: false,
          isTronWallet: false,
        },
      )
    })

    it('rejects snapshot-tear address/namespace mismatches without mislabeling or falling back to dormant Wagmi', () => {
      // caipNamespace === solana with 0x... address
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: VALID_EVM_A,
          isAppKitConnected: true,
          caipNamespace: 'solana',
          isWagmiConnected: true,
          wagmiAddress: VALID_EVM_A,
        }),
        {
          activeAddress: '',
          isWalletConnected: false,
          isEvmWallet: false,
          isSolanaWallet: false,
          isTronWallet: false,
        },
      )

      // appKitCaipAddress starts with solana: but address is 0x...
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: VALID_EVM_A,
          isAppKitConnected: true,
          appKitCaipAddress: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1:${VALID_EVM_A}`,
          isWagmiConnected: false,
        }),
        {
          activeAddress: '',
          isWalletConnected: false,
          isEvmWallet: false,
          isSolanaWallet: false,
          isTronWallet: false,
        },
      )

      // caipNamespace === eip155 with Solana address
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: VALID_SOL_A,
          isAppKitConnected: true,
          caipNamespace: 'eip155',
          isWagmiConnected: false,
        }),
        {
          activeAddress: '',
          isWalletConnected: false,
          isEvmWallet: false,
          isSolanaWallet: false,
          isTronWallet: false,
        },
      )

      // Conflicting caipNamespace vs appKitCaipAddress prefix
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: VALID_SOL_A,
          isAppKitConnected: true,
          caipNamespace: 'solana',
          appKitCaipAddress: `eip155:56:${VALID_EVM_A}`,
          isWagmiConnected: false,
        }),
        {
          activeAddress: '',
          isWalletConnected: false,
          isEvmWallet: false,
          isSolanaWallet: false,
          isTronWallet: false,
        },
      )
    })

    it('never mislabels TRON, zero EVM, Solana all-ones, or corrupt addresses as Solana or EVM', () => {
      for (const badAddr of [TRON_USDT_ADDR, ZERO_EVM, SOL_ALL_ONES, 'not-an-address', '0x1234', '   ']) {
        assert.deepEqual(
          coordinator.resolveActiveMultichainWallet({
            appKitAddress: badAddr,
            isAppKitConnected: true,
            isWagmiConnected: false,
          }),
          {
            activeAddress: '',
            isWalletConnected: false,
            isEvmWallet: false,
            isSolanaWallet: false,
            isTronWallet: false,
          },
          `AppKit address "${badAddr}" must be rejected`,
        )

        assert.deepEqual(
          coordinator.resolveActiveMultichainWallet({
            isAppKitConnected: false,
            isWagmiConnected: false,
            fallbackAddress: badAddr,
          }),
          {
            activeAddress: '',
            isWalletConnected: false,
            isEvmWallet: false,
            isSolanaWallet: false,
            isTronWallet: false,
          },
          `Fallback address "${badAddr}" must be rejected`,
        )
      }

      // Invalid Wagmi address rejected
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          isAppKitConnected: false,
          isWagmiConnected: true,
          wagmiAddress: ZERO_EVM,
        }),
        {
          activeAddress: '',
          isWalletConnected: false,
          isEvmWallet: false,
          isSolanaWallet: false,
          isTronWallet: false,
        },
      )
    })

    it('preserves valid EVM and Solana resolution flows (with and without explicit namespace)', () => {
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: VALID_SOL_A,
          isAppKitConnected: true,
          appKitCaipAddress: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${VALID_SOL_A}`,
          caipNamespace: 'solana',
          wagmiAddress: VALID_EVM_A,
          isWagmiConnected: true,
        }),
        {
          activeAddress: VALID_SOL_A,
          isWalletConnected: true,
          isEvmWallet: false,
          isSolanaWallet: true,
          isTronWallet: false,
        },
      )

      // 43-char valid Solana address without explicit namespace
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: VALID_SOL_43,
          isAppKitConnected: true,
          isWagmiConnected: false,
        }),
        {
          activeAddress: VALID_SOL_43,
          isWalletConnected: true,
          isEvmWallet: false,
          isSolanaWallet: true,
          isTronWallet: false,
        },
      )

      // Valid EVM via AppKit
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          appKitAddress: VALID_EVM_A,
          isAppKitConnected: true,
          appKitCaipAddress: `eip155:56:${VALID_EVM_A}`,
          caipNamespace: 'eip155',
          wagmiAddress: VALID_EVM_A,
          isWagmiConnected: true,
        }),
        {
          activeAddress: VALID_EVM_A,
          isWalletConnected: true,
          isEvmWallet: true,
          isSolanaWallet: false,
          isTronWallet: false,
        },
      )

      // Valid EVM via Wagmi fallback when namespace is not solana
      assert.deepEqual(
        coordinator.resolveActiveMultichainWallet({
          isAppKitConnected: false,
          caipNamespace: 'eip155',
          isWagmiConnected: true,
          wagmiAddress: VALID_EVM_A,
        }),
        {
          activeAddress: VALID_EVM_A,
          isWalletConnected: true,
          isEvmWallet: true,
          isSolanaWallet: false,
          isTronWallet: false,
        },
      )

      // Coordinator source uses isValidEvmAddress & isValidSolanaAddress and never !addr.startsWith('0x')
      const coordSrc = readText('src/services/payments/checkoutIntentCoordinator.ts')
      assert.ok(coordSrc.includes('isValidEvmAddress'), 'checkoutIntentCoordinator must use isValidEvmAddress')
      assert.ok(coordSrc.includes('isValidSolanaAddress'), 'checkoutIntentCoordinator must use isValidSolanaAddress')
      assert.equal(coordSrc.includes("!appKitAddr.startsWith('0x')"), false, 'Must never classify Solana via !startsWith(0x)')
      assert.equal(coordSrc.includes("!fallbackAddr.startsWith('0x')"), false, 'Must never classify fallback Solana via !startsWith(0x)')
    })
  })

  describe('F-03: EVM signer parity, parsePositiveAtomicBigInt, explicit account, and Solana cluster parity', () => {
    it('validates EVM signing parity across match, case-insensitive match, wagmi mismatch, senderWallet mismatch, and invalid addresses', () => {
      const api = coordinator as unknown as {
        validateEvmSigningParity?: (input: {
          activeAddress?: string | null
          wagmiAddress?: string | null
          intentSenderWallet?: string | null
        }) => { ok: boolean; error?: string }
      }
      assert.equal(typeof api.validateEvmSigningParity, 'function', 'must export validateEvmSigningParity')

      // Match (checksum vs lowercase)
      assert.equal(
        api.validateEvmSigningParity({
          activeAddress: VALID_EVM_A,
          wagmiAddress: VALID_EVM_A_LOWER,
          intentSenderWallet: VALID_EVM_A,
        }).ok,
        true,
      )

      // Match without intentSenderWallet
      assert.equal(
        api.validateEvmSigningParity({
          activeAddress: VALID_EVM_A,
          wagmiAddress: VALID_EVM_A,
          intentSenderWallet: null,
        }).ok,
        true,
      )

      // Mismatch between activeAddress and wagmiAddress
      const wagmiMismatch = api.validateEvmSigningParity({
        activeAddress: VALID_EVM_A,
        wagmiAddress: VALID_EVM_B,
        intentSenderWallet: VALID_EVM_A,
      })
      assert.equal(wagmiMismatch.ok, false)
      assert.ok(wagmiMismatch.error && wagmiMismatch.error.length > 0)

      // Mismatch against intentSenderWallet
      const senderMismatch = api.validateEvmSigningParity({
        activeAddress: VALID_EVM_A,
        wagmiAddress: VALID_EVM_A,
        intentSenderWallet: VALID_EVM_B,
      })
      assert.equal(senderMismatch.ok, false)
      assert.ok(senderMismatch.error && senderMismatch.error.length > 0)

      // Invalid / zero / non-EVM addresses
      for (const bad of [ZERO_EVM, VALID_SOL_A, '', undefined]) {
        assert.equal(
          api.validateEvmSigningParity({ activeAddress: bad, wagmiAddress: VALID_EVM_A }).ok,
          false,
          `Must reject invalid activeAddress "${String(bad)}"`,
        )
        assert.equal(
          api.validateEvmSigningParity({ activeAddress: VALID_EVM_A, wagmiAddress: bad }).ok,
          false,
          `Must reject invalid wagmiAddress "${String(bad)}"`,
        )
      }
    })

    it('validates Solana cluster parity across mainnet, devnet, mainnet<->devnet mismatch, testnet, EVM, missing, and conflicting IDs', () => {
      const api = coordinator as unknown as {
        validateSolanaClusterParity?: (input: {
          caipNetworkId?: string | null
          caipChainId?: string | number | null
          expectedNetworkMode: 'mainnet' | 'testnet'
        }) => { ok: boolean; expectedLabel: string; actualLabel: string; error?: string }
      }
      assert.equal(typeof api.validateSolanaClusterParity, 'function', 'must export validateSolanaClusterParity')

      // Mainnet valid variants
      for (const input of [
        { caipNetworkId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', caipChainId: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' },
        { caipChainId: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' },
        { caipChainId: 'solana-mainnet' },
        { caipChainId: 'mainnet-beta' },
      ]) {
        const res = api.validateSolanaClusterParity({ ...input, expectedNetworkMode: 'mainnet' })
        assert.equal(res.ok, true, `Expected mainnet match for ${JSON.stringify(input)}`)
        assert.equal(res.expectedLabel, 'Solana Mainnet')
        assert.equal(res.actualLabel, 'Solana Mainnet')
      }

      // Devnet valid variants
      for (const input of [
        { caipNetworkId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1', caipChainId: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1' },
        { caipChainId: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1' },
        { caipChainId: 'solana-devnet' },
        { caipChainId: 'devnet' },
      ]) {
        const res = api.validateSolanaClusterParity({ ...input, expectedNetworkMode: 'testnet' })
        assert.equal(res.ok, true, `Expected devnet match for ${JSON.stringify(input)}`)
        assert.equal(res.expectedLabel, 'Solana Devnet')
        assert.equal(res.actualLabel, 'Solana Devnet')
      }

      // Mainnet <-> Devnet mismatches
      const devnetOnMainnet = api.validateSolanaClusterParity({
        caipNetworkId: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        caipChainId: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
        expectedNetworkMode: 'mainnet',
      })
      assert.equal(devnetOnMainnet.ok, false)
      assert.equal(devnetOnMainnet.expectedLabel, 'Solana Mainnet')
      assert.equal(devnetOnMainnet.actualLabel, 'Solana Devnet')

      const mainnetOnTestnet = api.validateSolanaClusterParity({
        caipNetworkId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        caipChainId: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
        expectedNetworkMode: 'testnet',
      })
      assert.equal(mainnetOnTestnet.ok, false)
      assert.equal(mainnetOnTestnet.expectedLabel, 'Solana Devnet')
      assert.equal(mainnetOnTestnet.actualLabel, 'Solana Mainnet')

      // Solana Testnet (not Devnet), EVM namespace, missing ID, and contradictory IDs all fail closed
      assert.equal(
        api.validateSolanaClusterParity({
          caipNetworkId: 'solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z',
          expectedNetworkMode: 'testnet',
        }).ok,
        false,
      )
      assert.equal(
        api.validateSolanaClusterParity({
          caipNetworkId: 'eip155:56',
          caipChainId: 56,
          expectedNetworkMode: 'mainnet',
        }).ok,
        false,
      )
      assert.equal(
        api.validateSolanaClusterParity({
          caipNetworkId: undefined,
          caipChainId: undefined,
          expectedNetworkMode: 'mainnet',
        }).ok,
        false,
      )
      assert.equal(
        api.validateSolanaClusterParity({
          caipNetworkId: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
          caipChainId: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
          expectedNetworkMode: 'mainnet',
        }).ok,
        false,
      )
    })

    it('wires parsePositiveAtomicBigInt, validateEvmSigningParity, explicit account, and validateSolanaClusterParity in WalletPaymentCheckout.tsx', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const payBlock = extractBlock(checkoutSrc, 'const handlePay = async')

      assert.doesNotMatch(
        payBlock,
        /\bBigInt\(intent\.expectedAmountAtomic\)/,
        'handlePay must never use raw BigInt(intent.expectedAmountAtomic)',
      )
      assert.ok(
        payBlock.includes('parsePositiveAtomicBigInt(intent.expectedAmountAtomic)'),
        'handlePay must parse expectedAmountAtomic with parsePositiveAtomicBigInt',
      )
      assert.ok(
        payBlock.includes('validateEvmSigningParity('),
        'handlePay EVM branch must validate signer parity via validateEvmSigningParity',
      )
      assert.ok(
        payBlock.includes('validateSolanaClusterParity('),
        'handlePay Solana branch must validate cluster parity via validateSolanaClusterParity',
      )
      const clusterIdx = payBlock.indexOf('validateSolanaClusterParity(')
      const buildSolIdx = payBlock.indexOf('buildSolanaPaymentTransaction(')
      assert.ok(clusterIdx > 0 && clusterIdx < buildSolIdx, 'Solana cluster check must run BEFORE buildSolanaPaymentTransaction')

      const writeContractMatch = payBlock.match(/writeContractAsync\(\{[\s\S]*?\}\)/)
      assert.ok(writeContractMatch, 'Expected writeContractAsync call in handlePay')
      assert.match(writeContractMatch[0], /account:\s*activeAddress as `0x\$\{string\}`/, 'writeContractAsync must pass explicit account')

      const sendTxMatch = payBlock.match(/sendTransactionAsync\(\{[\s\S]*?\}\)/)
      assert.ok(sendTxMatch, 'Expected sendTransactionAsync call in handlePay')
      assert.match(sendTxMatch[0], /account:\s*activeAddress as `0x\$\{string\}`/, 'sendTransactionAsync must pass explicit account')
    })
  })

  describe('F-04: Cross-chain native fallback in AWAITING && hasNetworkSelectionMismatch', () => {
    it('applies automatic native fallback in Step 2 for OPEN or (AWAITING && hasNetworkSelectionMismatch) without weakening manual USDT selection', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const step2Start = checkoutSrc.indexOf('// Step 2:')
      const step2End = checkoutSrc.indexOf('// Real TTL countdown timer')
      assert.ok(step2Start > 0 && step2End > step2Start)
      const step2Src = checkoutSrc.slice(step2Start, step2End)

      assert.match(
        step2Src,
        /\(intent\.status === 'OPEN' \|\| \(intent\.status === 'AWAITING' && hasNetworkSelectionMismatch\)\)/,
        'Step 2 native fallback must cover both OPEN and (AWAITING && hasNetworkSelectionMismatch)',
      )

      // Manual USDT click in handleSelectNetworkOrAsset still passes nextAsset directly (keeps explicit rejection intact)
      const selectBlock = extractBlock(checkoutSrc, 'const handleSelectNetworkOrAsset = async')
      assert.ok(
        selectBlock.includes("const nextAsset: PaymentAssetSymbol = nextUseUsdt ? 'USDT' : NATIVE_SYMBOL_BY_NETWORK[nextNet]"),
        'handleSelectNetworkOrAsset must keep explicit USDT selection intact so manual clicks surface server error',
      )
    })
  })

  describe('F-05: Unified disconnection, single source of truth, and removal of ghost-connected state', () => {
    it('routes walletSession.ts disconnect through disconnectWeb3SessionBestEffort, uses caipNetwork?.name fallback, and stays <= 130 lines', () => {
      const sessionSrc = readText('src/walletSession.ts')
      assert.ok(sessionSrc.split(/\r?\n/).length <= 130, 'walletSession.ts must remain <= 130 lines')
      assert.ok(sessionSrc.includes('disconnectWeb3SessionBestEffort'), 'walletSession.ts must delegate disconnect to disconnectWeb3SessionBestEffort')
      assert.match(
        sessionSrc,
        /disconnectWeb3SessionBestEffort\(\{\s*disconnectAppKit:\s*\(\)\s*=>\s*appKitDisconnect\(\),\s*clearOwnerStorage:\s*true,?\s*\}\)/,
        'walletSession.ts disconnect() must pass disconnectAppKit and clearOwnerStorage: true',
      )
      assert.ok(sessionSrc.includes('caipNetwork?.name'), 'walletSession.ts must use caipNetwork?.name fallback for network label')
    })

    it('uses resolvedWallet as primary source and single unified disconnect in WalletPanel.tsx', () => {
      const panelSrc = readText('src/WalletPanel.tsx')
      assert.ok(panelSrc.includes('@reown/appkit/react'))
      assert.equal(panelSrc.includes('directWallets'), false)
      assert.ok(panelSrc.includes('<ClientPaymentHistory uid={authenticatedUid} />'))

      assert.equal(
        panelSrc.includes('session?.connection?.address || resolvedWallet.activeAddress'),
        false,
        'WalletPanel.tsx must remove priority inversion session?.connection?.address || resolvedWallet.activeAddress',
      )
      assert.equal(
        panelSrc.includes("activeAddress.startsWith('0x')"),
        false,
        'WalletPanel.tsx must remove raw .startsWith(0x) check in favor of resolvedWallet.isEvmWallet',
      )
      assert.ok(panelSrc.includes('resolvedWallet.activeAddress'), 'WalletPanel.tsx must read resolvedWallet.activeAddress')
      assert.ok(panelSrc.includes('resolvedWallet.isEvmWallet'), 'WalletPanel.tsx must read resolvedWallet.isEvmWallet')
      assert.ok(panelSrc.includes('disconnectWeb3SessionBestEffort'), 'WalletPanel.tsx must fallback disconnect to disconnectWeb3SessionBestEffort')

      const disconnectBlock = extractBlock(panelSrc, 'const handleDisconnect = async')
      const appKitDisconnectCalls = disconnectBlock.match(/disconnectAppKit\(/g) ?? []
      assert.equal(appKitDisconnectCalls.length, 1, 'handleDisconnect must only call disconnectAppKit inside the fallback branch (no duplicate call)')
      assert.match(
        disconnectBlock,
        /session\?\.disconnect[\s\S]*?disconnectWeb3SessionBestEffort/,
        'handleDisconnect must delegate once to session.disconnect() or disconnectWeb3SessionBestEffort',
      )
    })

    it('removes fallbackAddress ghost-connected state in WalletPaymentCheckout.tsx and aligns App.tsx to walletSession.connection', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      assert.equal(
        checkoutSrc.includes('fallbackAddress:'),
        false,
        'WalletPaymentCheckout.tsx must NOT pass fallbackAddress to resolveActiveMultichainWallet',
      )

      const appSrc = readText('src/App.tsx')
      assert.equal(
        appSrc.includes('walletSession.connection?.address || appKitAddress || wagmiAddress'),
        false,
        'App.tsx must not let dormant wagmiAddress hijack activeWalletAddress',
      )
      assert.match(
        appSrc,
        /const activeWalletAddress = walletSession\.connection\?\.address \?\? ''/,
        'App.tsx activeWalletAddress must consume walletSession.connection',
      )
      assert.match(
        appSrc,
        /const isWalletConnected = Boolean\(walletSession\.connection\)/,
        'App.tsx isWalletConnected must consume walletSession.connection',
      )
      assert.match(
        appSrc,
        /const hasAnyWeb3ProviderConnected = isWalletConnected \|\| isWagmiConnected \|\| isAppKitConnected/,
        'App.tsx must track hasAnyWeb3ProviderConnected so SCRUM-375/378 guards still disconnect dormant Wagmi connectors when Solana is disconnected',
      )
      assert.match(
        appSrc,
        /evaluateWalletSessionTransition\(\{[\s\S]*?isWalletConnected:\s*hasAnyWeb3ProviderConnected/,
        'SCRUM-375 wallet guard must evaluate against hasAnyWeb3ProviderConnected',
      )
      assert.match(
        appSrc,
        /const currentlyConnected = hasAnyWeb3ProviderConnectedRef\.current/,
        'SCRUM-378 cross-tab storage guard must evaluate against hasAnyWeb3ProviderConnectedRef',
      )
    })
  })

  describe('F-06: Visible network switch failure in handleSwitchNetwork', () => {
    it('invokes appKitModal.switchNetwork(targetAppKitNet, { throwOnFailure: true }) in WalletPaymentCheckout.tsx', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      assert.match(checkoutSrc, /import\s*\{[^}]*\bappKitModal\b[^}]*\}\s*from\s*'\.\/appkitConfig'/)
      const switchBlock = extractBlock(checkoutSrc, 'const handleSwitchNetwork = async')
      assert.match(
        switchBlock,
        /await appKitModal\.switchNetwork\(targetAppKitNet,\s*\{\s*throwOnFailure:\s*true\s*\}\)/,
        'handleSwitchNetwork must call appKitModal.switchNetwork(targetAppKitNet, { throwOnFailure: true })',
      )
    })
  })

  describe('F-07: Canonical PouwMiner.com metadata in src/appkitConfig.ts and frozen firestore.rules', () => {
    it('removes all app.gomining.com references, preserves PouwMiner.com metadata on canonicalOrigin, stays decoupled from walletSession, and keeps firestore.rules byte-identical', () => {
      const appKitSrc = readText('src/appkitConfig.ts')
      assert.equal(appKitSrc.includes('app.gomining.com'), false, 'src/appkitConfig.ts must contain 0 references to app.gomining.com')
      assert.match(appKitSrc, /name:\s*'PouwMiner\.com'/)
      assert.match(appKitSrc, /description:\s*'PouwMiner\.com wallet connection'/)
      assert.ok(appKitSrc.includes('https://pouwminer.com'), 'src/appkitConfig.ts must fallback canonicalOrigin to https://pouwminer.com')
      assert.ok(appKitSrc.includes('window.location?.origin'), 'src/appkitConfig.ts must prefer window.location?.origin')
      assert.ok(appKitSrc.includes('`${canonicalOrigin}/favicon.ico`'), 'src/appkitConfig.ts icons must derive from canonicalOrigin')
      assert.equal(appKitSrc.includes('walletSession'), false, 'src/appkitConfig.ts must remain decoupled from walletSession')

      const rulesRaw = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'))
      assert.equal(rulesRaw.includes(0x0d), false, 'firestore.rules must remain pure LF (HAS_CR=false)')
      const actualSha256 = crypto.createHash('sha256').update(rulesRaw).digest('hex').toUpperCase()
      assert.equal(actualSha256, EXPECTED_RULES_SHA256)
    })
  })
})
