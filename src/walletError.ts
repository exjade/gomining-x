const rejectionCode = /^(?:4001|ACTION_REJECTED|TRANSACTION_CANCELLED|USER_REJECTED|USER_REJECTED_REQUEST)$/i
const rejectionText = /reject|declin|denied|cancel/i

/**
 * MetaMask Connect may wrap a user cancellation as code 53 and expose the
 * wallet's EIP-1193 rejection as rpcCode=4001. Walk the supported error chain
 * without assuming a particular provider's Error shape.
 */
export function isWalletRejection(error: unknown): boolean {
  const pending: unknown[] = [error]
  const visited = new Set<object>()

  while (pending.length > 0) {
    const value = pending.pop()
    if (typeof value === 'string') {
      if (rejectionText.test(value)) return true
      continue
    }
    if (!value || typeof value !== 'object' || visited.has(value)) continue
    visited.add(value)

    const candidate = value as Record<string, unknown>
    for (const code of [candidate.code, candidate.rpcCode]) {
      if ((typeof code === 'number' && code === 4001)
        || (typeof code === 'string' && rejectionCode.test(code))) return true
    }
    for (const field of [candidate.message, candidate.rpcMessage, candidate.reason]) {
      if (typeof field === 'string' && rejectionText.test(field)) return true
    }
    pending.push(candidate.cause, candidate.data, candidate.rpcData, candidate.originalError, candidate.error)
  }

  return false
}
