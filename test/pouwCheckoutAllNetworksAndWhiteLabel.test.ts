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
        /intent\.status === 'OPEN'[\s\S]*?!hasManualNetworkSelectionRef\.current/,
        'Step 2 must auto-align OPEN intent when user opened disconnected and connects Solana/TRON without manual network pick',
      )
      assert.match(
        step2Src,
        /\[[^\]]*isWrongWalletFamily[^\]]*effectiveNetworkId[^\]]*\]/,
        'Step 2 deps must include isWrongWalletFamily and effectiveNetworkId so OPEN auto-alignment immediately triggers selectPaymentMethod',
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
})
