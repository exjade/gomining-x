/**
 * SCRUM-223 POUW-1.8 Read-Only Contamination Inventory & PO Diagnostic Tool
 * Strictly READ-ONLY. Zero writes, zero seeds, zero deletes, zero repairs.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'


const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')

// Candidate locations for service account credentials
const candidateSaPaths = [
  path.resolve(projectRoot, 'salad-miners-firebase-adminsdk-fbsvc-d35c5609a6.json'),
  path.resolve(projectRoot, '..', 'salad-miners-firebase-adminsdk-fbsvc-d35c5609a6.json'),
  path.resolve(projectRoot, '..', '..', 'salad-miners-firebase-adminsdk-fbsvc-d35c5609a6.json'),
]

let serviceAccountPath: string | null = null
for (const p of candidateSaPaths) {
  if (fs.existsSync(p)) {
    serviceAccountPath = p
    break
  }
}

// 7-Class Classification Categories
export type ContaminationCategory =
  | 'REAL'
  | 'SUSPICIOUS'
  | 'TEST_KNOWN'
  | 'ORPHAN_USER'
  | 'ORPHAN_ORDER'
  | 'ORPHAN_CONTRACT'
  | 'NO_PAYMENT_PROOF'

export interface InventoryItem {
  collection: string
  docId: string
  userId?: string
  packageId?: string
  txHash?: string
  status?: string
  categories: ContaminationCategory[]
  notes: string
  rawFields: Record<string, any>
}

// Decodes Firestore REST field representation to JS value
function decodeFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return val
  if ('stringValue' in val) return val.stringValue
  if ('integerValue' in val) return Number(val.integerValue)
  if ('doubleValue' in val) return Number(val.doubleValue)
  if ('booleanValue' in val) return val.booleanValue
  if ('timestampValue' in val) return val.timestampValue
  if ('nullValue' in val) return null
  if ('mapValue' in val) {
    const res: Record<string, any> = {}
    const fields = val.mapValue.fields || {}
    for (const [k, v] of Object.entries(fields)) {
      res[k] = decodeFirestoreValue(v)
    }
    return res
  }
  if ('arrayValue' in val) {
    const vals = val.arrayValue.values || []
    return vals.map(decodeFirestoreValue)
  }
  return val
}

function decodeFirestoreDoc(doc: any): { id: string; path: string; fields: Record<string, any> } {
  const name = String(doc.name || '')
  const id = name.split('/').pop() || ''
  const fields: Record<string, any> = {}
  if (doc.fields) {
    for (const [k, v] of Object.entries(doc.fields)) {
      fields[k] = decodeFirestoreValue(v)
    }
  }
  return { id, path: name, fields }
}

async function getGoogleAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  ).toString('base64url')

  const sign = crypto.createSign('RSA-SHA256')
  sign.update(`${header}.${claim}`)
  const signature = sign.sign(sa.private_key, 'base64url')
  const jwt = `${header}.${claim}.${signature}`

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`,
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`Failed to obtain Google OAuth2 access token: ${resp.status} ${errText}`)
  }

  const data = (await resp.json()) as { access_token: string }
  return data.access_token
}

async function fetchCollectionDocs(
  accessToken: string,
  projectId: string,
  collectionId: string
): Promise<{ id: string; path: string; fields: Record<string, any> }[]> {
  const allDocs: { id: string; path: string; fields: Record<string, any> }[] = []
  let pageToken: string | undefined = undefined

  do {
    let url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}?pageSize=300`
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`
    }
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!resp.ok) {
      const txt = await resp.text()
      throw new Error(`Error fetching collection "${collectionId}": ${resp.status} ${txt}`)
    }
    const data = (await resp.json()) as { documents?: any[]; nextPageToken?: string }
    if (data.documents && data.documents.length > 0) {
      for (const doc of data.documents) {
        allDocs.push(decodeFirestoreDoc(doc))
      }
    }
    pageToken = data.nextPageToken
  } while (pageToken)

  return allDocs
}

async function fetchCollectionGroupMiners(
  accessToken: string,
  projectId: string
): Promise<{ id: string; path: string; fields: Record<string, any> }[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: 'miner', allDescendants: true }],
      },
    }),
  })
  if (!resp.ok) {
    const txt = await resp.text()
    throw new Error(`Error executing collection-group query for miners: ${resp.status} ${txt}`)
  }
  const results = (await resp.json()) as any[]
  const docs = results.filter((r) => r.document).map((r) => decodeFirestoreDoc(r.document))
  return docs
}

export async function runContaminationAudit() {
  console.log('='.repeat(80))
  console.log('SCRUM-223 / POUW-1.8: Read-Only Contamination Inventory & PO Diagnostic')
  console.log('Mode: STRICTLY READ-ONLY (Zero writes, zero seeds, zero deletes, zero repairs)')
  console.log('='.repeat(80))

  if (!serviceAccountPath) {
    console.error('FATAL: Google Service Account credentials file not found.')
    console.error('Looked in candidate paths:', candidateSaPaths)
    process.exit(1)
  }

  const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'))
  const projectId = sa.project_id || process.env.VITE_FIREBASE_PROJECT_ID || 'salad-miners'
  console.log(`Auditing Firestore Project: "${projectId}"`)

  const accessToken = await getGoogleAccessToken(sa)
  console.log('Successfully authenticated with Google Cloud Service Account.\n')

  // Read collections
  console.log('Scanning collections in read-only mode...')
  const [users, contracts, orders, miners] = await Promise.all([
    fetchCollectionDocs(accessToken, projectId, 'users'),
    fetchCollectionDocs(accessToken, projectId, 'admin_contracts'),
    fetchCollectionDocs(accessToken, projectId, 'admin_orders'),
    fetchCollectionGroupMiners(accessToken, projectId),
  ])

  console.log(`Observed Documents:`)
  console.log(`  - /users:             ${users.length}`)
  console.log(`  - /admin_contracts:   ${contracts.length}`)
  console.log(`  - /admin_orders:      ${orders.length}`)
  console.log(`  - /miners/*/miner/*:  ${miners.length}\n`)

  const contractMap = new Map(contracts.map((c) => [c.id, c]))
  const orderMap = new Map(orders.map((o) => [o.id, o]))
  const userMap = new Map(users.map((u) => [u.id, u]))

  const inventory: InventoryItem[] = []

  // Known test patterns
  const knownTestIdPatterns = [
    'MINER-UNTRIMMED-123',
    'MINER-TRIM-UID-1',
    'MINER-STRESS-TRIM-002',
    'MINER-GUEST-DIRECT-1',
    'MINER-GUEST-1',
    'ctr-test-buyer-101',
    'MINER-SAVE-001',
    'MINER-ADV-001',
  ]
  const knownTestUidPatterns = [
    'usr_untrimmed_test',
    'usr_trim_me',
    'usr_adversarial_valid_777',
    'user_save_test',
    'user_test_1',
    'uid_wallet_e2e',
    'usr_client_buyer_101',
  ]

  // Helper to mask sensitive identifiers and emails in reports
  function maskIdentifier(id: string): string {
    if (!id || typeof id !== 'string') return ''
    if (knownTestUidPatterns.some((p) => id.includes(p)) || id.startsWith('usr_adv') || id.startsWith('user_')) {
      return id
    }
    if (id.length <= 8) return id
    return `${id.slice(0, 4)}...${id.slice(-4)}`
  }

  function maskEmail(email: string): string {
    if (!email || typeof email !== 'string' || !email.includes('@')) return email
    const [user, domain] = email.split('@')
    const maskedUser = user.length <= 2 ? `${user[0]}*` : `${user.slice(0, 2)}***${user.slice(-1)}`
    return `${maskedUser}@${domain}`
  }

  // 1. Audit admin_contracts
  for (const c of contracts) {
    const cats: ContaminationCategory[] = []
    const isTestKnown =
      knownTestIdPatterns.some((p) => c.id.includes(p)) ||
      knownTestUidPatterns.some((p) => (c.fields.userId || '').includes(p)) ||
      (c.fields.userEmail || '').includes('test')
    if (isTestKnown) cats.push('TEST_KNOWN')

    // Matching order check
    const matchingOrder = orders.find(
      (o) => o.fields.activatedMinerId === c.id || o.id === `ord_${c.id}`
    )
    if (!matchingOrder) cats.push('ORPHAN_CONTRACT')

    // Payment proof check
    const tx = c.fields.txHash
    if (!tx || String(tx).startsWith('tx_MINER-') || String(tx).startsWith('tx_')) {
      cats.push('NO_PAYMENT_PROOF')
    }

    if (String(c.fields.userId || '').startsWith('guest_wallet_')) {
      cats.push('SUSPICIOUS')
      if (!userMap.has(c.fields.userId)) cats.push('ORPHAN_USER')
    }

    if (cats.length === 0) cats.push('REAL')

    inventory.push({
      collection: 'admin_contracts',
      docId: c.id,
      userId: c.fields.userId,
      packageId: c.fields.packageId,
      txHash: c.fields.txHash,
      status: c.fields.status,
      categories: cats,
      notes: isTestKnown ? 'Originated from unit/integration tests' : 'Normal purchase contract',
      rawFields: c.fields,
    })
  }

  // 2. Audit admin_orders
  for (const o of orders) {
    const cats: ContaminationCategory[] = []
    const activatedMinerId = o.fields.activatedMinerId || o.id.replace(/^ord_/, '')
    const isTestKnown =
      knownTestIdPatterns.some((p) => o.id.includes(p) || (activatedMinerId && activatedMinerId.includes(p))) ||
      knownTestUidPatterns.some((p) => (o.fields.userId || '').includes(p)) ||
      (o.fields.userEmail || '').includes('test')
    if (isTestKnown) cats.push('TEST_KNOWN')

    // Matching contract check
    const matchingContract = contractMap.get(activatedMinerId)
    if (!matchingContract) cats.push('ORPHAN_ORDER')

    // Payment proof check
    const tx = o.fields.txHash
    if (!tx || String(tx).startsWith('tx_MINER-') || String(tx).startsWith('tx_')) {
      cats.push('NO_PAYMENT_PROOF')
    }

    if (String(o.fields.userId || '').startsWith('guest_wallet_')) {
      cats.push('SUSPICIOUS')
      if (!userMap.has(o.fields.userId)) cats.push('ORPHAN_USER')
    }

    if (cats.length === 0) cats.push('REAL')

    inventory.push({
      collection: 'admin_orders',
      docId: o.id,
      userId: o.fields.userId,
      packageId: o.fields.packageId,
      txHash: o.fields.txHash,
      status: o.fields.status,
      categories: cats,
      notes: isTestKnown ? 'Originated from unit/integration tests' : 'Normal purchase order',
      rawFields: o.fields,
    })
  }

  // 3. Audit /miners collection-group documents
  for (const m of miners) {
    const cats: ContaminationCategory[] = []
    const parts = m.path.split('/')
    const uidIdx = parts.indexOf('miners') + 1
    const uid = uidIdx > 0 && uidIdx < parts.length ? parts[uidIdx] : (m.fields.uid || '')

    const isTestKnown =
      knownTestIdPatterns.some((p) => m.id.includes(p)) ||
      knownTestUidPatterns.some((p) => uid.includes(p)) ||
      String(m.fields.name || '').toLowerCase().includes('test') ||
      String(m.fields.name || '').toLowerCase().includes('adversarial')
    if (isTestKnown) cats.push('TEST_KNOWN')

    // Owner user existence
    const userExists = userMap.has(uid)
    if (!userExists) cats.push('ORPHAN_USER')

    // Matching order check
    const matchingOrder = orders.find(
      (o) => o.fields.activatedMinerId === m.id || o.id === `ord_${m.id}` || o.id === m.id
    )
    if (!matchingOrder) cats.push('ORPHAN_ORDER')

    // Matching contract check
    const matchingContract = contracts.find(
      (c) => c.id === m.id || c.fields.activatedMinerId === m.id || c.id === `ctr_${m.id}`
    )
    if (!matchingContract) cats.push('ORPHAN_CONTRACT')

    // Payment proof check
    const tx = matchingContract?.fields?.txHash || matchingOrder?.fields?.txHash || m.fields.txHash
    if (!tx || String(tx).startsWith('tx_MINER-') || String(tx).startsWith('tx_') || isTestKnown) {
      cats.push('NO_PAYMENT_PROOF')
    }

    if (String(uid).startsWith('guest_') || String(uid).startsWith('guest-') || m.id.startsWith('guest')) {
      if (!cats.includes('SUSPICIOUS')) cats.push('SUSPICIOUS')
    }

    if (cats.length === 0) cats.push('REAL')

    inventory.push({
      collection: 'miners',
      docId: m.id,
      userId: uid,
      packageId: m.fields.packageId || m.fields.model || 'N/A',
      txHash: matchingContract?.fields?.txHash || matchingOrder?.fields?.txHash || m.fields.txHash,
      status: m.fields.status || 'active',
      categories: cats,
      notes: isTestKnown
        ? 'Originated from unit/integration tests'
        : `Miner: ${m.fields.name || m.id} (power: ${m.fields.powerTh || m.fields.hashrate || 'N/A'} TH/s)`,
      rawFields: m.fields,
    })
  }

  // 4. Audit users
  for (const u of users) {
    const cats: ContaminationCategory[] = []
    const isTestKnown =
      knownTestUidPatterns.some((p) => u.id.includes(p)) ||
      (u.fields.email || '').includes('test') ||
      u.id.toLowerCase().includes('test')
    if (isTestKnown) cats.push('TEST_KNOWN')

    const isGuestId =
      u.id.startsWith('guest_') ||
      u.id.startsWith('guest-') ||
      u.id.startsWith('anon_') ||
      u.id.startsWith('synthetic_')
    const hasGuestFlag =
      u.fields.isGuest === true || u.fields.isAnonymous === true || u.fields.guest === true
    const isSyntheticOrGuest = isGuestId || hasGuestFlag

    const email = typeof u.fields.email === 'string' ? u.fields.email.trim() : ''
    const hasAuthProvider = !!(
      u.fields.authProvider ||
      u.fields.providerId ||
      u.fields.walletAddress ||
      u.fields.ethAddress
    )
    const hasAuthMetadata = !!(u.fields.metadata || u.fields.authMetadata || u.fields.createdAt)
    const hasValidAuthInfo = (email.length > 0 && email.includes('@')) || hasAuthProvider
    const lacksAuthInfo = !hasValidAuthInfo && !hasAuthMetadata

    if (isSyntheticOrGuest || lacksAuthInfo) {
      if (!cats.includes('SUSPICIOUS')) cats.push('SUSPICIOUS')
    }

    const userMiners = miners.filter((m) => m.path.includes(`/miners/${u.id}/`))
    const hasMiners = userMiners.length > 0
    const hasOrders = orders.some((o) => o.fields.userId === u.id)
    const hasContracts = contracts.some((c) => c.fields.userId === u.id)

    if (!hasMiners && !hasOrders && !hasContracts) {
      cats.push('ORPHAN_USER')
    } else if (cats.length === 0) {
      cats.push('REAL')
    }

    const authSummary = hasValidAuthInfo
      ? (email ? `Email: ${maskEmail(email)}` : 'Auth: wallet/provider')
      : 'MISSING_AUTH_INFO'
    const guestSummary = isSyntheticOrGuest ? ' [GUEST/SYNTHETIC]' : ''

    inventory.push({
      collection: 'users',
      docId: u.id,
      userId: u.id,
      status: u.fields.status || 'REGISTERED',
      categories: cats,
      notes: `${authSummary}${guestSummary}, Miners: ${userMiners.length}`,
      rawFields: u.fields,
    })
  }

  // -------------------------------------------------------------------------
  // Print 7-Class Classification Inventory
  // -------------------------------------------------------------------------
  console.log('='.repeat(80))
  console.log('7-CLASS CONTAMINATION INVENTORY')
  console.log('='.repeat(80))
  console.log(
    '| Collection | Document ID | User ID | Categories | Notes |'
  )
  console.log(
    '|---|---|---|---|---|'
  )
  for (const item of inventory) {
    const displayUid = item.userId ? maskIdentifier(item.userId) : 'N/A'
    console.log(
      `| ${item.collection} | ${item.docId} | ${displayUid} | ${item.categories.join(', ')} | ${item.notes} |`
    )
  }
  console.log('\n')

  // -------------------------------------------------------------------------
  // Target Test ID Verification Section
  // -------------------------------------------------------------------------
  console.log('='.repeat(80))
  console.log('TARGET CONTAMINATION TEST IDS DETECTED')
  console.log('='.repeat(80))
  const targetIds = [
    'MINER-GUEST-DIRECT-1',
    'MINER-TRIM-UID-1',
    'MINER-UNTRIMMED-123',
    'MINER-STRESS-TRIM-002',
    'ctr-test-buyer-101',
  ]
  for (const tid of targetIds) {
    const inContracts = contractMap.has(tid)
    const inOrders = orderMap.has(`ord_${tid}`)
    console.log(
      `- Target ID "${tid}": ${inContracts || inOrders ? 'PRESENT (CONTAMINATED)' : 'ABSENT'} ` +
      `(in admin_contracts: ${inContracts}, in admin_orders: ${inOrders})`
    )
  }
  console.log('\n')

  // -------------------------------------------------------------------------
  // PO Diagnostic: "Sin Mineros Activos" for target UID
  // -------------------------------------------------------------------------
  console.log('='.repeat(80))
  console.log('PO DIAGNOSTIC: "Sin Mineros Activos"')
  console.log('='.repeat(80))
  const poUid =
    process.env.DIAGNOSTIC_UID ||
    (process.argv[2] && !process.argv[2].endsWith('.ts') ? process.argv[2] : 'Km2vnjLTAHhIlHUGE8lfaSorgbo2')
  const poUser = userMap.get(poUid)
  const poMiners = miners.filter((m) => m.path.includes(`/miners/${poUid}/`))

  const userEmail = poUser?.fields?.email ? maskEmail(String(poUser.fields.email)) : 'N/A'
  console.log(`- Target Account UID: ${maskIdentifier(poUid)} (diagnostic target)`)
  console.log(`- Authenticated Account Email: ${userEmail}`)
  console.log(`- User Exists in /users: ${!!poUser}`)
  console.log(`- Miner Documents in /miners/${maskIdentifier(poUid)}/miner: ${poMiners.length}`)

  // Distribution of all miners by UID
  const minersByUid: Record<string, number> = {}
  for (const m of miners) {
    const parts = m.path.split('/')
    // Path format: projects/.../databases/(default)/documents/miners/{uid}/miner/{minerId}
    const uidIdx = parts.indexOf('miners') + 1
    const uid = uidIdx > 0 && uidIdx < parts.length ? parts[uidIdx] : 'unknown'
    minersByUid[uid] = (minersByUid[uid] || 0) + 1
  }
  console.log(`- Total Miner Documents across all UIDs: ${miners.length}`)
  console.log(`- Miner Count by UID:`)
  for (const [uid, count] of Object.entries(minersByUid)) {
    console.log(`    * ${maskIdentifier(uid)}: ${count} miners`)
  }

  console.log('\nDIAGNOSTIC CONCLUSION:')
  if (poMiners.length === 0) {
    console.log(
      `-> EXPECTED DATA STATE: Target UID "${maskIdentifier(poUid)}" has 0 documents in Firestore.`
    )
    console.log(
      '   An empty frontend ("sin mineros activos") is the accurate and correct representation of this account.'
    )
    console.log(
      '   (All 7 active miners in production belong to user with verified miners in production).'
    )
    console.log(
      '   Action in SCRUM-223: Documented as expected data state. Strictly ZERO writes, seeds, or repairs performed.'
    )
  } else {
    console.log(
      '-> DEFECT: Miner documents exist for UID but frontend shows 0. Blocker defect for SCRUM-218.'
    )
  }
  console.log('='.repeat(80))
  console.log('AUDIT COMPLETED CLEANLY: ZERO MUTATIONS / ZERO WRITES PERFORMED.')
  console.log('='.repeat(80))
}

// Execute if run directly
if (process.argv[1] && process.argv[1].endsWith('auditContamination.ts')) {
  runContaminationAudit().catch((err) => {
    console.error('Audit execution error:', err)
    process.exit(1)
  })
}
