import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import ts from 'typescript'
import type { PaymentNetworkId } from '../src/paymentDestinations.ts'
import * as coordinator from '../src/services/payments/checkoutIntentCoordinator.ts'

const projectRoot = path.resolve(import.meta.dirname, '..')
const EXPECTED_RULES_SHA256 = 'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779'

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

function collectVisibleStringsAndJsxText(relPath: string): Array<{ line: number; text: string }> {
  const sourceText = readText(relPath)
  const scriptKind = relPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sf = ts.createSourceFile(relPath, sourceText, ts.ScriptTarget.Latest, true, scriptKind)
  const matches: Array<{ line: number; text: string }> = []

  function visit(node: ts.Node): void {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      const text = node.text
      if (/reown\s+appkit/i.test(text)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf))
        matches.push({ line: line + 1, text: text.trim() })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sf)
  return matches
}

describe('POUW Checkout: All Enabled Networks, 1-Click Wallet Switch & PouwMiner White-Label', () => {
  describe('Block 1.1: Pure wallet-family helpers in checkoutIntentCoordinator.ts', () => {
    it('maps all 8 networks to their wallet family, AppKit namespace, and display label', () => {
      const api = coordinator as unknown as {
        getPaymentNetworkFamily?: (networkId: PaymentNetworkId) => 'evm' | 'solana' | 'tron'
        getAppKitNamespaceForFamily?: (family: 'evm' | 'solana' | 'tron') => 'eip155' | 'solana' | 'tron'
        getWalletFamilyLabel?: (family: 'evm' | 'solana' | 'tron') => string
      }

      assert.equal(typeof api.getPaymentNetworkFamily, 'function', 'must export getPaymentNetworkFamily')
      assert.equal(typeof api.getAppKitNamespaceForFamily, 'function', 'must export getAppKitNamespaceForFamily')
      assert.equal(typeof api.getWalletFamilyLabel, 'function', 'must export getWalletFamilyLabel')

      const expectedFamilies: Record<PaymentNetworkId, 'evm' | 'solana' | 'tron'> = {
        bnb: 'evm',
        tron: 'tron',
        polygon: 'evm',
        solana: 'solana',
        arbitrum: 'evm',
        optimism: 'evm',
        avalanche: 'evm',
        ethereum: 'evm',
      }
      for (const [networkId, expectedFamily] of Object.entries(expectedFamilies) as Array<[PaymentNetworkId, 'evm' | 'solana' | 'tron']>) {
        assert.equal(
          api.getPaymentNetworkFamily!(networkId),
          expectedFamily,
          `getPaymentNetworkFamily('${networkId}') must return '${expectedFamily}'`,
        )
      }

      assert.equal(api.getAppKitNamespaceForFamily!('evm'), 'eip155')
      assert.equal(api.getAppKitNamespaceForFamily!('solana'), 'solana')
      assert.equal(api.getAppKitNamespaceForFamily!('tron'), 'tron')

      assert.equal(api.getWalletFamilyLabel!('evm'), 'EVM')
      assert.equal(api.getWalletFamilyLabel!('solana'), 'Solana')
      assert.equal(api.getWalletFamilyLabel!('tron'), 'TRON')
    })

    it('evaluates isWalletFamilyCompatibleWithNetwork accurately across all 8 networks and all 3 families + disconnected', () => {
      const api = coordinator as unknown as {
        isWalletFamilyCompatibleWithNetwork?: (input: {
          networkId: PaymentNetworkId
          isEvmWallet: boolean
          isSolanaWallet: boolean
          isTronWallet: boolean
        }) => boolean
      }
      assert.equal(typeof api.isWalletFamilyCompatibleWithNetwork, 'function', 'must export isWalletFamilyCompatibleWithNetwork')

      const evmNetworks: PaymentNetworkId[] = ['bnb', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'ethereum']
      const allNetworks: PaymentNetworkId[] = [...evmNetworks, 'solana', 'tron']

      for (const networkId of allNetworks) {
        const expectEvm = evmNetworks.includes(networkId)
        const expectSol = networkId === 'solana'
        const expectTron = networkId === 'tron'

        assert.equal(
          api.isWalletFamilyCompatibleWithNetwork!({ networkId, isEvmWallet: true, isSolanaWallet: false, isTronWallet: false }),
          expectEvm,
          `EVM wallet compatibility for ${networkId}`,
        )
        assert.equal(
          api.isWalletFamilyCompatibleWithNetwork!({ networkId, isEvmWallet: false, isSolanaWallet: true, isTronWallet: false }),
          expectSol,
          `Solana wallet compatibility for ${networkId}`,
        )
        assert.equal(
          api.isWalletFamilyCompatibleWithNetwork!({ networkId, isEvmWallet: false, isSolanaWallet: false, isTronWallet: true }),
          expectTron,
          `TRON wallet compatibility for ${networkId}`,
        )
        assert.equal(
          api.isWalletFamilyCompatibleWithNetwork!({ networkId, isEvmWallet: false, isSolanaWallet: false, isTronWallet: false }),
          false,
          `Disconnected wallet must not be compatible with ${networkId}`,
        )
      }
    })

    it('resolves auto-aligned network on wallet-family switch and initial OPEN connect while respecting F-01 lock and manual picks', () => {
      const api = coordinator as unknown as {
        resolveAutoAlignedNetworkOnWalletSwitch?: (input: {
          prevWalletFamily: 'evm' | 'solana' | 'tron' | null
          nextWalletFamily: 'evm' | 'solana' | 'tron' | null
          currentNetworkId: PaymentNetworkId
          hasBroadcastTxLock: boolean
          intentStatus?: 'OPEN' | 'AWAITING' | 'PROCESSING' | 'SETTLED' | 'UNDERPAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | null
          hasManualNetworkSelection: boolean
        }) => PaymentNetworkId | null
      }
      assert.equal(
        typeof api.resolveAutoAlignedNetworkOnWalletSwitch,
        'function',
        'must export resolveAutoAlignedNetworkOnWalletSwitch',
      )
      const resolve = api.resolveAutoAlignedNetworkOnWalletSwitch!

      // Active wallet-family switches -> default network of new family
      assert.equal(
        resolve({ prevWalletFamily: 'evm', nextWalletFamily: 'solana', currentNetworkId: 'bnb', hasBroadcastTxLock: false, intentStatus: 'AWAITING', hasManualNetworkSelection: false }),
        'solana',
      )
      assert.equal(
        resolve({ prevWalletFamily: 'solana', nextWalletFamily: 'evm', currentNetworkId: 'solana', hasBroadcastTxLock: false, intentStatus: 'AWAITING', hasManualNetworkSelection: true }),
        'bnb',
      )
      assert.equal(
        resolve({ prevWalletFamily: 'evm', nextWalletFamily: 'tron', currentNetworkId: 'polygon', hasBroadcastTxLock: false, intentStatus: 'AWAITING', hasManualNetworkSelection: true }),
        'tron',
      )
      assert.equal(
        resolve({ prevWalletFamily: 'tron', nextWalletFamily: 'evm', currentNetworkId: 'tron', hasBroadcastTxLock: false, intentStatus: 'AWAITING', hasManualNetworkSelection: false }),
        'bnb',
      )
      assert.equal(
        resolve({ prevWalletFamily: 'solana', nextWalletFamily: 'tron', currentNetworkId: 'solana', hasBroadcastTxLock: false, intentStatus: 'AWAITING', hasManualNetworkSelection: false }),
        'tron',
      )
      assert.equal(
        resolve({ prevWalletFamily: 'tron', nextWalletFamily: 'solana', currentNetworkId: 'tron', hasBroadcastTxLock: false, intentStatus: 'AWAITING', hasManualNetworkSelection: false }),
        'solana',
      )

      // Initial connection from disconnected on OPEN without manual network selection (covers EVM, Solana, TRON)
      assert.equal(
        resolve({ prevWalletFamily: null, nextWalletFamily: 'evm', currentNetworkId: 'solana', hasBroadcastTxLock: false, intentStatus: 'OPEN', hasManualNetworkSelection: false }),
        'bnb',
      )
      assert.equal(
        resolve({ prevWalletFamily: null, nextWalletFamily: 'solana', currentNetworkId: 'bnb', hasBroadcastTxLock: false, intentStatus: 'OPEN', hasManualNetworkSelection: false }),
        'solana',
      )
      assert.equal(
        resolve({ prevWalletFamily: null, nextWalletFamily: 'tron', currentNetworkId: 'bnb', hasBroadcastTxLock: false, intentStatus: 'OPEN', hasManualNetworkSelection: false }),
        'tron',
      )

      // Initial connection respects manual network selection and non-OPEN status
      assert.equal(
        resolve({ prevWalletFamily: null, nextWalletFamily: 'evm', currentNetworkId: 'solana', hasBroadcastTxLock: false, intentStatus: 'OPEN', hasManualNetworkSelection: true }),
        null,
      )
      assert.equal(
        resolve({ prevWalletFamily: null, nextWalletFamily: 'solana', currentNetworkId: 'bnb', hasBroadcastTxLock: false, intentStatus: 'AWAITING', hasManualNetworkSelection: false }),
        null,
      )

      // Same wallet family after manual incompatible network pick + modal cancel -> null (keeps warning + CTA)
      assert.equal(
        resolve({ prevWalletFamily: 'evm', nextWalletFamily: 'evm', currentNetworkId: 'solana', hasBroadcastTxLock: false, intentStatus: 'AWAITING', hasManualNetworkSelection: true }),
        null,
      )

      // Already compatible target network (user clicked Solana chip first, then switched to Solana wallet) -> null
      assert.equal(
        resolve({ prevWalletFamily: 'evm', nextWalletFamily: 'solana', currentNetworkId: 'solana', hasBroadcastTxLock: false, intentStatus: 'AWAITING', hasManualNetworkSelection: true }),
        null,
      )

      // F-01 broadcast lock dominance & disconnected state -> always null
      assert.equal(
        resolve({ prevWalletFamily: 'evm', nextWalletFamily: 'solana', currentNetworkId: 'bnb', hasBroadcastTxLock: true, intentStatus: 'AWAITING', hasManualNetworkSelection: false }),
        null,
      )
      assert.equal(
        resolve({ prevWalletFamily: null, nextWalletFamily: 'tron', currentNetworkId: 'bnb', hasBroadcastTxLock: true, intentStatus: 'OPEN', hasManualNetworkSelection: false }),
        null,
      )
      assert.equal(
        resolve({ prevWalletFamily: 'evm', nextWalletFamily: null, currentNetworkId: 'bnb', hasBroadcastTxLock: false, intentStatus: 'AWAITING', hasManualNetworkSelection: false }),
        null,
      )
    })
  })

  describe('Block 1.2: WalletPaymentCheckout.tsx all enabled networks, mismatch guards & 1-click wallet switch', () => {
    it('renders all enabledNetworks without wallet-family hiding and initializes networkId compatibly', () => {
      const src = readText('src/WalletPaymentCheckout.tsx')

      assert.equal(
        src.includes('const availableNetworks ='),
        false,
        'WalletPaymentCheckout must not hide networks behind availableNetworks filtering',
      )
      assert.match(
        src,
        /\{enabledNetworks\.map\(\(net\) => \(/,
        '1. Red de pago must render enabledNetworks directly',
      )
      assert.match(
        src,
        /const \[networkId, setNetworkId\] = useState<PaymentNetworkId>\(\(\) => \{[\s\S]*?if \(isSolanaWallet\) return 'solana'[\s\S]*?if \(isTronWallet\) return 'tron'[\s\S]*?initialNetworkId === 'ethereum' && !ethereumEnabled \? 'bnb' : initialNetworkId/,
        'networkId state must initialize compatibly with connected Solana/TRON/EVM wallet',
      )
      assert.match(src, /const selectedNetworkFamily = getPaymentNetworkFamily\(effectiveNetworkId\)/)
      assert.match(
        src,
        /const connectedWalletFamily:\s*PaymentWalletFamily \| null = isEvmWallet[\s\S]*?'evm'[\s\S]*?isTronWallet[\s\S]*?'tron'[\s\S]*?isSolanaWallet[\s\S]*?'solana'[\s\S]*?: null/,
      )
      assert.match(
        src,
        /const isWrongWalletFamily = Boolean\(\s*isWalletConnected\s*&&\s*!isWalletFamilyCompatibleWithNetwork\(\{[\s\S]*?networkId:\s*effectiveNetworkId[\s\S]*?\}\)\s*,?\s*\)/,
      )
    })

    it('prevents INVALID_SENDER_WALLET across Step 1, Step 2 (with OPEN auto-align), handleSelectNetworkOrAsset, and handlePay', () => {
      const src = readText('src/WalletPaymentCheckout.tsx')

      // Review Focus #4: Step 1 avoids sending mismatched senderWallet when opened connected on another family
      const step1Start = src.indexOf('// Step 1:')
      const step2Start = src.indexOf('// Step 2:')
      assert.ok(step1Start > 0 && step2Start > step1Start)
      const step1Src = src.slice(step1Start, step2Start)
      assert.match(
        step1Src,
        /sel\.isWalletConnected\s*&&\s*!sel\.isWrongWalletFamily/,
        'Step 1 must not send mismatched networkId/senderWallet to createPaymentIntent when isWrongWalletFamily is true',
      )

      // Review Focus #1: Step 2 never calls selectPaymentMethod during isWrongWalletFamily and aligns OPEN intents on Solana/TRON connect
      const step2End = src.indexOf('// Real TTL countdown timer')
      assert.ok(step2End > step2Start)
      const step2Src = src.slice(step2Start, step2End)
      const wrongFamilyGuardIdx = step2Src.indexOf('if (isWrongWalletFamily)')
      const syncKeyIdx = step2Src.indexOf('resolvePendingMethodSyncKey(')
      const selectMethodIdx = step2Src.indexOf('await selectPaymentMethod(')
      assert.ok(
        wrongFamilyGuardIdx > 0 && wrongFamilyGuardIdx < syncKeyIdx && syncKeyIdx < selectMethodIdx,
        'Step 2 must guard isWrongWalletFamily BEFORE resolvePendingMethodSyncKey and selectPaymentMethod',
      )
      assert.match(
        step2Src,
        /resolveAutoAlignedNetworkOnWalletSwitch\(\{[\s\S]*?prevWalletFamily[\s\S]*?nextWalletFamily:\s*connectedWalletFamily[\s\S]*?currentNetworkId:\s*effectiveNetworkId[\s\S]*?hasBroadcastTxLock[\s\S]*?intentStatus:\s*intent\.status[\s\S]*?hasManualNetworkSelection:\s*hasManualNetworkSelectionRef\.current/,
        'Step 2 must delegate wallet-switch and OPEN auto-alignment to resolveAutoAlignedNetworkOnWalletSwitch before isWrongWalletFamily guard',
      )
      assert.match(
        step2Src,
        /\[[^\]]*connectedWalletFamily[^\]]*isWrongWalletFamily[^\]]*effectiveNetworkId[^\]]*\]/,
        'Step 2 deps must include connectedWalletFamily, isWrongWalletFamily, and effectiveNetworkId so wallet switches and OPEN auto-alignment immediately trigger selectPaymentMethod',
      )

      // Review Focus #3: handleSelectNetworkOrAsset updates visual state only on mismatch and restores matching active quote without duplicates
      const selectBlock = extractBlock(src, 'const handleSelectNetworkOrAsset = async')
      const mismatchIdx = selectBlock.indexOf('!isWalletFamilyCompatibleWithNetwork(')
      const inPlaceCallIdx = selectBlock.indexOf('await selectPaymentMethod(')
      assert.ok(
        mismatchIdx > 0 && mismatchIdx < inPlaceCallIdx,
        'handleSelectNetworkOrAsset must short-circuit visual-only update BEFORE selectPaymentMethod when wallet family is incompatible',
      )
      assert.equal(selectBlock.includes('METHOD_CHANGED'), false, 'Must preserve SCRUM-373 (0 METHOD_CHANGED)')
      assert.equal(selectBlock.includes('cancelPaymentIntent'), false, 'Must preserve SCRUM-373 (0 cancelPaymentIntent)')

      // Review Focus #5: handlePay fails closed on isWrongWalletFamily before any signing branch
      const payBlock = extractBlock(src, 'const handlePay = async')
      const payWrongFamilyIdx = payBlock.indexOf('if (isWrongWalletFamily)')
      const paySolanaIdx = payBlock.indexOf('if (isSolana)')
      assert.ok(
        payWrongFamilyIdx > 0 && payWrongFamilyIdx < paySolanaIdx,
        'handlePay must fail closed on isWrongWalletFamily before reaching Solana/TRON/EVM signing branches',
      )
    })

    it('renders switch-wallet header CTA, wrong-family quote notice, and 1-click namespace CTA respecting F-01 lock dominance', () => {
      const src = readText('src/WalletPaymentCheckout.tsx')

      // Header switch-wallet button (Review Focus #4: disabled during paying || cancelling || hasBroadcastTxLock)
      const switchWalletBtnIdx = src.indexOf('data-testid="checkout-switch-wallet-btn"')
      assert.notEqual(switchWalletBtnIdx, -1, 'Connected header must render checkout-switch-wallet-btn')
      const switchWalletBtnEnd = src.indexOf('</button>', switchWalletBtnIdx)
      const switchWalletBtn = src.slice(switchWalletBtnIdx, switchWalletBtnEnd)
      assert.ok(switchWalletBtn.includes('Cambiar billetera'), 'Header button must read Cambiar billetera')
      assert.match(
        switchWalletBtn,
        /disabled=\{paying \|\| cancelling \|\| hasBroadcastTxLock\}/,
        'Cambiar billetera button must be disabled while paying || cancelling || hasBroadcastTxLock',
      )
      assert.match(switchWalletBtn, /void openAppKit\(\)/, 'Cambiar billetera must invoke void openAppKit()')

      // Review Focus #2: quote card mismatch notice gated by isWrongWalletFamily && !hasBroadcastTxLock
      const quoteCardIdx = src.indexOf('<div className="checkout-quote-card">')
      const ctaBoxIdx = src.indexOf('<div className="checkout-cta-box">')
      assert.ok(quoteCardIdx > 0 && ctaBoxIdx > quoteCardIdx)
      const quoteCardSrc = src.slice(quoteCardIdx, ctaBoxIdx)
      assert.match(quoteCardSrc, /isWrongWalletFamily\s*&&\s*!hasBroadcastTxLock/)
      assert.ok(quoteCardSrc.includes('Tu billetera actual es '))
      assert.ok(quoteCardSrc.includes('Para pagar en '))
      assert.ok(quoteCardSrc.includes('cambia a una billetera compatible con '))

      // CTA box priority: hasBroadcastTxLock -> isWrongWalletFamily -> isWrongEvmChain -> Pagar
      const ctaBoxSrc = src.slice(ctaBoxIdx)
      const retryBtnIdx = ctaBoxSrc.indexOf('data-testid="checkout-retry-verification-btn"')
      const familyBtnIdx = ctaBoxSrc.indexOf('data-testid="checkout-switch-wallet-family-btn"')
      const wrongEvmIdx = ctaBoxSrc.indexOf(': isWrongEvmChain ?')
      const payBtnIdx = ctaBoxSrc.indexOf('onClick={handlePay}')
      assert.ok(
        retryBtnIdx > 0 && familyBtnIdx > retryBtnIdx && wrongEvmIdx > familyBtnIdx && payBtnIdx > wrongEvmIdx,
        'CTA box must order F-01 retry verification -> isWrongWalletFamily switch CTA -> isWrongEvmChain -> Pagar',
      )
      assert.ok(
        ctaBoxSrc.includes('void openAppKit({ namespace: getAppKitNamespaceForFamily(selectedNetworkFamily) })'),
        '1-click family switch CTA must call openAppKit({ namespace: getAppKitNamespaceForFamily(selectedNetworkFamily) })',
      )
      assert.ok(
        ctaBoxSrc.includes('Cambiar a billetera {requiredWalletLabel}'),
        '1-click family switch CTA must display Cambiar a billetera {requiredWalletLabel}',
      )

      // Preserve SCRUM-381 & SCRUM-382 invariants
      assert.ok(src.includes('showCalmAutoVerify'))
      assert.ok(src.includes('autoVerifyInFlightRef'))
      assert.ok(src.includes('activeIntentIdRef'))
    })

    it('Review Fix #1: createFreshIntent omits mismatched networkId/senderWallet during isWrongWalletFamily and terminal/expired view surfaces errors', () => {
      const src = readText('src/WalletPaymentCheckout.tsx')

      const freshBlock = extractBlock(src, 'const createFreshIntent = useCallback')
      assert.ok(
        freshBlock.includes('isWalletFamilyCompatibleWithNetwork('),
        'createFreshIntent must verify wallet-family compatibility before binding networkId/senderWallet on createPaymentIntent',
      )
      assert.ok(
        freshBlock.includes('networkId: toBackendPaymentNetworkId'),
        'createFreshIntent must preserve direct AWAITING creation when wallet family is compatible',
      )

      const terminalStart = src.indexOf("intent.status === 'UNDERPAID' || intent.status === 'FAILED'")
      const formStart = src.indexOf('<div className="checkout-form-content">')
      assert.ok(terminalStart > 0 && formStart > terminalStart)
      const terminalBranch = src.slice(terminalStart, formStart)
      assert.ok(
        terminalBranch.includes('checkout-error-banner'),
        'Terminal/expired view must render checkout-error-banner so regeneration failures are never silent',
      )
    })

    it('Review Fix #2/#3: preserves USDT preference across Testnet incompatible-network preview round-trip (BNB -> Solana -> BNB) via resolveNetworkSelectionUseUsdt', () => {
      const api = coordinator as unknown as {
        resolveNetworkSelectionUseUsdt?: (input: {
          currentUseUsdt: boolean
          hasTargetUsdtContract: boolean
          isWalletConnected: boolean
          isTargetFamilyCompatible: boolean
        }) => boolean
      }
      assert.equal(
        typeof api.resolveNetworkSelectionUseUsdt,
        'function',
        'checkoutIntentCoordinator must export resolveNetworkSelectionUseUsdt',
      )

      // Testnet BNB (USDT) -> preview incompatible Solana (no testnet USDT contract) -> preserves true
      const afterPreviewSolana = api.resolveNetworkSelectionUseUsdt!({
        currentUseUsdt: true,
        hasTargetUsdtContract: false,
        isWalletConnected: true,
        isTargetFamilyCompatible: false,
      })
      assert.equal(afterPreviewSolana, true, 'Previewing an incompatible network without testnet USDT must preserve user USDT preference')

      // Round-trip back to compatible BNB (has USDT contract) -> stays true (restores active USDT quote immediately)
      const afterReturnBnb = api.resolveNetworkSelectionUseUsdt!({
        currentUseUsdt: afterPreviewSolana,
        hasTargetUsdtContract: true,
        isWalletConnected: true,
        isTargetFamilyCompatible: true,
      })
      assert.equal(afterReturnBnb, true, 'Returning to compatible BNB with USDT contract must keep USDT selected')

      // Switching to compatible network WITHOUT testnet USDT contract -> falls back to native (SCRUM-381 I-03)
      assert.equal(
        api.resolveNetworkSelectionUseUsdt!({
          currentUseUsdt: true,
          hasTargetUsdtContract: false,
          isWalletConnected: true,
          isTargetFamilyCompatible: true,
        }),
        false,
      )

      // Native preference stays false even when target has USDT contract
      assert.equal(
        api.resolveNetworkSelectionUseUsdt!({
          currentUseUsdt: false,
          hasTargetUsdtContract: true,
          isWalletConnected: true,
          isTargetFamilyCompatible: true,
        }),
        false,
      )

      // WalletPaymentCheckout.tsx wires resolveNetworkSelectionUseUsdt in network chip onClick
      const src = readText('src/WalletPaymentCheckout.tsx')
      assert.ok(
        src.includes('resolveNetworkSelectionUseUsdt('),
        'WalletPaymentCheckout.tsx must use resolveNetworkSelectionUseUsdt on network chip click',
      )
    })

    it('hardens wallet-switch auto-alignment via prevWalletFamilyRef, disables .currency-pill-btn on isWrongWalletFamily, and enforces disabled parity on checkout-switch-wallet-family-btn', () => {
      const src = readText('src/WalletPaymentCheckout.tsx')

      // prevWalletFamilyRef tracking & reset on disconnect + alignment reset of hasManualNetworkSelectionRef
      assert.match(
        src,
        /const prevWalletFamilyRef = useRef<PaymentWalletFamily \| null>\(connectedWalletFamily\)/,
        'WalletPaymentCheckout must declare prevWalletFamilyRef initialized to connectedWalletFamily',
      )
      assert.ok(
        src.includes('prevWalletFamilyRef.current = null'),
        'WalletPaymentCheckout must reset prevWalletFamilyRef.current = null when wallet disconnects',
      )
      assert.ok(
        src.includes('prevWalletFamilyRef.current = connectedWalletFamily'),
        'WalletPaymentCheckout must advance prevWalletFamilyRef.current = connectedWalletFamily',
      )
      assert.match(
        src,
        /if \(alignedNet\) \{[\s\S]*?hasManualNetworkSelectionRef\.current = false[\s\S]*?setNetworkId\(alignedNet\)[\s\S]*?setUseUsdt\(Boolean\(getPaymentNetworkConfig\(alignedNet, intent\.networkMode\)\.usdtContractAddress\)\)[\s\S]*?setError\(''\)/,
        'Applying alignedNet must reset hasManualNetworkSelectionRef, update networkId/useUsdt, and clear error',
      )

      // checkout-switch-wallet-family-btn disabled parity with header checkout-switch-wallet-btn
      const familyBtnIdx = src.indexOf('data-testid="checkout-switch-wallet-family-btn"')
      assert.notEqual(familyBtnIdx, -1, 'Expected checkout-switch-wallet-family-btn')
      const familyBtnEnd = src.indexOf('</button>', familyBtnIdx)
      const familyBtn = src.slice(familyBtnIdx, familyBtnEnd)
      assert.match(
        familyBtn,
        /disabled=\{paying \|\| cancelling \|\| hasBroadcastTxLock\}/,
        'checkout-switch-wallet-family-btn must match checkout-switch-wallet-btn disabled={paying || cancelling || hasBroadcastTxLock}',
      )

      // Both .currency-pill-btn buttons disabled during isWrongWalletFamily
      const currencySectionStart = src.indexOf('2. Moneda de pago')
      const quoteCardStart = src.indexOf('<div className="checkout-quote-card">')
      assert.ok(currencySectionStart > 0 && quoteCardStart > currencySectionStart)
      const currencySection = src.slice(currencySectionStart, quoteCardStart)
      const pillMatches = [...currencySection.matchAll(/className=\{`currency-pill-btn[^`]*`\}[\s\S]*?disabled=\{([^}]+)\}/g)]
      assert.equal(pillMatches.length, 2, 'Expected exactly 2 .currency-pill-btn buttons in 2. Moneda de pago')
      for (const match of pillMatches) {
        assert.match(
          match[1],
          /\bisWrongWalletFamily\b/,
          `Each .currency-pill-btn must include isWrongWalletFamily in disabled={...}, got: ${match[1]}`,
        )
      }
    })

    it('Review Fix #1/#2: freezes prevWalletFamilyRef while F-01 lock is active, blocks auto-align on SETTLED/PROCESSING, and preserves terminal error banners', () => {
      const api = coordinator as unknown as {
        resolveAutoAlignedNetworkOnWalletSwitch?: (input: {
          prevWalletFamily: 'evm' | 'solana' | 'tron' | null
          nextWalletFamily: 'evm' | 'solana' | 'tron' | null
          currentNetworkId: PaymentNetworkId
          hasBroadcastTxLock: boolean
          intentStatus?: 'OPEN' | 'AWAITING' | 'PROCESSING' | 'SETTLED' | 'UNDERPAID' | 'FAILED' | 'EXPIRED' | 'CANCELLED' | null
          hasManualNetworkSelection: boolean
        }) => PaymentNetworkId | null
      }
      const resolve = api.resolveAutoAlignedNetworkOnWalletSwitch!

      // Important #2: never mutate selection on SETTLED or PROCESSING intents
      assert.equal(
        resolve({ prevWalletFamily: 'evm', nextWalletFamily: 'solana', currentNetworkId: 'bnb', hasBroadcastTxLock: false, intentStatus: 'SETTLED', hasManualNetworkSelection: false }),
        null,
      )
      assert.equal(
        resolve({ prevWalletFamily: 'evm', nextWalletFamily: 'tron', currentNetworkId: 'bnb', hasBroadcastTxLock: false, intentStatus: 'PROCESSING', hasManualNetworkSelection: false }),
        null,
      )
      // Regenerable terminal statuses still auto-align so "Generar nueva cotización" binds cleanly
      assert.equal(
        resolve({ prevWalletFamily: 'evm', nextWalletFamily: 'solana', currentNetworkId: 'bnb', hasBroadcastTxLock: false, intentStatus: 'EXPIRED', hasManualNetworkSelection: false }),
        'solana',
      )

      const src = readText('src/WalletPaymentCheckout.tsx')
      const step2Start = src.indexOf('// Step 2:')
      const step2End = src.indexOf('// Real TTL countdown timer')
      assert.ok(step2Start > 0 && step2End > step2Start)
      const step2Src = src.slice(step2Start, step2End)

      // Important #1: prevWalletFamilyRef advances ONLY when !hasBroadcastTxLock
      assert.match(
        step2Src,
        /if \(!hasBroadcastTxLock\)\s*\{\s*prevWalletFamilyRef\.current = connectedWalletFamily\s*\}/,
        'Step 2 must only advance prevWalletFamilyRef.current when !hasBroadcastTxLock so clearing a failed F-01 lock still auto-aligns',
      )

      // Important #2: preserve regeneration error banners on terminal views
      assert.match(
        step2Src,
        /if \(alignedNet\) \{[\s\S]*?if \(!isTerminalIntent\)\s*\{\s*setError\(''\)\s*\}/,
        'Step 2 must gate setError(\'\') on !isTerminalIntent when alignedNet updates state',
      )
    })
  })

  describe('Block 2: PouwMiner white-label regression & protected file invariants', () => {
    it('has 0 user-visible /Reown AppKit/i strings across all 6 scoped client files', () => {
      const targetFiles = [
        'src/WalletPaymentCheckout.tsx',
        'src/WalletPanel.tsx',
        'src/walletSession.ts',
        'src/App.tsx',
        'src/services/payments/checkoutIntentCoordinator.ts',
        'src/tronPayment.ts',
      ]

      for (const file of targetFiles) {
        const hits = collectVisibleStringsAndJsxText(file)
        assert.deepEqual(
          hits,
          [],
          `${file} must contain 0 user-visible occurrences of /Reown AppKit/i, found: ${JSON.stringify(hits)}`,
        )
      }
    })

    it('renders exact PouwMiner white-label copy while preserving ADR-0006 internals and protected invariants', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const panelSrc = readText('src/WalletPanel.tsx')
      const sessionSrc = readText('src/walletSession.ts')
      const appSrc = readText('src/App.tsx')
      const appKitSrc = readText('src/appkitConfig.ts')

      // WalletPaymentCheckout.tsx
      assert.ok(checkoutSrc.includes('Pasarela de Pagos PouwMiner · Verificación On-Chain'))
      assert.ok(checkoutSrc.includes('Conecta tu billetera para pagar'))
      assert.ok(checkoutSrc.includes('Conectar Billetera'))
      assert.ok(checkoutSrc.includes("'Billetera EVM conectada'"))
      assert.ok(checkoutSrc.includes("'Billetera TRON conectada'"))
      assert.ok(checkoutSrc.includes("'Billetera Solana conectada'"))

      // WalletPanel.tsx
      assert.ok(panelSrc.includes('Cartera Web3 · PouwMiner'))
      assert.ok(
        panelSrc.includes(
          'Conecta o gestiona tu billetera EVM, Solana o TRON de forma segura en la pasarela de pagos de PouwMiner (MetaMask, Phantom, Solflare, Trust Wallet, OKX, TronLink y +300 wallets).',
        ),
      )
      assert.ok(panelSrc.includes('Billetera conectada'))
      assert.match(panelSrc, /PASARELA POUWMINER · EVM, SOLANA (&amp;|&) TRON/)
      assert.ok(panelSrc.includes("isConnected ? 'Gestionar Billetera' : 'Conectar Billetera'"))
      assert.ok(panelSrc.includes('@reown/appkit/react'))
      assert.equal(panelSrc.includes('directWallets'), false)
      assert.ok(panelSrc.includes('<ClientPaymentHistory uid={authenticatedUid} />'))

      // walletSession.ts
      assert.ok(sessionSrc.split(/\r?\n/).length <= 130, 'src/walletSession.ts must remain <= 130 lines')
      assert.ok(sessionSrc.includes("'Billetera EVM'"))
      assert.ok(sessionSrc.includes("'Billetera TRON'"))
      assert.ok(sessionSrc.includes("'Billetera Solana'"))
      assert.ok(sessionSrc.includes("'Los pagos Web3 deben ejecutarse desde la pasarela oficial de PouwMiner.'"))
      assert.ok(sessionSrc.includes('@reown/appkit/react'))
      assert.ok(sessionSrc.includes('wagmi'))
      assert.ok(sessionSrc.includes("id: 'reown'"))

      // App.tsx (DemoTopUpDialog only)
      assert.ok(appSrc.includes('Elige la red; la pasarela de PouwMiner te permitirá conectar y firmar el pago.'))
      assert.ok(appSrc.includes("'Conectar billetera y pagar'"))
      assert.ok(appSrc.includes('<SessionActivity'))
      assert.ok(appSrc.includes('AuthorizedWithdrawalView'))

      // Protected files
      assert.ok(appKitSrc.includes('@reown/appkit/react'))
      assert.match(appKitSrc, /name:\s*'PouwMiner\.com'/)
      const rulesRaw = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'))
      assert.equal(rulesRaw.includes(0x0d), false, 'firestore.rules must remain pure LF (HAS_CR=false)')
      assert.equal(
        crypto.createHash('sha256').update(rulesRaw).digest('hex').toUpperCase(),
        EXPECTED_RULES_SHA256,
      )
    })
  })

  describe('Block 3: Mobile TRON INSUFFICIENT_FUNDS classification & mobile-first responsive checkout contracts', () => {
    it('classifies TronGrid ContractValidateException balance, account-not-exist, energy, and bandwidth errors as clean Spanish INSUFFICIENT_FUNDS without leaking Java exceptions', async () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const match = checkoutSrc.match(/export function sanitizeErrorReason[\s\S]*?(?=export function WalletPaymentCheckout)/)
      assert.ok(match, 'Expected sanitizeErrorReason..classifyPaymentError block in src/WalletPaymentCheckout.tsx')
      const transpiled = ts.transpileModule(match[0], {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      const mod = (await import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`)) as {
        classifyPaymentError: (err: unknown, networkName: string) => {
          message: string
          kind: string
          category: string
        }
      }

      const tronInsufficientCases = [
        'TRON_TX_BUILD_FAILED: class org.tron.core.exception.ContractValidateException : Validate TransferContract error, balance',
        'TRON_TX_BUILD_FAILED: class org.tron.core.exception.ContractValidateException : Validate TransferContract error, balance is not sufficient.',
        'TRON_BROADCAST_FAILED: TRON broadcast failed: Account not exist',
        'TRON_TX_BUILD_FAILED: class org.tron.core.exception.ContractValidateException : account [TNQpsnHA1234567890] does not exist',
        'TRON_TX_BUILD_FAILED: not enough energy',
        'TRON_TX_BUILD_FAILED: not enough bandwidth',
      ]

      for (const rawMsg of tronInsufficientCases) {
        const result = mod.classifyPaymentError(new Error(rawMsg), 'TRON')
        assert.equal(result.kind, 'INSUFFICIENT_FUNDS', `Expected INSUFFICIENT_FUNDS for: ${rawMsg}`)
        assert.equal(result.category, 'INSUFFICIENT_FUNDS')
        assert.ok(result.message.includes('TRON'), `Message must mention TRON, got: ${result.message}`)
        assert.match(result.message, /fondos insuficientes/i)
        assert.match(result.message, /comisión|activación|gas/i)
        assert.equal(result.message.includes('ContractValidateException'), false, 'Must not leak raw ContractValidateException')
        assert.equal(result.message.includes('org.tron'), false, 'Must not leak raw Java package name')
      }

      // User rejections (4001 / 5000) remain strictly isolated as USER_REJECTION
      assert.equal(mod.classifyPaymentError({ code: 4001, message: 'User rejected' }, 'TRON').kind, 'USER_REJECTION')
      assert.equal(mod.classifyPaymentError({ code: 5000, message: 'User rejected' }, 'TRON').kind, 'USER_REJECTION')
    })

    it('enforces mobile-first checkout modal CSS (dvh/svh max-height, internal scroll, sticky safe-area CTA, .checkout-error-banner wrapping, 520px bottom-sheet) and wrapping connected-wallet card', () => {
      const stylesSrc = readText('src/styles.css')
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')

      const overlayBlock = extractBlock(stylesSrc, '.wallet-checkout-overlay {')
      assert.match(overlayBlock, /overflow-y:\s*auto/)
      assert.match(overlayBlock, /overscroll-behavior:\s*contain/)
      assert.match(overlayBlock, /env\(safe-area-inset-top\)/)
      assert.match(overlayBlock, /env\(safe-area-inset-bottom\)/)
      assert.match(overlayBlock, /box-sizing:\s*border-box/)

      const modalBlock = extractBlock(stylesSrc, '.wallet-checkout-modal {')
      assert.match(modalBlock, /max-height:\s*92vh/)
      assert.match(modalBlock, /max-height:\s*calc\(100dvh\s*-\s*24px\)/)
      assert.match(modalBlock, /max-height:\s*calc\(100svh\s*-\s*24px\)/)
      assert.match(modalBlock, /overflow:\s*hidden/)
      assert.match(modalBlock, /box-sizing:\s*border-box/)

      const headerBlock = extractBlock(stylesSrc, '.checkout-modal-header {')
      assert.match(headerBlock, /flex-shrink:\s*0/)
      assert.match(headerBlock, /gap:\s*12px/)

      const scrollBodyMatch = stylesSrc.match(/\.checkout-form-content,\s*\.checkout-receipt-view,\s*\.checkout-auth-gate\s*\{[\s\S]*?\}/)
      assert.ok(scrollBodyMatch, 'Expected shared scrollable body rule for .checkout-form-content, .checkout-receipt-view, .checkout-auth-gate')
      assert.match(scrollBodyMatch[0], /overflow-y:\s*auto/)
      assert.match(scrollBodyMatch[0], /min-height:\s*0/)
      assert.match(scrollBodyMatch[0], /flex:\s*1\s+1\s+auto/)

      const ctaBoxBlock = extractBlock(stylesSrc, '.checkout-cta-box {')
      assert.match(ctaBoxBlock, /position:\s*sticky/)
      assert.match(ctaBoxBlock, /bottom:\s*0/)
      assert.match(ctaBoxBlock, /env\(safe-area-inset-bottom\)/)

      const errorBannerBlock = extractBlock(stylesSrc, '.checkout-error-banner {')
      assert.match(errorBannerBlock, /overflow-wrap:\s*anywhere/)
      assert.match(errorBannerBlock, /word-break:\s*break-word/)

      const mobileMediaBlock = extractBlock(stylesSrc, '@media (max-width: 520px) {')
      assert.match(mobileMediaBlock, /\.wallet-checkout-overlay[\s\S]*?align-items:\s*flex-end/)
      assert.match(mobileMediaBlock, /\.wallet-checkout-modal[\s\S]*?max-height:\s*92dvh/)
      assert.match(mobileMediaBlock, /\.wallet-checkout-modal[\s\S]*?border-radius:\s*20px\s+20px\s+0\s+0/)
      assert.match(mobileMediaBlock, /\.wallet-checkout-modal[\s\S]*?env\(safe-area-inset-bottom\)/)
      assert.match(mobileMediaBlock, /\.network-chip-btn[\s\S]*?\.currency-pill-btn[\s\S]*?min-width:\s*0/)
      assert.match(mobileMediaBlock, /\.quote-asset-pill[\s\S]*?overflow-wrap:\s*anywhere/)
      assert.match(mobileMediaBlock, /\.quote-line[\s\S]*?flex-wrap:\s*wrap/)

      // Green connected-wallet card wraps cleanly on 360px screens
      const switchBtnIdx = checkoutSrc.indexOf('data-testid="checkout-switch-wallet-btn"')
      assert.notEqual(switchBtnIdx, -1)
      const greenCardStart = checkoutSrc.lastIndexOf('rgba(34, 197, 94, 0.1)', switchBtnIdx)
      assert.notEqual(greenCardStart, -1)
      const greenCardTagStart = checkoutSrc.lastIndexOf('<div', greenCardStart)
      const greenCardSlice = checkoutSrc.slice(greenCardTagStart, switchBtnIdx)
      assert.match(greenCardSlice, /flexWrap:\s*'wrap'/, 'Connected wallet green card must set flexWrap: wrap')
      assert.match(greenCardSlice, /minWidth:\s*0/, 'Connected wallet left info block must set minWidth: 0')
    })
  })

  describe('Block 4: Smooth 0ms method selection, rapid-tap coalescing & tactile CSS contracts', () => {
    it('coalesces rapid queued selections in resolveNextQueuedMethodSelection without redundant RPCs', () => {
      type PendingMethodSelectionLike = { networkId: PaymentNetworkId; useUsdt: boolean }
      const api = coordinator as unknown as {
        resolveNextQueuedMethodSelection?: (input: {
          queued: PendingMethodSelectionLike | null
          completedNetworkId: PaymentNetworkId
          completedUseUsdt: boolean
        }) => PendingMethodSelectionLike | null
      }

      assert.equal(
        typeof api.resolveNextQueuedMethodSelection,
        'function',
        'checkoutIntentCoordinator must export resolveNextQueuedMethodSelection',
      )

      const resolve = api.resolveNextQueuedMethodSelection!

      // null queued -> null
      assert.equal(
        resolve({ queued: null, completedNetworkId: 'bnb', completedUseUsdt: true }),
        null,
      )

      // identical to just-completed selection -> null (0 redundant RPC)
      assert.equal(
        resolve({
          queued: { networkId: 'polygon', useUsdt: true },
          completedNetworkId: 'polygon',
          completedUseUsdt: true,
        }),
        null,
      )

      // different asset on same network -> dispatches queued selection
      assert.deepEqual(
        resolve({
          queued: { networkId: 'polygon', useUsdt: false },
          completedNetworkId: 'polygon',
          completedUseUsdt: true,
        }),
        { networkId: 'polygon', useUsdt: false },
      )

      // different network (including rapid back-and-forth BNB -> Polygon -> BNB) -> dispatches queued selection
      assert.deepEqual(
        resolve({
          queued: { networkId: 'bnb', useUsdt: true },
          completedNetworkId: 'polygon',
          completedUseUsdt: true,
        }),
        { networkId: 'bnb', useUsdt: true },
      )
    })

    it('wires 0ms pendingMethodSelection, queuedMethodSelectionRef coalescing, non-collapsing quote card, interactive chips/pills, and locked Pagar CTA in WalletPaymentCheckout.tsx', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')

      // Separate instant visual state & refs (with synchronous intentRef/hasBroadcastTxLockRef to avoid stale closures on chained drains)
      assert.match(
        checkoutSrc,
        /const \[pendingMethodSelection,\s*setPendingMethodSelection\]\s*=\s*useState<PendingMethodSelection \| null>\(null\)/,
      )
      assert.match(
        checkoutSrc,
        /const queuedMethodSelectionRef\s*=\s*useRef<PendingMethodSelection \| null>\(null\)/,
      )
      assert.match(checkoutSrc, /const intentRef\s*=\s*useRef<PaymentIntentRecord \| null>\(intent\)/)
      assert.match(checkoutSrc, /const hasBroadcastTxLockRef\s*=\s*useRef\(hasBroadcastTxLock\)/)
      assert.match(
        checkoutSrc,
        /const displayNetworkId(?::\s*PaymentNetworkId)?\s*=\s*pendingMethodSelection\?\.networkId\s*\?\?\s*effectiveNetworkId/,
      )
      assert.match(
        checkoutSrc,
        /const displayUseUsdt(?::\s*boolean)?\s*=\s*pendingMethodSelection\?\.useUsdt\s*\?\?\s*useUsdt/,
      )

      // handleSelectNetworkOrAsset coalescing, incompatible sequence invalidation, 0ms highlight & finally drain
      const selectBlock = extractBlock(checkoutSrc, 'const handleSelectNetworkOrAsset = async')
      assert.ok(selectBlock.includes('queuedMethodSelectionRef.current'), 'handleSelectNetworkOrAsset must coalesce via queuedMethodSelectionRef')
      assert.ok(selectBlock.includes('setPendingMethodSelection('), 'handleSelectNetworkOrAsset must apply 0ms pendingMethodSelection')
      assert.ok(selectBlock.includes('resolveNextQueuedMethodSelection('), 'handleSelectNetworkOrAsset finally must drain via resolveNextQueuedMethodSelection')
      assert.ok(selectBlock.includes('hasBroadcastTxLockRef.current'), 'handleSelectNetworkOrAsset must check synchronous hasBroadcastTxLockRef')
      assert.ok(selectBlock.includes('intentRef.current'), 'handleSelectNetworkOrAsset must read synchronous intentRef for chained rapid taps')

      // Preserve SCRUM-373 MEDIUM-02: setPendingMethodSelection before try {, setNetworkId(nextNet) strictly after await selectPaymentMethod inside try {
      const tryIdx = selectBlock.indexOf('try {')
      const awaitSelectIdx = selectBlock.indexOf('await selectPaymentMethod(')
      const inPlaceSetNetIdx = selectBlock.indexOf('setNetworkId(nextNet)', tryIdx)
      assert.ok(tryIdx > 0 && awaitSelectIdx > tryIdx && inPlaceSetNetIdx > awaitSelectIdx)

      // Step 1, createFreshIntent, and unmount clear queuedMethodSelectionRef
      const step1Section = checkoutSrc.slice(checkoutSrc.indexOf('// Step 1:'), checkoutSrc.indexOf('// Step 2:'))
      assert.ok(step1Section.includes('queuedMethodSelectionRef.current = null'))
      assert.ok(step1Section.includes('setPendingMethodSelection('))
      const freshBlock = extractBlock(checkoutSrc, 'const createFreshIntent = useCallback')
      assert.ok(freshBlock.includes('queuedMethodSelectionRef.current = null'))
      assert.ok(freshBlock.includes('setPendingMethodSelection(null)'))

      // 1. Red de pago chips: interactive during methodUpdating, uses displayNetworkId/displayUseUsdt and network-chip-pending
      const networkSectionStart = checkoutSrc.indexOf('1. Red de pago')
      const currencySectionStart = checkoutSrc.indexOf('2. Moneda de pago')
      assert.ok(networkSectionStart > 0 && currencySectionStart > networkSectionStart)
      const networkSection = checkoutSrc.slice(networkSectionStart, currencySectionStart)
      assert.ok(networkSection.includes('displayNetworkId === net.id'))
      assert.ok(networkSection.includes('network-chip-pending'))
      assert.ok(networkSection.includes('currentUseUsdt: displayUseUsdt'))
      const chipDisabledMatch = networkSection.match(/className=\{`network-chip-btn[^`]*`\}[\s\S]*?disabled=\{([^}]+)\}/)
      assert.ok(chipDisabledMatch, 'Expected .network-chip-btn disabled expression')
      assert.equal(/\bmethodUpdating\b/.test(chipDisabledMatch[1]), false, '.network-chip-btn must NOT be disabled during methodUpdating')
      assert.match(chipDisabledMatch[1], /\bhasBroadcastTxLock\b/, '.network-chip-btn must remain disabled under F-01 hasBroadcastTxLock')

      // 2. Moneda de pago pills: interactive during methodUpdating, keeps isWrongWalletFamily, uses displayNetworkId/displayUseUsdt and currency-pill-pending
      const quoteCardStart = checkoutSrc.indexOf('<div className="checkout-quote-card">')
      assert.ok(quoteCardStart > currencySectionStart)
      const currencySection = checkoutSrc.slice(currencySectionStart, quoteCardStart)
      assert.ok(currencySection.includes('displayUseUsdt'))
      assert.ok(currencySection.includes('currency-pill-pending'))
      assert.ok(currencySection.includes('handleSelectNetworkOrAsset(displayNetworkId, true)'))
      assert.ok(currencySection.includes('handleSelectNetworkOrAsset(displayNetworkId, false)'))
      const pillDisabledMatches = [...currencySection.matchAll(/className=\{`currency-pill-btn[^`]*`\}[\s\S]*?disabled=\{([^}]+)\}/g)]
      assert.equal(pillDisabledMatches.length, 2)
      for (const m of pillDisabledMatches) {
        assert.equal(/\bmethodUpdating\b/.test(m[1]), false, '.currency-pill-btn must NOT be disabled during methodUpdating')
        assert.match(m[1], /\bisWrongWalletFamily\b/, '.currency-pill-btn must keep isWrongWalletFamily guard')
        assert.match(m[1], /\bhasBroadcastTxLock\b/, '.currency-pill-btn must keep hasBroadcastTxLock guard')
      }

      // Quote card keeps AWAITING structure visible with checkout-quote-updating & Actualizando cotización...
      const ctaBoxStart = checkoutSrc.indexOf('<div className="checkout-cta-box">')
      assert.ok(ctaBoxStart > quoteCardStart)
      const quoteCardSrc = checkoutSrc.slice(quoteCardStart, ctaBoxStart)
      assert.ok(quoteCardSrc.includes('checkout-quote-updating'))
      assert.ok(quoteCardSrc.includes('checkout-inline-spinner'))
      assert.ok(quoteCardSrc.includes('Actualizando cotización...'))
      assert.ok(quoteCardSrc.includes('<QuoteDetailsSkeleton />'))

      // Main Pagar CTA remains disabled while methodUpdating || Boolean(pendingMethodSelection) and displays Actualizando cotización...
      const ctaBoxSrc = checkoutSrc.slice(ctaBoxStart)
      const onClickPayIdx = ctaBoxSrc.indexOf('onClick={handlePay}')
      assert.notEqual(onClickPayIdx, -1, 'Expected onClick={handlePay} in .checkout-cta-box')
      const payBtnStart = ctaBoxSrc.lastIndexOf('<button', onClickPayIdx)
      const payBtnEnd = ctaBoxSrc.indexOf('</button>', onClickPayIdx)
      assert.ok(payBtnStart >= 0 && payBtnEnd > payBtnStart)
      const payBtnSrc = ctaBoxSrc.slice(payBtnStart, payBtnEnd)
      const payDisabledMatch = payBtnSrc.match(/disabled=\{([^}]+)\}/)
      assert.ok(payDisabledMatch, 'Expected disabled={...} on main Pagar button')
      assert.match(payDisabledMatch[1], /\bmethodUpdating\b/, 'Pagar CTA must stay disabled while methodUpdating')
      assert.match(payDisabledMatch[1], /\bBoolean\(pendingMethodSelection\)/, 'Pagar CTA must stay disabled while pendingMethodSelection is active')
      assert.ok(payBtnSrc.includes('Actualizando cotización...'), 'Pagar CTA must display Actualizando cotización... while updating')
    })

    it('enforces tactile micro-interactions, disabled clarity, pending/updating styles, and prefers-reduced-motion in src/styles.css', () => {
      const stylesSrc = readText('src/styles.css')

      const chipBlock = extractBlock(stylesSrc, '.network-chip-btn {')
      assert.match(chipBlock, /touch-action:\s*manipulation/)
      assert.match(chipBlock, /-webkit-tap-highlight-color:\s*transparent/)
      assert.match(chipBlock, /transition:\s*transform 120ms ease,\s*background-color 160ms ease,\s*border-color 160ms ease,\s*opacity 160ms ease/)

      const pillBlock = extractBlock(stylesSrc, '.currency-pill-btn {')
      assert.match(pillBlock, /touch-action:\s*manipulation/)
      assert.match(pillBlock, /-webkit-tap-highlight-color:\s*transparent/)
      assert.match(pillBlock, /transition:\s*transform 120ms ease,\s*background-color 160ms ease,\s*border-color 160ms ease,\s*opacity 160ms ease/)

      const activePressMatch = stylesSrc.match(/\.network-chip-btn:active:not\(:disabled\),\s*\.currency-pill-btn:active:not\(:disabled\)\s*\{[\s\S]*?\}/)
      assert.ok(activePressMatch, 'Expected tactile :active:not(:disabled) press rule for network chips and currency pills')
      assert.match(activePressMatch[0], /transform:\s*scale\(0\.97\)/)

      const disabledRuleMatch = stylesSrc.match(/\.network-chip-btn:disabled,\s*\.currency-pill-btn:disabled\s*\{[\s\S]*?\}/)
      assert.ok(disabledRuleMatch, 'Expected clear :disabled rule for network chips and currency pills')
      assert.match(disabledRuleMatch[0], /opacity:\s*0\.48/)
      assert.match(disabledRuleMatch[0], /cursor:\s*not-allowed/)

      assert.ok(stylesSrc.includes('.network-chip-pending {'))
      assert.ok(stylesSrc.includes('.currency-pill-pending {'))
      assert.ok(stylesSrc.includes('.checkout-quote-updating {'))
      const spinnerBlock = extractBlock(stylesSrc, '.checkout-inline-spinner {')
      assert.match(spinnerBlock, /width:\s*14px/)
      assert.match(spinnerBlock, /height:\s*14px/)
      assert.ok(stylesSrc.includes('@keyframes checkout-spin'))

      // Checkout-scoped prefers-reduced-motion block disables transitions, press scale, and spinner animation
      const checkoutReducedMotionIdx = stylesSrc.indexOf('.checkout-inline-spinner {', stylesSrc.indexOf('@media (max-width: 520px) {'))
      assert.notEqual(checkoutReducedMotionIdx, -1, 'Expected @media (prefers-reduced-motion: reduce) handling .checkout-inline-spinner in checkout modal section')
      const reducedBlockStart = stylesSrc.lastIndexOf('@media (prefers-reduced-motion: reduce)', checkoutReducedMotionIdx)
      assert.notEqual(reducedBlockStart, -1)
      const reducedBlock = extractBlock(stylesSrc.slice(reducedBlockStart), '@media (prefers-reduced-motion: reduce)')
      assert.match(reducedBlock, /\.checkout-inline-spinner[\s\S]*?animation:\s*none/)
      assert.match(reducedBlock, /\.network-chip-btn[\s\S]*?transition:\s*none/)

      // Review Fix #3 (Light Theme): legible contrast overrides for checkout updating badge, spinner, and chips/pills
      assert.match(stylesSrc, /\[data-theme='light'\]\s+\.checkout-quote-updating-badge\s*\{[\s\S]*?color:\s*#5b21b6/)
      assert.match(stylesSrc, /\[data-theme='light'\]\s+\.checkout-inline-spinner\s*\{[\s\S]*?border-color:\s*rgba\(15,\s*23,\s*42/)
    })

    it('Review Fix #1/#2: keeps methodInFlightRef serialized across incompatible taps via methodVisualSupersededRef and prevents mid-flight wrong-family/wrong-chain UI desync', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')

      // Fix #1 (CRITICAL): incompatible tap must NEVER reset methodInFlightRef.current = false or bump methodSeqRef while RPC is in flight
      assert.match(checkoutSrc, /const methodVisualSupersededRef = useRef\(false\)/)
      const selectBlock = extractBlock(checkoutSrc, 'const handleSelectNetworkOrAsset = async')
      const incompatibleStart = selectBlock.indexOf('!isWalletFamilyCompatibleWithNetwork(')
      const incompatibleReturnIdx = selectBlock.indexOf('return', incompatibleStart)
      assert.ok(incompatibleStart > 0 && incompatibleReturnIdx > incompatibleStart)
      const incompatibleBranch = selectBlock.slice(incompatibleStart, incompatibleReturnIdx)
      assert.equal(
        incompatibleBranch.includes('methodInFlightRef.current = false'),
        false,
        'Incompatible tap must NOT clear methodInFlightRef while an RPC is still executing on backend',
      )
      assert.equal(
        incompatibleBranch.includes('methodSeqRef.current +='),
        false,
        'Incompatible tap must NOT discard backend intent truth by bumping methodSeqRef while an RPC is still executing',
      )
      assert.ok(
        incompatibleBranch.includes('methodVisualSupersededRef.current = true'),
        'Incompatible tap during in-flight RPC must mark methodVisualSupersededRef.current = true so UI stays on incompatible preview while intentRef still receives server truth',
      )
      assert.ok(
        selectBlock.includes('handleSelectRef.current(nextQueued.networkId, nextQueued.useUsdt)'),
        'finally queue drain must invoke handleSelectRef.current to avoid stale boolean closure guards',
      )

      // Fix #2 (IMPORTANT): mid-flight transition from incompatible family or wrong EVM chain clears stale mismatch UI immediately
      assert.match(
        checkoutSrc,
        /const isWrongEvmChain\s*=\s*!isSolana[\s\S]*?!isTron\s*&&\s*!methodUpdating\s*&&\s*!pendingMethodSelection/,
        'isWrongEvmChain must suppress stale switch-chain CTA while methodUpdating or pendingMethodSelection is active',
      )
      const currencySectionStart = checkoutSrc.indexOf('2. Moneda de pago')
      const quoteCardStart = checkoutSrc.indexOf('<div className="checkout-quote-card">')
      const ctaBoxStart = checkoutSrc.indexOf('<div className="checkout-cta-box">')
      const currencySection = checkoutSrc.slice(currencySectionStart, quoteCardStart)
      const quoteCardSrc = checkoutSrc.slice(quoteCardStart, ctaBoxStart)
      const ctaBoxSrc = checkoutSrc.slice(ctaBoxStart)
      assert.match(
        currencySection,
        /isWrongWalletFamily\s*&&\s*!pendingMethodSelection/,
        '.currency-pill-btn must become interactive immediately when transitioning to a compatible pendingMethodSelection',
      )
      assert.match(
        quoteCardSrc,
        /isWrongWalletFamily\s*&&\s*!hasBroadcastTxLock\s*&&\s*!methodUpdating\s*&&\s*!pendingMethodSelection/,
        'Quote card must hide stale wrong-family warning while switching to a compatible network',
      )
      assert.match(
        ctaBoxSrc,
        /isWrongWalletFamily\s*&&\s*!methodUpdating\s*&&\s*!pendingMethodSelection/,
        'CTA box must show disabled Actualizando cotización... instead of stale Cambiar a billetera while switching to a compatible network',
      )
    })
  })

  describe('Block 5: SPOT_PRICE_UNAVAILABLE classification, RPC congestion guidance, Ethereum Mainnet gas notice & WCAG 2.1 AA checkout contracts', () => {
    async function loadClassifyPaymentError() {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const match = checkoutSrc.match(/export function sanitizeErrorReason[\s\S]*?(?=export function WalletPaymentCheckout)/)
      assert.ok(match, 'Expected sanitizeErrorReason..classifyPaymentError block in src/WalletPaymentCheckout.tsx')
      const transpiled = ts.transpileModule(match[0], {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      return (await import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString('base64')}`)) as {
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

    it('classifies SPOT_PRICE_UNAVAILABLE (reasonCode and spot price text) distinctly before RPC_ERROR with congestion & USDT guidance', async () => {
      const { classifyPaymentError } = await loadClassifyPaymentError()

      const callableErr = {
        code: 'functions/unavailable',
        message: 'Payment verification service temporarily unavailable',
        details: { reasonCode: 'SPOT_PRICE_UNAVAILABLE' },
      }
      const res = classifyPaymentError(callableErr, 'Ethereum')
      assert.equal(res.kind, 'SPOT_PRICE_UNAVAILABLE')
      assert.equal(res.category, 'SPOT_PRICE_UNAVAILABLE')
      assert.equal(res.code, 'SPOT_PRICE_UNAVAILABLE')
      assert.equal(
        res.message,
        'El servicio de cotización está temporalmente congestionado para Ethereum. Intenta de nuevo en unos segundos o paga en USDT (precio fijo en USD).',
      )
      assert.doesNotMatch(res.message, /proveedor RPC/i, 'SPOT_PRICE_UNAVAILABLE must not blame RPC provider')

      // Spot price message mentioning "provider" and "503" must still classify as SPOT_PRICE_UNAVAILABLE, not RPC_ERROR
      const providerMsgRes = classifyPaymentError(
        { code: 503, message: 'Spot price provider returned HTTP 503 for ETH' },
        'Ethereum',
      )
      assert.equal(providerMsgRes.kind, 'SPOT_PRICE_UNAVAILABLE')
      assert.equal(providerMsgRes.category, 'SPOT_PRICE_UNAVAILABLE')
      assert.equal(providerMsgRes.code, 503)
      assert.match(providerMsgRes.message, /congestionado/i)
      assert.match(providerMsgRes.message, /USDT/)

      // Spanish "cotización spot" text fallback
      const spanishSpotRes = classifyPaymentError(new Error('Fallo al consultar cotización spot para SOL'), 'Solana')
      assert.equal(spanishSpotRes.kind, 'SPOT_PRICE_UNAVAILABLE')
      assert.match(spanishSpotRes.message, /Solana/)
      assert.match(spanishSpotRes.message, /USDT/)
    })

    it('preserves SCRUM-246 RPC_ERROR prefix and adds congestion guidance', async () => {
      const { classifyPaymentError } = await loadClassifyPaymentError()

      const rpcErr = new Error('HTTP 503 Service Unavailable from RPC gateway')
      const res = classifyPaymentError(rpcErr, 'Ethereum')
      assert.equal(res.kind, 'RPC_ERROR')
      assert.equal(res.category, 'RPC_ERROR')
      assert.match(res.message, /^Error de comunicación con el proveedor RPC en la red Ethereum/)
      assert.match(res.message, /La red puede estar congestionada; intenta de nuevo en unos momentos\.$/)
    })

    it('enforces Ethereum Mainnet gas notice, WCAG 2.1 AA checkout markup, 8 useEffect invariant, and :focus-visible / gas-notice CSS contracts', () => {
      const checkoutSrc = readText('src/WalletPaymentCheckout.tsx')
      const stylesSrc = readText('src/styles.css')

      // Ethereum Mainnet non-blocking gas notice with exact gating and copy
      assert.match(
        checkoutSrc,
        /displayNetworkId === 'ethereum'\s*&&\s*\(!intent\?\.networkMode \|\| intent\.networkMode === 'mainnet'\)\s*&&\s*!isWrongWalletFamily\s*&&\s*!hasBroadcastTxLock/,
        'Ethereum gas notice must be gated to ethereum mainnet (or unset networkMode) without wrong-wallet-family or F-01 lock',
      )
      assert.ok(checkoutSrc.includes('data-testid="checkout-eth-gas-notice"'))
      assert.match(
        checkoutSrc,
        /data-testid="checkout-eth-gas-notice"[^>]*role="note"[^>]*className="checkout-gas-notice"/,
        'Ethereum gas notice must declare role="note" and className="checkout-gas-notice"',
      )
      assert.ok(
        checkoutSrc.includes(
          'Aviso de red: Ethereum Mainnet suele tener comisiones de gas más altas o congestión. Para comisiones mínimas, puedes elegir BNB Chain, Polygon, Arbitrum, Optimism, Solana o TRON en USDT.',
        ),
        'Ethereum gas notice must include the exact approved copy',
      )

      // WCAG 2.1 AA group labels (0 orphan <label className="checkout-label">)
      assert.equal(
        checkoutSrc.includes('<label className="checkout-label">'),
        false,
        'Orphan <label className="checkout-label"> without htmlFor must be replaced by span + role="group"',
      )
      assert.ok(checkoutSrc.includes('<span id="checkout-network-label" className="checkout-label">1. Red de pago</span>'))
      assert.ok(checkoutSrc.includes('<div className="checkout-network-grid" role="group" aria-labelledby="checkout-network-label">'))
      assert.ok(checkoutSrc.includes('<span id="checkout-currency-label" className="checkout-label">2. Moneda de pago</span>'))
      assert.ok(checkoutSrc.includes('<div className="currency-selector-row" role="group" aria-labelledby="checkout-currency-label">'))

      // aria-pressed on network chips and currency pills
      assert.ok(checkoutSrc.includes('aria-pressed={displayNetworkId === net.id}'))
      assert.ok(checkoutSrc.includes('aria-pressed={displayUseUsdt}'))
      assert.ok(checkoutSrc.includes('aria-pressed={!displayUseUsdt}'))

      // Keyboard-accessible treasury address copy button
      assert.equal(
        checkoutSrc.includes('<code className="quote-address"'),
        false,
        'quote-address must be converted from <code onClick> to <button type="button">',
      )
      assert.match(
        checkoutSrc,
        /<button[\s\S]*?type="button"[\s\S]*?className="quote-address"[\s\S]*?aria-label="Copiar dirección de tesorería autoritativa"/,
        'Treasury address copy control must be a <button type="button" className="quote-address"> with accessible aria-label',
      )

      // Live regions for copyStatus and every .checkout-error-banner
      assert.match(
        checkoutSrc,
        /\{copyStatus && <p className="copy-notice-text" role="status" aria-live="polite">\{copyStatus\}<\/p>\}/,
        'copyStatus notice must declare role="status" aria-live="polite"',
      )
      const errorBannerTags = checkoutSrc.match(/<div className="checkout-error-banner"[^>]*>/g) ?? []
      assert.ok(errorBannerTags.length >= 2, 'Expected both terminal and form .checkout-error-banner elements')
      for (const tag of errorBannerTags) {
        assert.ok(tag.includes('role="alert"'), `Error banner missing role="alert": ${tag}`)
        assert.ok(tag.includes('aria-live="assertive"'), `Error banner missing aria-live="assertive": ${tag}`)
      }

      // Preserve exact useEffect count (8 -> 8)
      const useEffectCalls = checkoutSrc.match(/\buseEffect\s*\(/g) ?? []
      assert.equal(useEffectCalls.length, 8, `Expected exactly 8 useEffect calls, found ${useEffectCalls.length}`)

      // CSS contracts: .checkout-gas-notice (dark + light), button.quote-address monospace reset, and :focus-visible
      const gasNoticeBlock = extractBlock(stylesSrc, '.checkout-gas-notice {')
      assert.match(gasNoticeBlock, /font-size:\s*12px/)
      assert.match(gasNoticeBlock, /line-height:\s*1\.45/)
      assert.ok(stylesSrc.includes("[data-theme='light'] .checkout-gas-notice {"))

      const quoteAddrBlock = extractBlock(stylesSrc, '.quote-address {')
      assert.match(quoteAddrBlock, /border:\s*none/)
      assert.match(quoteAddrBlock, /font-family:\s*monospace/)
      assert.match(quoteAddrBlock, /font-size:\s*inherit/)

      const focusVisibleMatch = stylesSrc.match(
        /\.network-chip-btn:focus-visible,[\s\S]*?\.currency-pill-btn:focus-visible,[\s\S]*?\.quote-address:focus-visible,[\s\S]*?\.checkout-close-btn:focus-visible,[\s\S]*?\.checkout-action-btn:focus-visible\s*\{[\s\S]*?\}/,
      )
      assert.ok(focusVisibleMatch, 'Expected :focus-visible rule covering all 5 interactive checkout controls')
      assert.match(focusVisibleMatch[0], /outline:\s*2px solid #a78bfa/)
      assert.match(focusVisibleMatch[0], /outline-offset:\s*2px/)
    })
  })
})
