import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const EXPECTED_RULES_SHA256 = 'F4313C04DD7595E1C84D8977299169EEA38C2B250F96E6916D68959CDAAA6779'

function readText(relPath: string): string {
  return fs.readFileSync(path.resolve(projectRoot, relPath), 'utf8')
}

function extractFunctionBlock(src: string, signature: string): string {
  const start = src.indexOf(signature)
  assert.notEqual(start, -1, `Expected to find "${signature}"`)
  const openBrace = src.indexOf('{', start)
  assert.notEqual(openBrace, -1, `Expected opening brace for "${signature}"`)
  let depth = 0
  for (let i = openBrace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1
    else if (src[i] === '}') {
      depth -= 1
      if (depth === 0) {
        return src.slice(start, i + 1)
      }
    }
  }
  throw new Error(`Unclosed block for "${signature}"`)
}

describe('SCRUM-374: Client UserProfile status persistence & firestore.rules parity', () => {
  it('1. Declares AccountStatus union and status?: AccountStatus on UserProfile in src/firebase.ts', () => {
    const firebaseSrc = readText('src/firebase.ts')
    assert.match(
      firebaseSrc,
      /export\s+type\s+AccountStatus\s*=\s*'active'\s*\|\s*'inactive'\s*\|\s*'suspended'\s*\|\s*'blocked'/,
      'src/firebase.ts must export canonical AccountStatus type',
    )
    const userProfileBlock = extractFunctionBlock(firebaseSrc, 'export interface UserProfile')
    assert.match(
      userProfileBlock,
      /\bstatus\?:\s*AccountStatus\b/,
      'UserProfile must declare optional status?: AccountStatus',
    )
  })

  it('2. Persists status: "active" in registerWithEmail and ensureUserProfile initial userDoc only', () => {
    const firebaseSrc = readText('src/firebase.ts')

    const registerBlock = extractFunctionBlock(firebaseSrc, 'export async function registerWithEmail')
    const registerUserDocStart = registerBlock.indexOf('const userDoc: UserProfile = {')
    assert.notEqual(registerUserDocStart, -1, 'registerWithEmail must define userDoc: UserProfile')
    const registerUserDocBlock = extractFunctionBlock(registerBlock, 'const userDoc: UserProfile =')
    assert.match(
      registerUserDocBlock,
      /\bstatus:\s*'active'\s*,/,
      "registerWithEmail userDoc must persist status: 'active'",
    )

    const ensureBlock = extractFunctionBlock(firebaseSrc, 'export async function ensureUserProfile')
    const ensureUserDocBlock = extractFunctionBlock(ensureBlock, 'const userDoc: UserProfile =')
    assert.match(
      ensureUserDocBlock,
      /\bstatus:\s*'active'\s*,/,
      "ensureUserProfile userDoc must persist status: 'active'",
    )

    // Existing profile path in ensureUserProfile must not overwrite status via updateDoc
    const existingBranchEnd = ensureBlock.indexOf('return existing')
    assert.notEqual(existingBranchEnd, -1)
    const existingBranch = ensureBlock.slice(0, existingBranchEnd)
    assert.equal(
      /\bstatus\s*:/.test(existingBranch),
      false,
      'ensureUserProfile existing-profile branch must not write status',
    )

    // updateUserProfile and reloadCurrentUser must never inject status mutations
    const updateProfileBlock = extractFunctionBlock(firebaseSrc, 'export async function updateUserProfile')
    assert.equal(
      /\bstatus\s*:/.test(updateProfileBlock),
      false,
      'updateUserProfile must not inject status writes',
    )
    const reloadBlock = extractFunctionBlock(firebaseSrc, 'export async function reloadCurrentUser')
    assert.equal(
      /\bstatus\s*:/.test(reloadBlock),
      false,
      'reloadCurrentUser must not write status',
    )
  })

  it('3. Protects status in firestore.rules (pure LF, touchesProtectedFinancialFields + validInitialUserFinancialFields + SHA-256 parity)', () => {
    const rulesRaw = fs.readFileSync(path.resolve(projectRoot, 'firestore.rules'))
    assert.equal(rulesRaw.includes(0x0d), false, 'firestore.rules must be pure LF (HAS_CR=false)')

    const rulesText = rulesRaw.toString('utf8')
    const protectedBlock = extractFunctionBlock(rulesText, 'function touchesProtectedFinancialFields()')
    assert.match(
      protectedBlock,
      /'status'/,
      "touchesProtectedFinancialFields() must include 'status' to block client self-reactivation",
    )

    const initialBlock = extractFunctionBlock(rulesText, 'function validInitialUserFinancialFields()')
    assert.match(
      initialBlock,
      /!\('status' in request\.resource\.data\)\s*\|\|\s*request\.resource\.data\.status == 'active'/,
      "validInitialUserFinancialFields() must permit only omitted status or 'active'",
    )

    const actualSha256 = crypto.createHash('sha256').update(rulesRaw).digest('hex').toUpperCase()
    assert.equal(actualSha256, EXPECTED_RULES_SHA256, 'firestore.rules LF SHA-256 must match SCRUM-374 canonical pin')
  })
})
