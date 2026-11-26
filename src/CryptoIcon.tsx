import { useState } from 'react'

export type CryptoSymbol = 'BTC' | 'BNB' | 'ETH' | 'TRX' | 'USDT' | 'SOL' | 'POL' | 'ARB' | 'OP' | 'AVAX' | 'GOMINING'

const assets: Partial<Record<CryptoSymbol, string>> = {
  BTC: '/crypto/bitcoin.svg',
  BNB: '/crypto/bnb.svg',
  ETH: '/crypto/ethereum.svg',
  TRX: '/crypto/trx.svg',
  USDT: '/crypto/usdt.svg',
  SOL: '/crypto/solana.svg',
  POL: '/crypto/polygon.svg',
}

const names: Record<CryptoSymbol, string> = {
  BTC: 'Bitcoin', BNB: 'BNB Chain', ETH: 'Ethereum', TRX: 'TRON',
  USDT: 'Tether USD', SOL: 'Solana', POL: 'Polygon', ARB: 'Arbitrum',
  OP: 'Optimism', AVAX: 'Avalanche', GOMINING: 'GoMining',
}

export function CryptoIcon({ symbol, size = 'md' }: { symbol: CryptoSymbol; size?: 'sm' | 'md' | 'lg' }) {
  const [failedSymbol, setFailedSymbol] = useState<CryptoSymbol | null>(null)
  const source = assets[symbol]
  return <span className={`crypto-icon crypto-icon-${size} crypto-icon-${symbol.toLowerCase()}`} role="img" aria-label={names[symbol]}>
    {source && failedSymbol !== symbol
      ? <img src={source} alt="" aria-hidden="true" decoding="async" onError={() => setFailedSymbol(symbol)} />
      : <span className="crypto-icon-fallback" aria-hidden="true">{symbol === 'GOMINING' ? 'G' : symbol}</span>}
  </span>
}
