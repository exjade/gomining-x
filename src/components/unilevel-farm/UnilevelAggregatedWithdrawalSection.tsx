import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { User } from 'firebase/auth'
import { MIN_WITHDRAWAL_USDT } from '../../types/withdrawal'
import type { ClientWithdrawalAuthSession } from '../../services/withdrawals/withdrawalAuthGuard'
import { WithdrawalForm } from '../withdrawals/WithdrawalForm'
import { WithdrawalHistoryPanel } from '../withdrawals/WithdrawalHistoryPanel'

const WITHDRAWAL_API_OPTIONS = {
  baseUrl:
    (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_BASE_URL?.trim() ||
    undefined,
}

export interface UnilevelAggregatedWithdrawalSectionProps {
  user: User
  connectedWalletAddress?: string | null
  receivedUnilevelCommission: number
  organizationGeneratedProfitShare: number
  ownMiningProfit: number
  isEn?: boolean
}

function fmt2(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return safe.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Reuses the single authoritative aggregated USDT withdrawal flow:
 * - Config & aggregated balances: `GET /api/withdrawals/config`
 * - Quote: `POST /api/withdrawals/quote`
 * - Submit (min 10 USDT): `POST /api/withdrawals/request`
 * - History: `GET /api/withdrawals/me`
 *
 * Explicitly labels balances, form, and history as AGGREGATED across the account
 * and never presents Unilevel commission as a separately withdrawable balance.
 */
export function UnilevelAggregatedWithdrawalSection({
  user,
  connectedWalletAddress = null,
  receivedUnilevelCommission,
  organizationGeneratedProfitShare,
  ownMiningProfit,
  isEn = false,
}: UnilevelAggregatedWithdrawalSectionProps): ReactElement {
  const [tokenState, setTokenState] = useState<{ uid: string; token: string } | null>(null)
  const [historyRefreshTick, setHistoryRefreshTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!user || user.isAnonymous) {
      setTokenState(null)
      return () => {
        cancelled = true
      }
    }
    const activeUid = user.uid
    setTokenState((prev) => (prev?.uid === activeUid ? prev : null))
    user
      .getIdToken()
      .then((tok) => {
        if (!cancelled) setTokenState({ uid: activeUid, token: tok })
      })
      .catch(() => {
        if (!cancelled) setTokenState(null)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  const session = useMemo<ClientWithdrawalAuthSession | null>(
    () =>
      user && !user.isAnonymous && tokenState?.uid === user.uid
        ? {
            uid: user.uid,
            email: user.email,
            isAnonymous: user.isAnonymous,
            idToken: tokenState.token,
          }
        : null,
    [user, tokenState],
  )

  return (
    <section
      className="ufm-withdraw-section"
      aria-labelledby="ufm-withdraw-heading"
      data-testid="unilevel-aggregated-withdrawals-section"
    >
      <div className="ufm-withdraw-header">
        <div>
          <span className="ufm-withdraw-kicker">
            {isEn
              ? `AGGREGATED ACCOUNT WITHDRAWALS · MIN ${MIN_WITHDRAWAL_USDT} USDT`
              : `RETIROS AGREGADOS DE CUENTA · MÍN. ${MIN_WITHDRAWAL_USDT} USDT`}
          </span>
          <h3 id="ufm-withdraw-heading" className="ufm-withdraw-title">
            {isEn
              ? 'Unified USDT Balance, Request Form & Aggregated Withdrawal History'
              : 'Saldo General Agregado, Solicitud e Historial Unificado de Retiros USDT'}
          </h3>
          <p className="ufm-withdraw-desc">
            {isEn
              ? `Uses the single platform withdrawal ledger (POST /api/withdrawals/request, min ${MIN_WITHDRAWAL_USDT} USDT, history GET /api/withdrawals/me). Available and locked balances below are aggregated across your entire account (mining yield + 10% direct bonus + L1–L20 Unilevel); Unilevel is never withdrawn through a separate pool.`
              : `Reutiliza el flujo único de retiro de la plataforma (POST /api/withdrawals/request, mín. ${MIN_WITHDRAWAL_USDT} USDT, historial GET /api/withdrawals/me). Los saldos disponible y bloqueado son agregados de toda tu cuenta (rendimiento minero + bono directo 10% + Unilevel L1–L20); las ganancias Unilevel no constituyen un saldo retirable por separado.`}
          </p>
        </div>

        <div className="ufm-withdraw-info-pills" data-testid="ufm-aggregated-reference-strip">
          <div className="ufm-withdraw-info-pill">
            <span className="ufm-withdraw-pill-tag">
              {isEn ? 'INFORMATIONAL ONLY · NOT SEPARATELY WITHDRAWABLE' : 'HISTÓRICO INFORMATIVO · NO RETIRABLE POR SEPARADO'}
            </span>
            <div className="ufm-withdraw-pill-values">
              <span>
                Unilevel L1–L20: <strong>+${fmt2(receivedUnilevelCommission)} USDT</strong>
              </span>
              <span>
                {isEn ? 'Org Pool Share:' : 'Pool Red:'} <strong>+${fmt2(organizationGeneratedProfitShare)} USDT</strong>
              </span>
              <span>
                {isEn ? 'Own Mining:' : 'Minado propio:'} <strong>+${fmt2(ownMiningProfit)} USDT</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="ufm-withdraw-embedded-stack">
        <WithdrawalForm
          key={user.uid}
          session={session}
          apiOptions={WITHDRAWAL_API_OPTIONS}
          connectedWalletAddress={connectedWalletAddress}
          onWithdrawalSuccess={() => setHistoryRefreshTick((tick) => tick + 1)}
        />
        <WithdrawalHistoryPanel
          key={user.uid}
          session={session}
          apiOptions={WITHDRAWAL_API_OPTIONS}
          refreshTrigger={historyRefreshTick}
        />
      </div>
    </section>
  )
}
