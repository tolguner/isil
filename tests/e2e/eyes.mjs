// Göz makyajı: npm run build && node tests/e2e/eyes.mjs [çıktı klasörü]
// Kalem, kirpik, çift kapak, göz rengi ve ışıltı ayrı ayrı uygulanır; değişim göz bölgesinde kalmalı.
import { _electron as electron } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const outDir = process.argv[2]
if (outDir) mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-eyes-')
mkdirSync(join(userData, 'models'), { recursive: true })
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const S = (await window.__isil.store()).getState(); S.setTab('retouch'); S.openTool('makeup')
  for (let i = 0; i < 100 && !(s.faces && s.faces.length); i++) await new Promise((r) => setTimeout(r, 100))
  S.closeTool(true)
})
const cases = {
  orig: {},
  liner: { liner: { preset: 'wing', amount: 80, color: '#141012' } },
  lash: { lash: { preset: 'volume', amount: 80, color: '#120e0c' } },
  crease: { crease: { preset: null, amount: 80 } },
  iris: { iris: { preset: null, amount: 70, color: '#3a7bd5' } },
  catch: { catch: { preset: 'dot', amount: 90 } },
  all: { liner: { preset: 'wing', amount: 70, color: '#141012' }, lash: { preset: 'natural', amount: 70 }, crease: { preset: null, amount: 50 }, iris: { preset: null, amount: 55, color: '#5a8a4a' }, catch: { preset: 'dot', amount: 80 } }
}
const shots = {}
for (const [k, makeup] of Object.entries(cases)) {
  const r = await win.evaluate(async (makeup) => {
    const S = (await window.__isil.store()).getState
    const s = (await window.__isil.mod('session')).session
    S().update((d) => { d.retouch.faces = [{ index: 0, side: 'both', shape: {}, skin: {}, makeup }] })
    const { blob, w, h } = await s.exportBlob(S().doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 0 })
    const bm = await createImageBitmap(blob)
    const g = s.faceGeos(bm.width, bm.height)[0]
    const F = await window.__isil.mod('face')
    const eyes = [...F.EYE_R, ...F.EYE_L, ...F.BROW_R, ...F.BROW_L].map((i) => g.p(i))
    const x0 = Math.min(...eyes.map((p) => p.x)) - g.width * 0.08, x1 = Math.max(...eyes.map((p) => p.x)) + g.width * 0.08
    const y0 = Math.min(...eyes.map((p) => p.y)) - g.width * 0.05, y1 = Math.max(...eyes.map((p) => p.y)) + g.width * 0.12
    const c = document.createElement('canvas'); c.width = Math.round(x1 - x0); c.height = Math.round(y1 - y0)
    c.getContext('2d').drawImage(bm, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height)
    const full = document.createElement('canvas'); full.width = bm.width; full.height = bm.height; full.getContext('2d').drawImage(bm, 0, 0)
    const px = full.getContext('2d').getImageData(0, 0, full.width, full.height).data
    window.__px = window.__px || {}; window.__px.box = [x0, y0, x1, y1]
    const prev = window.__orig
    let inD = 0, inN = 0, outC = 0, outN = 0
    if (prev) for (let y = 0; y < full.height; y += 2) for (let x = 0; x < full.width; x += 2) {
      const i = (y * full.width + x) * 4, d = Math.abs(px[i] - prev[i]) + Math.abs(px[i + 1] - prev[i + 1]) + Math.abs(px[i + 2] - prev[i + 2])
      if (x > x0 && x < x1 && y > y0 && y < y1) { inD += d; inN++ } else { outC += d > 12 ? 1 : 0; outN++ }
    } else window.__orig = px
    const bl = await new Promise((r) => c.toBlob(r, 'image/png')); const u = new Uint8Array(await bl.arrayBuffer()); let s2 = ''; for (let i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return { crop: btoa(s2), inside: inN ? Math.round(inD / inN * 100) / 100 : 0, outside: outN ? Math.round(outC / outN * 10000) / 100 : 0 }
  }, makeup)
  shots[k] = r
  if (outDir) writeFileSync(join(outDir, `${k}.png`), Buffer.from(r.crop, 'base64'))
  if (k !== 'orig') ok(`${k}: göz bölgesinde değişim var, dışında yok`, r.inside > 0.15 && r.outside < 0.05, JSON.stringify({ inside: r.inside, outside: r.outside }))
}
// arayüz: Makyaj → Kalem sekmesi, Kanat stili ve renk belgeye yazılıyor
await win.evaluate(async () => { const S = (await window.__isil.store()).getState(); S.update((d) => { d.retouch.faces = [] }); S.setTab('retouch'); S.openTool('makeup') })
await win.waitForTimeout(600)
const tabs = await win.locator('.panel [role="tab"]').allInnerTexts()
await win.getByRole('tab', { name: 'Kalem' }).click()
await win.getByRole('button', { name: 'Kanat', exact: true }).click()
await win.waitForTimeout(300)
const mk = await win.evaluate(async () => (await window.__isil.store()).getState().doc.retouch.faces[0]?.makeup?.liner)
ok('Göz sekmeleri var, stil seçimi belgeye yazılıyor', ['Kalem', 'Kirpik', 'Çift kapak', 'Göz rengi', 'Işıltı'].every((t) => tabs.includes(t)) && mk?.preset === 'wing' && mk?.amount > 0, JSON.stringify({ tabs, mk }))
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
