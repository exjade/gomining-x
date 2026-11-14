import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const appSource = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8')
const styleSource = fs.readFileSync(path.join(projectRoot, 'src/styles.css'), 'utf8')

test('SCRUM-265 keeps authenticated and demo UI state separate', () => {
  assert.match(appSource, /const isAuthenticated = Boolean\(user && !user\.isAnonymous\)/)
  assert.match(appSource, /isAuthenticated \? \(profile \? formatWalletBalance\(profile\.balance\) : 'no disponible'\) : formatWalletBalance\(demo\.balance\)/)
  assert.match(appSource, /header-balance-label">\{isAuthenticated \? 'SALDO' : 'LOCAL'\}/)
  const headerBalance = appSource.match(/className="header-balance"[\s\S]*?<\/Link>/)?.[0] ?? ''
  assert.match(headerBalance, /to=\{isAuthenticated \? '\/profile' : '\/finance\/wallets\/virtual'\}/)
  assert.doesNotMatch(headerBalance, /to="\/finance\/wallets\/virtual"/)
  assert.match(appSource, /badge=\{isAuth \? undefined : 'LOCAL'\}/)
  assert.match(appSource, /badge\?: string/)
  assert.match(appSource, /\{badge && <span className="explore-badge">\{badge\}<\/span>\}/)
  assert.doesNotMatch(appSource, /badge="LOCAL" onClick=\{openMinerBuilder\}/)
  assert.match(appSource, /isAuth \? \(isEn \? 'PLATFORM BALANCE' : 'SALDO DE PLATAFORMA'\) : \(isEn \? 'LOCAL BALANCE' : 'SALDO LOCAL'\)/)
  assert.match(appSource, /<h1>\{isAuth \? \(profile \? formatWalletBalance\(profile\.balance\) : '—'\) : formatWalletBalance\(demo\.balance\)\}<\/h1>/)
  assert.match(appSource, /\{user && !isAuthenticated && \(\s*<div className="replica-note">/)
  assert.match(appSource, /<SessionActivity isAuth=\{isAuthenticated\} items=\{sessionEvents\} \/>/)
  assert.match(appSource, /isAuth \? 'Actividad de esta sesión' : 'Actividad simulada en esta sesión'/)
  assert.match(appSource, /isAuth \? 'Acciones recientes registradas durante esta sesión\.' : 'Se borra al recargar la página\.'/)
  assert.doesNotMatch(appSource, /Eventos recientes de tu cuenta\./)
  assert.match(appSource, /!isAuthenticated \|\| \(pathname !== '\/profile' && pathname !== '\/nft-miners'\)/)
  assert.match(appSource, /date\.toLocaleString\(undefined, \{ dateStyle: 'medium', timeStyle: 'short' \}\)/)
  assert.match(appSource, /totalMinersCount === 1 \? 'minero' : 'mineros'/)
  assert.match(appSource, /miner\.isReal \? formatMinerAcquiredAt\(miner\.acquiredAt\) : `local \$\{miner\.acquiredAt\}`/)
  assert.match(appSource, /'Actividad simulada en esta sesión'/)
  assert.match(appSource, /'Se borra al recargar la página\.'/)
})

test('SCRUM-265 makes the miner workflow and receipt content-sized with scroll safety', () => {
  const modalRule = styleSource.match(/\.purchase-modal\.miner-builder-modal \{[\s\S]*?\r?\n\}/)?.[0] ?? ''
  const mobileRule = styleSource.match(/\.purchase-modal\.miner-builder-modal,\r?\n  \.purchase-modal\.miner-builder-modal-custom,\r?\n  \.purchase-modal\.miner-builder-modal-workflow \{[\s\S]*?\r?\n  \}/)?.[0] ?? ''

  assert.match(modalRule, /height: auto/)
  assert.match(modalRule, /max-height: min\(92vh, 860px\)/)
  assert.match(modalRule, /overflow-y: auto/)
  assert.match(mobileRule, /height: auto/)
  assert.match(mobileRule, /max-height: 92dvh/)
})
