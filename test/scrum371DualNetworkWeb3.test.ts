import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { bsc, bscTestnet, mainnet, polygon, polygonAmoy, sepolia, solana, solanaDevnet } from '@reown/appkit/networks'
import * as paymentDestinations from '../src/paymentDestinations.ts'
import * as solanaPayment from '../src/solanaPayment.ts'
import { SystemProgram } from '@solana/web3.js'
import type { PaymentQuote } from '../src/paymentQuote.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

const LEGACY_EVM_TREASURY = '0x37180AB735f6485694668044df322530eC933287'
const LEGACY_SOLANA_TREASURY = 'bZJ38AysbUzwB2MCkaJrsvgpooEE5bjVjzJc5heXogk'
const VALID_EVM_TREASURY = '0x1111111111111111111111111111111111111111'
const VALID_SOLANA_TREASURY = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'

const APPKIT_PAYMENT_FILES = [
  'src/paymentDestinations.ts',
  'src/appkitConfig.ts',
  'src/solanaPayment.ts',
] as const

describe('SCRUM-371 (PG-04B): Dual Network Web3 Client Layer (Reown AppKit Only)', () => {
  describe('Suite 1: Dual Mode (testnet|mainnet), Ethereum Flag, Catalog Parity & Explorer URLs', () => {
    it('defaults VITE_PAYMENT_NETWORK_MODE to testnet when unset or blank and normalizes case', () => {
      assert.equal(paymentDestinations.resolvePaymentNetworkMode({}), 'testnet')
      assert.equal(paymentDestinations.resolvePaymentNetworkMode({ VITE_PAYMENT_NETWORK_MODE: '' }), 'testnet')
      assert.equal(paymentDestinations.resolvePaymentNetworkMode({ VITE_PAYMENT_NETWORK_MODE: '   ' }), 'testnet')
      assert.equal(paymentDestinations.resolvePaymentNetworkMode({ VITE_PAYMENT_NETWORK_MODE: 'TESTNET' }), 'testnet')
      assert.equal(paymentDestinations.resolvePaymentNetworkMode({ VITE_PAYMENT_NETWORK_MODE: ' MainNet ' }), 'mainnet')
    })

    it('fails closed with INVALID_PAYMENT_NETWORK_MODE on unsupported network modes', () => {
      for (const invalid of ['staging', 'dev', 'prod', 'local']) {
        assert.throws(
          () => paymentDestinations.resolvePaymentNetworkMode({ VITE_PAYMENT_NETWORK_MODE: invalid }),
          /INVALID_PAYMENT_NETWORK_MODE/,
          `Expected INVALID_PAYMENT_NETWORK_MODE for "${invalid}"`,
        )
      }
    })

    it('enforces VITE_PAYMENT_ENABLE_ETHEREUM false by default and case-insensitive true opt-in', () => {
      assert.equal(paymentDestinations.isEthereumPaymentEnabled({}), false)
      assert.equal(paymentDestinations.isEthereumPaymentEnabled({ VITE_PAYMENT_ENABLE_ETHEREUM: 'false' }), false)
      assert.equal(paymentDestinations.isEthereumPaymentEnabled({ VITE_PAYMENT_ENABLE_ETHEREUM: '1' }), false)
      assert.equal(paymentDestinations.isEthereumPaymentEnabled({ VITE_PAYMENT_ENABLE_ETHEREUM: 'true' }), true)
      assert.equal(paymentDestinations.isEthereumPaymentEnabled({ VITE_PAYMENT_ENABLE_ETHEREUM: ' TRUE ' }), true)
    })

    it('maps client bnb <-> backend bsc canonically and matches paymentConfig.js 1:1', () => {
      assert.equal(paymentDestinations.toBackendPaymentNetworkId('bnb'), 'bsc')
      assert.equal(paymentDestinations.toBackendPaymentNetworkId('bsc'), 'bsc')
      assert.equal(paymentDestinations.toBackendPaymentNetworkId('polygon'), 'polygon')
      assert.equal(paymentDestinations.toBackendPaymentNetworkId('ethereum'), 'ethereum')
      assert.equal(paymentDestinations.toBackendPaymentNetworkId('solana'), 'solana')

      assert.equal(paymentDestinations.toClientPaymentNetworkId('bsc'), 'bnb')
      assert.equal(paymentDestinations.toClientPaymentNetworkId('bnb'), 'bnb')
      assert.equal(paymentDestinations.toClientPaymentNetworkId('polygon'), 'polygon')
      assert.equal(paymentDestinations.toClientPaymentNetworkId('ethereum'), 'ethereum')
      assert.equal(paymentDestinations.toClientPaymentNetworkId('solana'), 'solana')

      const testnetEnv = {
        VITE_PAYMENT_NETWORK_MODE: 'testnet',
        VITE_PAYMENT_TESTNET_USDT_BSC_CONTRACT: '0x2222222222222222222222222222222222222222',
        VITE_PAYMENT_TESTNET_USDT_POLYGON_CONTRACT: '0x3333333333333333333333333333333333333333',
        VITE_PAYMENT_TESTNET_USDT_ETHEREUM_CONTRACT: '0x4444444444444444444444444444444444444444',
        VITE_PAYMENT_TESTNET_USDT_SOLANA_MINT: VALID_SOLANA_TREASURY,
      }

      const bscTest = paymentDestinations.getPaymentNetworkConfig('bsc', 'testnet', testnetEnv)
      const bnbTest = paymentDestinations.getPaymentNetworkConfig('bnb', 'testnet', testnetEnv)
      assert.deepEqual(bnbTest, bscTest)
      assert.equal(bscTest.chainId, 97)
      assert.equal(bscTest.chainIdHex, '0x61')
      assert.equal(bscTest.recommended, true)
      assert.equal(bscTest.requiredConfirmations, 15)
      assert.equal(bscTest.usdtDecimals, 18)
      assert.equal(bscTest.nativeDecimals, 18)
      assert.equal(bscTest.nativeSymbol, 'BNB')
      assert.equal(bscTest.explorerBaseUrl, 'https://testnet.bscscan.com')
      assert.equal(bscTest.usdtContractAddress, '0x2222222222222222222222222222222222222222')
      assert.equal(bscTest.receiverAddress, '')

      const polyTest = paymentDestinations.getPaymentNetworkConfig('polygon', 'testnet', testnetEnv)
      assert.equal(polyTest.chainId, 80002)
      assert.equal(polyTest.chainIdHex, '0x13882')
      assert.equal(polyTest.recommended, true)
      assert.equal(polyTest.requiredConfirmations, 64)
      assert.equal(polyTest.usdtDecimals, 6)
      assert.equal(polyTest.nativeDecimals, 18)
      assert.equal(polyTest.nativeSymbol, 'POL')
      assert.equal(polyTest.explorerBaseUrl, 'https://amoy.polygonscan.com')

      const ethTestDisabled = paymentDestinations.getPaymentNetworkConfig('ethereum', 'testnet', testnetEnv)
      assert.equal(ethTestDisabled.chainId, 11155111)
      assert.equal(ethTestDisabled.chainIdHex, '0xaa36a7')
      assert.equal(ethTestDisabled.recommended, false)
      assert.equal(ethTestDisabled.requiredConfirmations, 12)
      assert.equal(ethTestDisabled.usdtDecimals, 6)
      assert.equal(ethTestDisabled.nativeDecimals, 18)
      assert.equal(ethTestDisabled.nativeSymbol, 'ETH')
      assert.equal(ethTestDisabled.enabled, false)
      assert.equal(ethTestDisabled.explorerBaseUrl, 'https://sepolia.etherscan.io')

      const ethTestEnabled = paymentDestinations.getPaymentNetworkConfig('ethereum', 'testnet', {
        ...testnetEnv,
        VITE_PAYMENT_ENABLE_ETHEREUM: 'true',
      })
      assert.equal(ethTestEnabled.enabled, true)

      const solTest = paymentDestinations.getPaymentNetworkConfig('solana', 'testnet', testnetEnv)
      assert.equal(solTest.chainId, 'solana-devnet')
      assert.equal(solTest.solanaCluster, 'devnet')
      assert.equal(solTest.commitment, 'finalized')
      assert.equal(solTest.recommended, true)
      assert.equal(solTest.requiredConfirmations, 1)
      assert.equal(solTest.usdtDecimals, 6)
      assert.equal(solTest.nativeDecimals, 9)
      assert.equal(solTest.nativeSymbol, 'SOL')
      assert.equal(solTest.usdtContractAddress, VALID_SOLANA_TREASURY)

      // Unconfigured testnet USDT contracts return empty string (never mainnet contract)
      assert.equal(paymentDestinations.getPaymentNetworkConfig('bsc', 'testnet', {}).usdtContractAddress, '')
      assert.equal(paymentDestinations.getPaymentNetworkConfig('polygon', 'testnet', {}).usdtContractAddress, '')
      assert.equal(paymentDestinations.getPaymentNetworkConfig('ethereum', 'testnet', {}).usdtContractAddress, '')
      assert.equal(paymentDestinations.getPaymentNetworkConfig('solana', 'testnet', {}).usdtContractAddress, '')

      // Mainnet exact contracts & chainIds
      const bscMain = paymentDestinations.getPaymentNetworkConfig('bsc', 'mainnet', {})
      assert.equal(bscMain.chainId, 56)
      assert.equal(bscMain.chainIdHex, '0x38')
      assert.equal(bscMain.usdtContractAddress, '0x55d398326f99059fF775485246999027B3197955')

      const polyMain = paymentDestinations.getPaymentNetworkConfig('polygon', 'mainnet', {})
      assert.equal(polyMain.chainId, 137)
      assert.equal(polyMain.chainIdHex, '0x89')
      assert.equal(polyMain.usdtContractAddress, '0xc2132D05D31c914a87C6611C10748AEb04B58e8F')

      const ethMain = paymentDestinations.getPaymentNetworkConfig('ethereum', 'mainnet', {})
      assert.equal(ethMain.chainId, 1)
      assert.equal(ethMain.chainIdHex, '0x1')
      assert.equal(ethMain.usdtContractAddress, '0xdAC17F958D2ee523a2206206994597C13D831ec7')

      const solMain = paymentDestinations.getPaymentNetworkConfig('solana', 'mainnet', {})
      assert.equal(solMain.chainId, 'solana-mainnet')
      assert.equal(solMain.solanaCluster, 'mainnet-beta')
      assert.equal(solMain.usdtContractAddress, 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')
    })

    it('resolves Solana cluster per mode dynamically', () => {
      assert.equal(paymentDestinations.getSolanaClusterForMode('testnet'), 'devnet')
      assert.equal(paymentDestinations.getSolanaClusterForMode('mainnet'), 'mainnet-beta')
      assert.equal(paymentDestinations.getSolanaClusterForMode(undefined, {}), 'devnet')
      assert.equal(paymentDestinations.getSolanaClusterForMode(undefined, { VITE_PAYMENT_NETWORK_MODE: 'mainnet' }), 'mainnet-beta')
    })

    it('builds exact testnet and mainnet explorer tx URLs (including ?cluster=devnet on Solscan)', () => {
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('bsc', '0xabc123', 'testnet'),
        'https://testnet.bscscan.com/tx/0xabc123',
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('bnb', '0xabc123', 'mainnet'),
        'https://bscscan.com/tx/0xabc123',
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('polygon', '0xabc123', 'testnet'),
        'https://amoy.polygonscan.com/tx/0xabc123',
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('polygon', '0xabc123', 'mainnet'),
        'https://polygonscan.com/tx/0xabc123',
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('ethereum', '0xabc123', 'testnet'),
        'https://sepolia.etherscan.io/tx/0xabc123',
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('ethereum', '0xabc123', 'mainnet'),
        'https://etherscan.io/tx/0xabc123',
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('solana', '5sigTestHash', 'testnet'),
        'https://solscan.io/tx/5sigTestHash?cluster=devnet',
      )
      assert.equal(
        paymentDestinations.buildExplorerTxUrl('solana', '5sigMainHash', 'mainnet'),
        'https://solscan.io/tx/5sigMainHash',
      )
      assert.throws(() => paymentDestinations.buildExplorerTxUrl('bsc', '   ', 'testnet'), /INVALID_TX_HASH/)
    })
  })

  describe('Suite 2: Zero Hardcoded Treasuries & Fail-Closed Treasury Guard', () => {
    it('contains zero occurrences of legacy hardcoded treasury addresses across the AppKit payment layer', () => {
      for (const relPath of APPKIT_PAYMENT_FILES) {
        const source = fs.readFileSync(path.join(projectRoot, relPath), 'utf8')
        assert.equal(
          source.includes(LEGACY_EVM_TREASURY),
          false,
          `${relPath} must not contain legacy EVM treasury address`,
        )
        assert.equal(
          source.includes(LEGACY_SOLANA_TREASURY),
          false,
          `${relPath} must not contain legacy Solana treasury address`,
        )
      }
      for (const dest of paymentDestinations.PAYMENT_DESTINATIONS) {
        assert.equal(dest.address, '', `PAYMENT_DESTINATIONS[${dest.id}].address must default to empty string`)
        assert.equal(dest.receiverAddress, '', `PAYMENT_DESTINATIONS[${dest.id}].receiverAddress must default to empty string`)
      }
      assert.equal(paymentDestinations.getReceiverAddress('bnb'), '')
      assert.equal(paymentDestinations.getReceiverAddress('solana'), '')
    })

    it('rejects empty, zero EVM, and Solana System Program addresses in requireTreasuryAddress', () => {
      assert.throws(() => paymentDestinations.requireTreasuryAddress('', 'evm'), /TREASURY_ADDRESS_REQUIRED/)
      assert.throws(() => paymentDestinations.requireTreasuryAddress('   ', 'solana'), /TREASURY_ADDRESS_REQUIRED/)
      assert.throws(() => paymentDestinations.requireTreasuryAddress(null, 'evm'), /TREASURY_ADDRESS_REQUIRED/)
      assert.throws(() => paymentDestinations.requireTreasuryAddress(undefined, 'solana'), /TREASURY_ADDRESS_REQUIRED/)
      assert.throws(() => paymentDestinations.requireTreasuryAddress('0x0000000000000000000000000000000000000000', 'evm'), /INVALID_TREASURY_ADDRESS/)
      assert.throws(() => paymentDestinations.requireTreasuryAddress('11111111111111111111111111111111', 'solana'), /INVALID_TREASURY_ADDRESS/)
      assert.throws(() => paymentDestinations.requireTreasuryAddress('111111111111111111111111111111111111', 'solana'), /INVALID_TREASURY_ADDRESS/)
      assert.throws(() => paymentDestinations.requireTreasuryAddress('not-an-address', 'evm'), /INVALID_TREASURY_ADDRESS/)
      assert.throws(() => paymentDestinations.requireTreasuryAddress('0x1234', 'solana'), /INVALID_TREASURY_ADDRESS/)

      assert.equal(
        paymentDestinations.requireTreasuryAddress(`  ${VALID_EVM_TREASURY}  `, 'evm'),
        VALID_EVM_TREASURY,
      )
      assert.equal(
        paymentDestinations.requireTreasuryAddress(`  ${VALID_SOLANA_TREASURY}  `, 'solana'),
        VALID_SOLANA_TREASURY,
      )
    })
  })

  describe('Suite 3: Exact BigInt Arithmetic (Zero Float Math.round)', () => {
    it('parses decimal amounts to exact BigInt atomic units across 18, 6, and 9 decimals without float drift', () => {
      assert.equal(paymentDestinations.parseDecimalToAtomicBigInt('100.00', 18), 100000000000000000000n)
      assert.equal(paymentDestinations.parseDecimalToAtomicBigInt('100.00', 6), 100000000n)
      assert.equal(paymentDestinations.parseDecimalToAtomicBigInt('100.00', 9), 100000000000n)
      assert.equal(paymentDestinations.parseDecimalToAtomicBigInt('0.199999', 6), 199999n)
      assert.equal(paymentDestinations.parseDecimalToAtomicBigInt('19.99', 6), 19990000n)
      assert.equal(paymentDestinations.parseDecimalToAtomicBigInt('0.000000001', 9), 1n)
      assert.equal(paymentDestinations.parseDecimalToAtomicBigInt('123456789.123456789012345678', 18), 123456789123456789012345678n)
    })

    it('rejects excess precision, negative values, empty strings, scientific notation, and invalid decimals', () => {
      assert.throws(() => paymentDestinations.parseDecimalToAtomicBigInt('0.1234567', 6), /EXCESS_DECIMAL_PRECISION/)
      assert.throws(() => paymentDestinations.parseDecimalToAtomicBigInt('-1.00', 6), /INVALID_AMOUNT/)
      assert.throws(() => paymentDestinations.parseDecimalToAtomicBigInt('', 6), /INVALID_AMOUNT/)
      assert.throws(() => paymentDestinations.parseDecimalToAtomicBigInt('1e6', 6), /INVALID_AMOUNT/)
      assert.throws(() => paymentDestinations.parseDecimalToAtomicBigInt('10.5', -1), /INVALID_ASSET_DECIMALS/)
      assert.throws(() => paymentDestinations.parseDecimalToAtomicBigInt('10.5', 19), /INVALID_ASSET_DECIMALS/)
    })

    it('parses strictly positive expectedAmountAtomic strings and bigints', () => {
      assert.equal(paymentDestinations.parsePositiveAtomicBigInt('199999'), 199999n)
      assert.equal(paymentDestinations.parsePositiveAtomicBigInt(100000000000000000000n), 100000000000000000000n)
      assert.throws(() => paymentDestinations.parsePositiveAtomicBigInt('0'), /INVALID_AMOUNT/)
      assert.throws(() => paymentDestinations.parsePositiveAtomicBigInt(0n), /INVALID_AMOUNT/)
      assert.throws(() => paymentDestinations.parsePositiveAtomicBigInt('-5'), /INVALID_AMOUNT/)
      assert.throws(() => paymentDestinations.parsePositiveAtomicBigInt('1.5'), /INVALID_AMOUNT/)
    })
  })

  describe('Suite 4: Reown AppKit Dynamic Dual-Network Configuration & Isolation', () => {
    it('resolves AppKit testnet and mainnet networks dynamically, respects VITE_PAYMENT_ENABLE_ETHEREUM, preserves PouwMiner.com metadata, and stays decoupled from legacy direct connectors', async () => {
      const appKitSource = fs.readFileSync(path.join(projectRoot, 'src/appkitConfig.ts'), 'utf8')
      assert.match(appKitSource, /name:\s*'PouwMiner\.com'/)
      assert.match(appKitSource, /description:\s*'PouwMiner\.com wallet connection'/)
      assert.match(appKitSource, /bscTestnet/)
      assert.match(appKitSource, /polygonAmoy/)
      assert.match(appKitSource, /sepolia/)
      assert.match(appKitSource, /solanaDevnet/)
      assert.match(appKitSource, /resolvePaymentNetworkMode/)
      assert.match(appKitSource, /isEthereumPaymentEnabled/)
      assert.match(appKitSource, /adapters:\s*\[wagmiAdapter,\s*solanaAdapter\]/)
      assert.doesNotMatch(appKitSource, /mainnet-beta/)
      assert.doesNotMatch(appKitSource, /solflareMobile|phantomMobile|metamaskConnect|coinbaseWallet|walletSession/)

      const fnBlockMatch = appKitSource.match(/export function getAppKitEvmNetworksForMode[\s\S]*?(?=export const paymentNetworkMode)/)
      assert.ok(fnBlockMatch, 'src/appkitConfig.ts must export pure network mode resolver functions')

      const wrappedSource = `
        export function createResolvers({ bsc, bscTestnet, mainnet, polygon, polygonAmoy, sepolia, solana, solanaDevnet, resolvePaymentNetworkMode, isEthereumPaymentEnabled }) {
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
        solana,
        solanaDevnet,
        resolvePaymentNetworkMode: paymentDestinations.resolvePaymentNetworkMode,
        isEthereumPaymentEnabled: paymentDestinations.isEthereumPaymentEnabled,
      })

      assert.deepEqual(
        resolvers.getAppKitNetworksForMode('testnet', {}).map((n: { id: unknown }) => n.id),
        [bscTestnet.id, polygonAmoy.id, solanaDevnet.id],
      )
      assert.deepEqual(
        resolvers.getAppKitNetworksForMode('testnet', { VITE_PAYMENT_ENABLE_ETHEREUM: 'true' }).map((n: { id: unknown }) => n.id),
        [bscTestnet.id, polygonAmoy.id, sepolia.id, solanaDevnet.id],
      )
      assert.deepEqual(
        resolvers.getAppKitEvmNetworksForMode('testnet', {}).map((n: { id: unknown }) => n.id),
        [bscTestnet.id, polygonAmoy.id],
      )
      assert.equal(resolvers.getDefaultAppKitNetworkForMode('testnet').id, bscTestnet.id)

      assert.deepEqual(
        resolvers.getAppKitNetworksForMode('mainnet', {}).map((n: { id: unknown }) => n.id),
        [bsc.id, polygon.id, solana.id],
      )
      assert.deepEqual(
        resolvers.getAppKitNetworksForMode('mainnet', { VITE_PAYMENT_ENABLE_ETHEREUM: 'true' }).map((n: { id: unknown }) => n.id),
        [bsc.id, polygon.id, mainnet.id, solana.id],
      )
      assert.equal(resolvers.getDefaultAppKitNetworkForMode('mainnet').id, bsc.id)
    })
  })

  describe('Suite 5: Solana Payment Builder for Reown AppKit (BigInt, finalized, Dual RPC)', () => {
    const VALID_SOLANA_SENDER = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin'
    const VALID_TESTNET_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    const MOCK_BLOCKHASH = '11111111111111111111111111111111'

    function makeSolanaQuote(overrides: Partial<PaymentQuote> = {}): PaymentQuote {
      return {
        networkId: 'solana',
        networkName: 'Solana Devnet',
        asset: 'SOL',
        recipient: VALID_SOLANA_TREASURY,
        catalogValue: 100,
        catalogCurrency: 'USD',
        catalogUsd: 100,
        fxDate: null,
        assetUsd: 100,
        amount: '1.0',
        decimals: 9,
        estimatedBridgeFeeUsd: 1.5,
        bridgeFeeRate: 0.015,
        expectedNetUsd: 100,
        quoteSource: 'Test',
        updatedAt: Date.now(),
        expiresAt: Date.now() + 30_000,
        ...overrides,
      }
    }

    function readU64LE(bytes: Uint8Array, offset: number): bigint {
      let value = 0n
      for (let i = 0; i < 8; i += 1) {
        value |= BigInt(bytes[offset + i]) << BigInt(i * 8)
      }
      return value
    }

    it('removes Math.round(Number( and enforces finalized commitment + dual RPC endpoints in solanaPayment.ts', () => {
      const solanaSource = fs.readFileSync(path.join(projectRoot, 'src/solanaPayment.ts'), 'utf8')
      assert.equal(solanaSource.includes('Math.round(Number('), false, 'solanaPayment.ts must not use Math.round(Number(')
      assert.match(solanaSource, /finalized/)
      assert.doesNotMatch(solanaSource, /'confirmed'/)
      assert.doesNotMatch(solanaSource, /mainnet-beta/)

      assert.equal(solanaPayment.SOLANA_COMMITMENT, 'finalized')
      assert.deepEqual(
        paymentDestinations.getSolanaRpcUrlsForMode('testnet', {}),
        ['https://api.devnet.solana.com'],
      )
      assert.deepEqual(
        paymentDestinations.getSolanaRpcUrlsForMode('testnet', {
          VITE_PAYMENT_RPC_URL_SOLANA_TESTNET: 'https://devnet.custom.rpc',
        }),
        ['https://devnet.custom.rpc', 'https://api.devnet.solana.com'],
      )
      assert.equal(
        paymentDestinations.getSolanaRpcUrlsForMode('mainnet', {
          VITE_PAYMENT_RPC_URL_SOLANA_MAINNET: 'https://mainnet.custom.rpc',
        })[0],
        'https://mainnet.custom.rpc',
      )
    })

    it('builds exact BigInt SOL native and USDT SPL transactions using finalized blockhash and fails closed on invalid recipient, sender, mint, network, asset, or amount', async () => {
      const seenCommitments: string[] = []
      const fakeConnection = {
        getLatestBlockhash: async (commitment?: string) => {
          seenCommitments.push(String(commitment ?? ''))
          return { blockhash: MOCK_BLOCKHASH, lastValidBlockHeight: 1 }
        },
      }

      // Native SOL with decimal fallback (0.199999999 SOL = 199999999 lamports)
      const solTx = await solanaPayment.buildSolanaPaymentTransaction(
        VALID_SOLANA_SENDER,
        VALID_SOLANA_TREASURY,
        makeSolanaQuote({ asset: 'SOL', amount: '0.199999999', decimals: 9 }),
        { networkMode: 'testnet', env: {}, connection: fakeConnection },
      )
      assert.equal(solTx.instructions.length, 1)
      assert.equal(solTx.instructions[0].programId.toBase58(), SystemProgram.programId.toBase58())
      assert.equal(readU64LE(solTx.instructions[0].data, 4), 199999999n)
      assert.equal(seenCommitments[0], 'finalized')

      // Authoritative expectedAmountAtomic takes precedence over quote.amount
      const atomicSolTx = await solanaPayment.buildSolanaPaymentTransaction(
        VALID_SOLANA_SENDER,
        VALID_SOLANA_TREASURY,
        makeSolanaQuote({ asset: 'SOL', amount: '999', decimals: 9 }),
        { expectedAmountAtomic: '500000001', networkMode: 'testnet', env: {}, connection: fakeConnection },
      )
      assert.equal(readU64LE(atomicSolTx.instructions[0].data, 4), 500000001n)

      // USDT SPL with 6 decimals & explicit testnet mint env (0.199999 USDT = 199999 atomic units)
      const usdtTx = await solanaPayment.buildSolanaPaymentTransaction(
        VALID_SOLANA_SENDER,
        VALID_SOLANA_TREASURY,
        makeSolanaQuote({ asset: 'USDT', amount: '0.199999', decimals: 6 }),
        {
          networkMode: 'testnet',
          env: { VITE_PAYMENT_TESTNET_USDT_SOLANA_MINT: VALID_TESTNET_MINT },
          connection: fakeConnection,
        },
      )
      assert.equal(usdtTx.instructions.length, 2)
      const transferIx = usdtTx.instructions[1]
      assert.equal(transferIx.data[0], 12) // TransferChecked
      assert.equal(readU64LE(transferIx.data, 1), 199999n)
      assert.equal(transferIx.data[9], 6)

      // USDT SPL on mainnet uses canonical mainnet USDT mint with expectedAmountAtomic
      const usdtMainnetTx = await solanaPayment.buildSolanaPaymentTransaction(
        VALID_SOLANA_SENDER,
        VALID_SOLANA_TREASURY,
        makeSolanaQuote({ asset: 'USDT', amount: '999', decimals: 6 }),
        {
          expectedAmountAtomic: '2500000',
          networkMode: 'mainnet',
          env: {},
          connection: fakeConnection,
        },
      )
      assert.equal(usdtMainnetTx.instructions.length, 2)
      assert.equal(readU64LE(usdtMainnetTx.instructions[1].data, 1), 2500000n)

      // Fail-closed: unsupported network, unsupported asset, empty recipient, System Program recipient, invalid sender
      await assert.rejects(
        () => solanaPayment.buildSolanaPaymentTransaction(
          VALID_SOLANA_SENDER,
          VALID_SOLANA_TREASURY,
          makeSolanaQuote({ networkId: 'bnb', asset: 'SOL' }),
          { networkMode: 'testnet', env: {}, connection: fakeConnection },
        ),
        /UNSUPPORTED_SOLANA_NETWORK/,
      )
      await assert.rejects(
        () => solanaPayment.buildSolanaPaymentTransaction(
          VALID_SOLANA_SENDER,
          VALID_SOLANA_TREASURY,
          makeSolanaQuote({ asset: 'BNB' }),
          { networkMode: 'testnet', env: {}, connection: fakeConnection },
        ),
        /UNSUPPORTED_SOLANA_ASSET/,
      )
      await assert.rejects(
        () => solanaPayment.buildSolanaPaymentTransaction(
          VALID_SOLANA_SENDER,
          '',
          makeSolanaQuote({ asset: 'SOL', amount: '1' }),
          { networkMode: 'testnet', env: {}, connection: fakeConnection },
        ),
        /TREASURY_ADDRESS_REQUIRED/,
      )
      await assert.rejects(
        () => solanaPayment.buildSolanaPaymentTransaction(
          VALID_SOLANA_SENDER,
          '11111111111111111111111111111111',
          makeSolanaQuote({ asset: 'SOL', amount: '1' }),
          { networkMode: 'testnet', env: {}, connection: fakeConnection },
        ),
        /INVALID_TREASURY_ADDRESS/,
      )
      await assert.rejects(
        () => solanaPayment.buildSolanaPaymentTransaction(
          'not-a-valid-solana-pubkey',
          VALID_SOLANA_TREASURY,
          makeSolanaQuote({ asset: 'SOL', amount: '1' }),
          { networkMode: 'testnet', env: {}, connection: fakeConnection },
        ),
      )

      // Fail-closed: missing testnet USDT mint, invalid mint, zero/invalid expectedAmountAtomic, and u64 overflow
      await assert.rejects(
        () => solanaPayment.buildSolanaPaymentTransaction(
          VALID_SOLANA_SENDER,
          VALID_SOLANA_TREASURY,
          makeSolanaQuote({ asset: 'USDT', amount: '10.00', decimals: 6 }),
          { networkMode: 'testnet', env: {}, connection: fakeConnection },
        ),
        /SOLANA_USDT_MINT_NOT_CONFIGURED/,
      )
      await assert.rejects(
        () => solanaPayment.buildSolanaPaymentTransaction(
          VALID_SOLANA_SENDER,
          VALID_SOLANA_TREASURY,
          makeSolanaQuote({ asset: 'USDT', amount: '10.00', decimals: 6 }),
          { tokenMint: '11111111111111111111111111111111', networkMode: 'testnet', env: {}, connection: fakeConnection },
        ),
        /INVALID_SOLANA_USDT_MINT/,
      )
      await assert.rejects(
        () => solanaPayment.buildSolanaPaymentTransaction(
          VALID_SOLANA_SENDER,
          VALID_SOLANA_TREASURY,
          makeSolanaQuote({ asset: 'SOL', amount: '0.00', decimals: 9 }),
          { networkMode: 'testnet', env: {}, connection: fakeConnection },
        ),
        /INVALID_AMOUNT/,
      )
      for (const badAtomic of ['0', '-1', '1.5']) {
        await assert.rejects(
          () => solanaPayment.buildSolanaPaymentTransaction(
            VALID_SOLANA_SENDER,
            VALID_SOLANA_TREASURY,
            makeSolanaQuote({ asset: 'SOL', amount: '1', decimals: 9 }),
            { expectedAmountAtomic: badAtomic, networkMode: 'testnet', env: {}, connection: fakeConnection },
          ),
          /INVALID_AMOUNT/,
        )
      }
      await assert.rejects(
        () => solanaPayment.buildSolanaPaymentTransaction(
          VALID_SOLANA_SENDER,
          VALID_SOLANA_TREASURY,
          makeSolanaQuote({ asset: 'SOL', amount: '1', decimals: 9 }),
          { expectedAmountAtomic: '18446744073709551616', networkMode: 'testnet', env: {}, connection: fakeConnection },
        ),
        /AMOUNT_OVERFLOW/,
      )
    })
  })
})
