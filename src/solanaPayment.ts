import { Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js'
import { SOLANA_USDT_MINT } from './paymentDestinations'
import type { PaymentQuote } from './paymentQuote'

const SOLANA_RPCS = [
  'https://solana-rpc.publicnode.com',
  'https://api.mainnet.solana.com',
  'https://api.mainnet-beta.solana.com',
]

const SPL_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')

function deriveAta(owner: PublicKey, mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), SPL_TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0]
}

export async function getSolanaConnection(): Promise<Connection> {
  for (const endpoint of SOLANA_RPCS) {
    try {
      const conn = new Connection(endpoint, 'confirmed')
      await conn.getLatestBlockhash('confirmed')
      return conn
    } catch {
      // try next
    }
  }
  return new Connection(SOLANA_RPCS[0], 'confirmed')
}

export async function buildSolanaPaymentTransaction(
  senderAddress: string,
  recipientAddress: string,
  quote: PaymentQuote,
): Promise<Transaction> {
  const sender = new PublicKey(senderAddress)
  const receiver = new PublicKey(recipientAddress)
  const transaction = new Transaction()

  if (quote.asset === 'SOL') {
    const lamports = BigInt(Math.round(Number(quote.amount) * 1e9))
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: sender,
        toPubkey: receiver,
        lamports,
      }),
    )
  } else {
    // USDT SPL transfer
    const mint = new PublicKey(SOLANA_USDT_MINT)
    const sourceAta = deriveAta(sender, mint)
    const destinationAta = deriveAta(receiver, mint)

    // Ensure recipient ATA exists or create it
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

    const amountUnits = BigInt(Math.round(Number(quote.amount) * 1e6))
    const transferData = new Uint8Array(10)
    transferData[0] = 12 // TransferChecked
    for (let i = 0; i < 8; i++) transferData[i + 1] = Number((amountUnits >> BigInt(i * 8)) & 0xffn)
    transferData[9] = 6 // Decimals

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
  }

  const connection = await getSolanaConnection()
  const latestBlockhash = await connection.getLatestBlockhash('confirmed')
  transaction.feePayer = sender
  transaction.recentBlockhash = latestBlockhash.blockhash
  return transaction
}
