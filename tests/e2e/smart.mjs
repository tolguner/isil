// Akıllı işler: npm run build && node tests/e2e/smart.mjs
// Tek dokunuş öneri kartı (ciddi ifade), selfie düzeltme (burun küçülür), karşı ışık/gece (yüze yerel aydınlatma).
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const userData = tempDir('isil-smart-')
mkdirSync(join(userData, 'models'), { recursive: true })
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const S = (await window.__isil.store()).getState(); S.setTab('retouch'); S.openTool('beauty')
  for (let i = 0; i < 100 && !(s.faces && s.faces.length); i++) await new Promise((r) => setTimeout(r, 100))
})
await win.waitForTimeout(800)
const hint = await win.locator('.hint-card').innerText().catch(() => '')
ok('Ciddi ifadede gülümseme önerisi çıkıyor', /ciddi/i.test(hint) && /gülümset/i.test(hint), hint.replace(/\n/g, ' | '))
await win.locator('.hint-card .icon-btn').click()
await win.waitForTimeout(200)
ok('Öneri kapatılınca gizleniyor', (await win.locator('.hint-card').count()) === 0)
// selfie düzeltme: burun genişliği / yüz genişliği küçülmeli
const nose = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  const v = await window.__isil.mod('vision')
  S().closeTool(true)
  const meas = async (shape) => {
    S().update((d) => { d.retouch.faces = [{ index: 0, side: 'both', shape, skin: {}, makeup: {} }] })
    await new Promise((r) => setTimeout(r, 900))
    const c = document.querySelector('canvas'); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0)
    const lm = (await v.detectFaces(t))[0]
    const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * t.width, (lm[a].y - lm[b].y) * t.height)
    return d(129, 358) / d(234, 454)
  }
  return { orig: +(await meas({})).toFixed(4), fix: +(await meas({ selfie: 100 })).toFixed(4) }
})
ok('Selfie düzeltme burnu yüze göre küçültüyor', nose.fix < nose.orig * 0.97, JSON.stringify(nose))
// gece modu: pozlama artar, yüz karanlıksa yerel nokta eklenir
await win.evaluate(async () => { const S = (await window.__isil.store()).getState(); S.update((d) => { d.retouch.faces = [] }); S.setTab('adjust'); S.openTool('auto') })
await win.waitForTimeout(500)
await win.getByRole('button', { name: 'Gece', exact: true }).click()
await win.waitForTimeout(800)
const night = await win.evaluate(async () => { const d = (await window.__isil.store()).getState().doc; return { exp: d.adjust.exposure, local: (d.local ?? []).map((p) => ({ id: p.id, b: p.adj.b, r: +p.r.toFixed(2) })) } })
ok('Gece modu uygulanıyor', night.exp > 0, JSON.stringify(night))
await win.getByRole('button', { name: 'Karşı ışık', exact: true }).click()
await win.waitForTimeout(800)
const back = await win.evaluate(async () => { const d = (await window.__isil.store()).getState().doc; return { sh: d.adjust.shadows, local: (d.local ?? []).filter((p) => p.id.startsWith('auto-face')).length } })
ok('Karşı ışık yalnız bir yüz noktası tutuyor (eski silinir)', back.sh > 0 && back.local <= 1, JSON.stringify(back))
// karanlık portre (isteğe bağlı görsel): karşı ışıkta yüze yerel aydınlatma noktası eklenir
const dark = process.argv[2]
if (dark) {
  await win.evaluate(async () => (await window.__isil.store()).getState().closeTool(false))
  await win.evaluate(async ({ b64 }) => window.__isil.openFile('karanlik.jpg', b64), { b64: readFileSync(dark).toString('base64') })
  await win.evaluate(async () => {
    const s = (await window.__isil.mod('session')).session
    for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
    const S = (await window.__isil.store()).getState(); S.setTab('adjust'); S.openTool('auto')
  })
  await win.waitForTimeout(800)
  await win.getByRole('button', { name: 'Karşı ışık', exact: true }).click()
  await win.waitForTimeout(1500)
  const pt = await win.evaluate(async () => ((await window.__isil.store()).getState().doc.local ?? []).filter((p) => p.id.startsWith('auto-face')).map((p) => ({ b: p.adj.b, r: +p.r.toFixed(2), x: +p.x.toFixed(2), y: +p.y.toFixed(2) })))
  ok('Karanlık yüzde karşı ışık yüze yerel aydınlatma ekliyor', pt.length === 1 && pt[0].b > 10, JSON.stringify(pt))
}
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
