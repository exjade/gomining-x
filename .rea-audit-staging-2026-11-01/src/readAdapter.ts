export type ReplicaReadSnapshot = {
  status: 'not-connected'
  receivedAt: null
  data: null
  message: string
}

type AllowedRead = { origin: string; pathname: string }

// REA and the authenticated browser review did not confirm a safe, complete
// read endpoint. Keep the allowlist empty until an exact GET is observed.
const ALLOWED_READS: readonly AllowedRead[] = []

export function getSessionSnapshot(): ReplicaReadSnapshot {
  return {
    status: 'not-connected',
    receivedAt: null,
    data: null,
    message: 'Los datos de cuenta no están conectados. Esta vista usa marcadores locales.',
  }
}

export async function readAllowedJson(url: string): Promise<unknown> {
  const target = new URL(url, window.location.origin)
  const allowed = ALLOWED_READS.some(
    (entry) => entry.origin === target.origin && entry.pathname === target.pathname,
  )
  if (!allowed) throw new Error('Lectura fuera de la lista permitida.')

  const response = await fetch(target, {
    method: 'GET',
    credentials: 'omit',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`La lectura respondió ${response.status}.`)
  return response.json() as Promise<unknown>
}
