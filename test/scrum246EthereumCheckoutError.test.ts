import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

import { buyDemoMiner, restoreDemoSession, getDemoSessionForPersistence } from '../src/demoStore.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const checkoutFilePath = path.resolve(__dirname, '../src/WalletPaymentCheckout.tsx')

// Dynamically load pure functions exported from src/WalletPaymentCheckout.tsx
const checkoutSource = fs.readFileSync(checkoutFilePath, 'utf8')
const functionsMatch = checkoutSource.match(/export function sanitizeErrorReason[\s\S]*?(?=export function WalletPaymentCheckout)/)
if (!functionsMatch) {
  throw new Error('Failed to extract sanitizeErrorReason and classifyPaymentError from WalletPaymentCheckout.tsx')
}

const transpileResult = ts.transpileModule(functionsMatch[0], {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
})

const dataUrl = `data:text/javascript;base64,${Buffer.from(transpileResult.outputText).toString('base64')}`
const { sanitizeErrorReason, classifyPaymentError } = (await import(dataUrl)) as {
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

describe('SCRUM-246: Safe Error Classification for Ethereum and Multi-Chain Checkout', () => {
  describe('Suite 1: User Rejection Isolation and Provider Disambiguation', () => {
    it('isolates viem UserRejectedRequestError with zero simulation fallback', () => {
      const err = {
        name: 'UserRejectedRequestError',
        shortMessage: 'User rejected the request.',
        details: 'User rejected the request.',
        code: 4001,
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'USER_REJECTION')
      assert.equal(result.category, 'USER_REJECTION')
      assert.equal(result.name, 'UserRejectedRequestError')
      assert.equal(result.code, 4001)
      assert.equal(result.shortMessage, 'User rejected the request.')
      assert.equal(result.message, 'Transacción rechazada en tu billetera.')
    })

    it('isolates standard EIP-1193 rejection error code 4001', () => {
      const err = {
        code: 4001,
        message: 'MetaMask Tx Signature: User denied transaction signature.',
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'USER_REJECTION')
      assert.equal(result.category, 'USER_REJECTION')
      assert.equal(result.code, 4001)
      assert.equal(result.message, 'Transacción rechazada en tu billetera.')
    })

    it('isolates nested cause with code 4001 and rejection keywords', () => {
      const err = new Error('Transaction execution failed')
      ;(err as unknown as { cause: { code: number; message: string } }).cause = {
        code: 4001,
        message: 'User declined action in wallet extension',
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'USER_REJECTION')
      assert.equal(result.category, 'USER_REJECTION')
      assert.equal(result.code, 4001)
      assert.equal(result.message, 'Transacción rechazada en tu billetera.')
    })

    it('isolates TransactionRejectedRpcError', () => {
      const err = {
        name: 'TransactionRejectedRpcError',
        message: 'The user rejected the transaction request on the device.',
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'USER_REJECTION')
      assert.equal(result.category, 'USER_REJECTION')
      assert.equal(result.name, 'TransactionRejectedRpcError')
      assert.equal(result.message, 'Transacción rechazada en tu billetera.')
    })

    it('isolates multi-level standard Error cause chains (depth >= 3) with code 4001 as USER_REJECTION with zero simulation fallback', () => {
      const e5 = Object.assign(new Error('User rejected the transaction'), { code: 4001, name: 'UserRejectedRequestError' })
      const e4 = new Error('RPC sendTransaction failed', { cause: e5 })
      const e3 = new Error('Contract call failed', { cause: e4 })
      const e2 = new Error('Wallet action failed', { cause: e3 })
      const e1 = new Error('Checkout failed', { cause: e2 })

      const result = classifyPaymentError(e1, 'Ethereum')
      assert.equal(result.kind, 'USER_REJECTION')
      assert.equal(result.category, 'USER_REJECTION')
      assert.equal(result.code, 4001)
      assert.equal(result.message, 'Transacción rechazada en tu billetera.')
    })

    // R2 Adversarial tests: Provider rejection strings must NOT trigger USER_REJECTION
    it('classifies "RPC request rejected by provider rate limit" as RPC_ERROR, NOT USER_REJECTION', () => {
      const err = new Error('RPC request rejected by provider rate limit')
      const result = classifyPaymentError(err, 'Ethereum')
      assert.notEqual(result.kind, 'USER_REJECTION')
      assert.equal(result.kind, 'RPC_ERROR')
      assert.equal(result.category, 'RPC_ERROR')
      assert.equal(result.shortMessage, 'RPC request rejected by provider rate limit')
      assert.match(result.message, /Error de comunicación con el proveedor RPC/)
    })

    it('classifies "request denied by provider policy" as RPC_ERROR, NOT USER_REJECTION', () => {
      const err = new Error('request denied by provider policy')
      const result = classifyPaymentError(err, 'Ethereum')
      assert.notEqual(result.kind, 'USER_REJECTION')
      assert.equal(result.kind, 'RPC_ERROR')
      assert.equal(result.category, 'RPC_ERROR')
      assert.equal(result.shortMessage, 'request denied by provider policy')
      assert.match(result.message, /Error de comunicación con el proveedor RPC/)
    })

    it('classifies "provider-side cancellation due to gateway timeout" as RPC_ERROR, NOT USER_REJECTION', () => {
      const err = new Error('provider-side cancellation due to gateway timeout')
      const result = classifyPaymentError(err, 'Ethereum')
      assert.notEqual(result.kind, 'USER_REJECTION')
      assert.equal(result.kind, 'RPC_ERROR')
      assert.equal(result.category, 'RPC_ERROR')
      assert.equal(result.shortMessage, 'provider-side cancellation due to gateway timeout')
      assert.match(result.message, /Error de comunicación con el proveedor RPC/)
    })

    // R1 Safe diagnostics test: populates safe diagnostic fields across classification paths without leaking secrets
    it('populates safe diagnostic fields (name, code, shortMessage, category) without leaking sensitive tokens or URLs', () => {
      const err = {
        name: 'InsufficientFundsError',
        shortMessage: 'insufficient balance for transfer with apiKey=secret_key_123 at https://rpc.example.com/v1/private',
        code: -32000,
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'INSUFFICIENT_FUNDS')
      assert.equal(result.category, 'INSUFFICIENT_FUNDS')
      assert.equal(result.name, 'InsufficientFundsError')
      assert.equal(result.code, -32000)
      assert.ok(result.shortMessage, 'shortMessage must be populated')
      assert.doesNotMatch(result.shortMessage, /secret_key_123/)
      assert.doesNotMatch(result.shortMessage, /https?:\/\//)
      assert.match(result.shortMessage, /token=\[masked\]/)
      assert.match(result.shortMessage, /\[rpc-endpoint\]/)
    })
  })

  describe('Suite 2: Insufficient Funds and Gas Isolation', () => {
    it('classifies viem InsufficientFundsError and highlights active network', () => {
      const err = {
        name: 'InsufficientFundsError',
        shortMessage: 'The total cost (gas * gas price + value) of executing this transaction exceeds the balance of the account.',
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'INSUFFICIENT_FUNDS')
      assert.match(result.message, /Ethereum/)
      assert.match(result.message, /fondos insuficientes para el pago o para el gas de red/)
    })

    it('classifies gas required exceeds allowance error', () => {
      const err = new Error('gas required exceeds allowance (300000) or always failing transaction')
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'INSUFFICIENT_FUNDS')
      assert.match(result.message, /Ethereum/)
    })

    it('classifies insufficient balance for transfer across different networks', () => {
      const err = new Error('insufficient balance for transfer')
      const resultEth = classifyPaymentError(err, 'Ethereum')
      assert.equal(resultEth.kind, 'INSUFFICIENT_FUNDS')
      assert.match(resultEth.message, /Ethereum/)

      const resultBnb = classifyPaymentError(err, 'BNB Chain')
      assert.equal(resultBnb.kind, 'INSUFFICIENT_FUNDS')
      assert.match(resultBnb.message, /BNB Chain/)
    })

    it('keeps insufficient funds strictly distinct from rejection', () => {
      const insufficientErr = new Error('insufficient funds for gas * price + value')
      const result = classifyPaymentError(insufficientErr, 'Ethereum')
      assert.notEqual(result.kind, 'USER_REJECTION')
    })
  })

  describe('Suite 3: Concrete Provider, RPC, and Contract Revert Diagnostics', () => {
    it('diagnoses Contract Execution Revert with sanitized revert reason', () => {
      const err = {
        name: 'ExecutionRevertedError',
        shortMessage: 'Execution reverted with reason: ERC20: transfer amount exceeds balance.',
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'EXECUTION_REVERTED')
      assert.match(result.message, /La transacción fue revertida en la red Ethereum/)
      assert.match(result.message, /ERC20: transfer amount exceeds balance/)
    })

    it('diagnoses ContractFunctionRevertedError with detail', () => {
      const err = {
        name: 'ContractFunctionRevertedError',
        shortMessage: 'The contract function execution reverted: TransferFailed().',
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'EXECUTION_REVERTED')
      assert.match(result.message, /La transacción fue revertida en la red Ethereum/)
      assert.match(result.message, /TransferFailed\(\)/)
    })

    it('diagnoses Chain Mismatch with actionable wallet guidance and NO simulation fallback', () => {
      const err = {
        name: 'ChainMismatchError',
        shortMessage: 'The current chain of the wallet (id: 56) does not match the target chain for the transaction (id: 1 – Ethereum).',
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'CHAIN_MISMATCH')
      assert.equal(result.message, 'La billetera está conectada a otra red. Cambia a la red Ethereum en tu billetera para continuar.')
    })

    it('diagnoses Missing / Disconnected EVM wallet with actionable guidance and NO simulation fallback', () => {
      const err = new Error('No hay una wallet EVM conectada para autorizar la transacción.')
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'WALLET_NOT_CONNECTED')
      assert.equal(result.message, 'No hay una billetera compatible conectada para autorizar la transacción en Ethereum. Conecta tu billetera para continuar.')
    })

    it('diagnoses ConnectorNotConnectedError', () => {
      const err = {
        name: 'ConnectorNotConnectedError',
        message: 'Connector not connected.',
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'WALLET_NOT_CONNECTED')
    })

    it('diagnoses Internal JSON-RPC error (-32603) as RPC communication failure, NOT insufficient funds', () => {
      const err = {
        code: -32603,
        shortMessage: 'Internal JSON-RPC error: replacement transaction underpriced.',
      }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'RPC_ERROR')
      assert.match(result.message, /Error de comunicación con el proveedor RPC en la red Ethereum/)
      assert.match(result.message, /replacement transaction underpriced/)
      assert.doesNotMatch(result.message, /fondos insuficientes/)
    })

    it('diagnoses RPC rate limit (HTTP 429) or gateway timeouts', () => {
      const err = new Error('HTTP 429: Too Many Requests from Infura RPC endpoint')
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'RPC_ERROR')
      assert.match(result.message, /Error de comunicación con el proveedor RPC en la red Ethereum/)
    })

    it('diagnoses non-standard JSON-RPC code -32000 as RPC_ERROR', () => {
      const err = { code: -32000, message: 'Server error' }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'RPC_ERROR')
      assert.match(result.message, /Error de comunicación con el proveedor RPC en la red Ethereum/)
      assert.match(result.message, /Server error/)
    })

    it('diagnoses JSON-RPC revert payload in data.message as EXECUTION_REVERTED with detail', () => {
      const err = { code: -32603, data: { message: 'execution reverted: custom error' } }
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'EXECUTION_REVERTED')
      assert.match(result.message, /La transacción fue revertida en la red Ethereum/)
      assert.match(result.message, /execution reverted: custom error/)
    })

    it('safely handles circular cause references without infinite loops', () => {
      const circErr: Record<string, unknown> = new Error('Circular root')
      circErr.cause = circErr
      const result = classifyPaymentError(circErr, 'Ethereum')
      assert.ok(result.message)
      assert.equal(result.kind, 'GENERIC_DIAGNOSTIC')
    })

    it('diagnoses generic unknown error with diagnostic detail rather than masking it', () => {
      const err = new Error('Unexpected USB hardware device timeout')
      const result = classifyPaymentError(err, 'Ethereum')
      assert.equal(result.kind, 'RPC_ERROR') // Contains timeout -> RPC_ERROR
      assert.match(result.message, /Error de comunicación con el proveedor RPC/)
      assert.match(result.message, /Unexpected USB hardware device timeout/)

      const unclassifiedErr = new Error('Unforeseen peripheral state corruption')
      const fallbackResult = classifyPaymentError(unclassifiedErr, 'Ethereum')
      assert.equal(fallbackResult.kind, 'GENERIC_DIAGNOSTIC')
      assert.match(fallbackResult.message, /No se pudo completar el pago en Ethereum \(Unforeseen peripheral state corruption\)/)
    })
  })

  describe('Suite 4: Safe Message Content (Zero Secrets / Zero Token Leaks)', () => {
    it('strips Infura and Alchemy API keys embedded in RPC URLs', () => {
      const raw = 'Failed to execute eth_sendRawTransaction at https://mainnet.infura.io/v3/9aa3d95b369e4f3a97d8b5c9284f1234 on block 1928374'
      const sanitized = sanitizeErrorReason(raw)
      assert.doesNotMatch(sanitized, /9aa3d95b369e4f3a97d8b5c9284f1234/)
      assert.doesNotMatch(sanitized, /https?:\/\//)
      assert.match(sanitized, /\[rpc-endpoint\]/)

      const classified = classifyPaymentError(new Error(raw), 'Ethereum')
      assert.doesNotMatch(classified.message, /9aa3d95b369e4f3a97d8b5c9284f1234/)
      assert.doesNotMatch(classified.message, /https?:\/\//)
    })

    it('strips Bearer tokens from authorization errors', () => {
      const raw = 'Unauthorized: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.t-ID5_rQ received from RPC node'
      const sanitized = sanitizeErrorReason(raw)
      assert.doesNotMatch(sanitized, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/)
      assert.match(sanitized, /\[token\]/)

      const classified = classifyPaymentError(new Error(raw), 'Ethereum')
      assert.doesNotMatch(classified.message, /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9/)
    })

    it('strips private keys and long hex strings / calldata payloads', () => {
      const raw = 'Contract call failed with key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 and calldata 0xa9059cbb000000000000000000000000'
      const sanitized = sanitizeErrorReason(raw)
      assert.doesNotMatch(sanitized, /0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80/)
      assert.doesNotMatch(sanitized, /0xa9059cbb000000000000000000000000/)
      assert.match(sanitized, /\[hash\/data\]/)

      const classified = classifyPaymentError(new Error(raw), 'Ethereum')
      assert.doesNotMatch(classified.message, /0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80/)
    })

    it('strips API key query parameters and bounds maximum length to prevent UI blowout', () => {
      const raw = 'Server responded with apiKey=secret_api_key_xyz987654321 ' + 'A'.repeat(300)
      const sanitized = sanitizeErrorReason(raw)
      assert.doesNotMatch(sanitized, /secret_api_key_xyz987654321/)
      assert.ok(sanitized.length <= 120, `Sanitized length ${sanitized.length} must be <= 120`)

      const classified = classifyPaymentError(new Error(raw), 'Ethereum')
      assert.ok(classified.message.length <= 250, `Classified message length ${classified.message.length} must be bounded`)
    })
  })

  describe('Suite 5: Simulation Fallback Safety Contracts', () => {
    it('verifies buyDemoMiner operates in local demoStore without triggering real persistence', () => {
      restoreDemoSession({
        balance: 50000,
        presaleTokens: 0,
        maintenanceCredit: 0,
        miners: [],
        workers: [],
        workerActivationMode: 'automatic',
        receipts: [],
        pendingMinerOrders: [],
      })

      const demoResult = buyDemoMiner({
        name: 'The Starter Miner (Simulation)',
        powerTh: 16,
        efficiency: 15,
        price: 0,
        purchaseMode: 'once',
      })

      assert.ok(demoResult.miner, 'Demo miner should be created')
      assert.equal(demoResult.miner.powerTh, 16)

      const session = getDemoSessionForPersistence()
      assert.equal(session.miners.length, 1)
      assert.equal(session.balance, 50000)
      assert.equal(session.receipts.length, 1)
      assert.equal(session.receipts[0].kind, 'miner')
      assert.ok(session.receipts[0].label.includes('Compra'), 'Receipt must reflect demo purchase')
    })

    it('verifies static source guarantee: simulation fallback button and state are completely removed from WalletPaymentCheckout (SCRUM-346)', () => {
      assert.equal(checkoutSource.includes('Confirmar compra en modo prueba / simulación'), false)
      assert.equal(checkoutSource.includes('showSimulateFallback'), false)
      assert.equal(checkoutSource.includes('buyDemoMiner'), false)
      assert.doesNotMatch(checkoutSource, /savePurchasedMiner/)
      assert.doesNotMatch(checkoutSource, /recordMinerPurchaseToAdmin/)
    })
  })

  describe('Suite 6: Static Invariants & Anti-Regression on WalletPaymentCheckout.tsx', () => {
    it('verifies absence of legacy unconditional masking string', () => {
      const legacyPattern = /setError\(\s*`No se pudo completar el pago en \$\{activeDestination\.name\}\. Puedes verificar tu conexión o confirmar en modo simulación de prueba\.`\s*\)/
      assert.doesNotMatch(
        checkoutSource,
        legacyPattern,
        'Legacy unconditional masking string must not exist in handlePay catch block'
      )
    })

    it('verifies handlePay catch block uses classifyPaymentError without simulation fallback', () => {
      const handlePayCatchMatch = checkoutSource.match(/handlePay[\s\S]*?} catch \(err\) \{([\s\S]*?)\} finally/)?.[1]
      assert.ok(handlePayCatchMatch, 'handlePay catch block must be present')
      assert.match(handlePayCatchMatch, /classifyPaymentError\s*\(\s*err\s*,\s*activeNetworkConfig\.name\s*\)/)
      assert.match(handlePayCatchMatch, /setError\s*\(\s*classified\.message\s*\)/)
      assert.doesNotMatch(handlePayCatchMatch, /setShowSimulateFallback/)
    })

    it('verifies exported contracts for sanitizeErrorReason and classifyPaymentError', () => {
      assert.match(checkoutSource, /export function sanitizeErrorReason\s*\(/)
      assert.match(checkoutSource, /export function classifyPaymentError\s*\(/)
    })

    it('verifies user rejection is classified cleanly as USER_REJECTION', () => {
      const rejectionResult = classifyPaymentError(new Error('User rejected the transaction'), 'Ethereum')
      assert.equal(rejectionResult.kind, 'USER_REJECTION')
    })
  })
})
