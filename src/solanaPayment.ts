import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import {
  getPaymentNetworkConfig,
  getSolanaRpcUrlsForMode,
  isValidSolanaAddress,
  parseDecimalToAtomicBigInt,
  parsePositiveAtomicBigInt,
  PaymentDestinationError,
  requireTreasuryAddress,
  type PaymentEnv,
  type PaymentNetworkMode,
} from './paymentDestinations.ts'
import type { PaymentQuote } from './paymentQuote.ts'

export const SOLANA_COMMITMENT = 'finalized' as const

const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
const MAX_U64 = 18_446_744_073_709_551_615n

export type SolanaPaymentQuoteInput = PaymentQuote & {
  expectedAmountAtomic?: string | bigint
  tokenContractAddress?: string
  tokenMint?: string
}

export type SolanaPaymentOptions = {
  expectedAmountAtomic?: string | bigint
  tokenMint?: string
  networkMode?: PaymentNetworkMode
  env?: PaymentEnv
  connection?: Pick<Connection, 'getLatestBlockhash'>
}

function deriveAta(owner: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SPL_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0]
}

function resolveAtomicAmount(
  quote: SolanaPaymentQuoteInput,
  decimals: number,
  expectedAmountAtomic?: string | bigint,
): bigint {
  const authoritative = expectedAmountAtomic ?? quote.expectedAmountAtomic
  const atomic = authoritative !== undefined
    ? parsePositiveAtomicBigInt(authoritative)
    : parseDecimalToAtomicBigInt(quote.amount, decimals)

  if (atomic <= 0n) {
    throw new PaymentDestinationError('INVALID_AMOUNT', 'Solana payment amount must be greater than zero.')
  }
  if (atomic > MAX_U64) {
    throw new PaymentDestinationError('AMOUNT_OVERFLOW', 'Solana payment amount exceeds uint64 maximum.')
  }
  return atomic
}

export async function getSolanaConnection(
  mode?: PaymentNetworkMode,
  env?: PaymentEnv,
): Promise<Connection> {
  const endpoints = getSolanaRpcUrlsForMode(mode, env)
  for (const endpoint of endpoints) {
    try {
      const conn = new Connection(endpoint, SOLANA_COMMITMENT)
      await conn.getLatestBlockhash(SOLANA_COMMITMENT)
      return conn
    } catch {
      // try next endpoint in pool
    }
  }
  return new Connection(endpoints[0], SOLANA_COMMITMENT)
}

export async function buildSolanaPaymentTransaction(
  senderAddress: string,
  recipientAddress: string,
  quote: SolanaPaymentQuoteInput,
  options?: SolanaPaymentOptions,
): Promise<Transaction> {
  if (quote.networkId !== 'solana') {
    throw new PaymentDestinationError('UNSUPPORTED_SOLANA_NETWORK', `Unsupported Solana payment network: ${quote.networkId}`)
  }

  const validatedRecipient = requireTreasuryAddress(recipientAddress, 'solana')
  const sender = new PublicKey(senderAddress.trim())
  const receiver = new PublicKey(validatedRecipient)
  const config = getPaymentNetworkConfig('solana', options?.networkMode, options?.env)
  const transaction = new Transaction()

  if (quote.asset === 'SOL') {
    const lamports = resolveAtomicAmount(quote, config.nativeDecimals, options?.expectedAmountAtomic)
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: receiver,
        lamports,
      }),
    )
  } else if (quote.asset === 'USDT') {
    const mintAddress = (
      options?.tokenMint ??
      quote.tokenMint ??
      quote.tokenContractAddress ??
      config.usdtContractAddress
    ).trim()
    if (!mintAddress) {
      throw new PaymentDestinationError(
        'SOLANA_USDT_MINT_NOT_CONFIGURED',
        `Missing Solana USDT mint address for mode "${config.mode}".`,
      )
    }
    if (!isValidSolanaAddress(mintAddress)) {
      throw new PaymentDestinationError(
        'INVALID_SOLANA_USDT_MINT',
        'Invalid Solana USDT mint address.',
      )
    }

    const mint = new PublicKey(mintAddress)
    const sourceAta = deriveAta(sender, mint)
    const destinationAta = deriveAta(receiver, mint)

    // Ensure recipient ATA exists or create it idempotently
    transaction.add(
      new TransactionInstruction({
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: sender, isSigner: true, isWritable: true },
          { pubkey: destinationAta, isSigner: false, isWritable: true },
          { pubkey: receiver, isSigner: false, isWritable: false },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: SPL_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ],
        data: Buffer.from([1]), // createIdempotent
      }),
    )

    const amountUnits = resolveAtomicAmount(quote, config.usdtDecimals, options?.expectedAmountAtomic)
    const transferData = new Uint8Array(10)
    transferData[0] = 12 // TransferChecked
    for (let i = 0; i < 8; i++) transferData[i + 1] = Number((amountUnits >> BigInt(i * 8)) & 0xffn)
    transferData[9] = config.usdtDecimals

    transaction.add(
      new TransactionInstruction({
        programId: SPL_TOKEN_PROGRAM_ID,
        keys: [
          { pubkey: sourceAta, isSigner: false, isWritable: true },
          { pubkey: mint, isSigner: false, isWritable: false },
          { pubkey: destinationAta, isSigner: false, isWritable: true },
          { pubkey: sender, isSigner: true, isWritable: false },
        ],
        data: Buffer.from(transferData),
      }),
    )
  } else {
    throw new PaymentDestinationError(
      'UNSUPPORTED_SOLANA_ASSET',
      `Solana checkout only supports SOL or USDT SPL (received: ${quote.asset}).`,
    )
  }

  const connection = options?.connection ?? await getSolanaConnection(options?.networkMode, options?.env)
  const latestBlockhash = await connection.getLatestBlockhash(SOLANA_COMMITMENT)
  transaction.feePayer = sender
  transaction.recentBlockhash = latestBlockhash.blockhash
  return transaction
}
