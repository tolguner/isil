// Şablonlar: her şablon uygulanır, tuval oranı ve fotoğraf kutusu doğru, metinler tuvalde, kayıt/dışa aktarma bozulmaz.
//   npm run build && node tests/e2e/templates.mjs [ekran görüntüsü klasörü]
import { _electron as electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const shots = process.argv[2]
const userData = tempDir('isil-tpl-')
mkdirSync(join(userData, 'models'), { recursive: true })
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
if (shots) { await win.waitForTimeout(1200); await win.locator('.tpl-row').scrollIntoViewIfNeeded(); await win.waitForTimeout(300); await win.screenshot({ path: join(shots, 'tpl-home.png') }) }
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
})
await win.evaluate(async () => { const S = (await window.__isil.store()).getState(); S.closeTool(true); S.setTab('recipes'); S.openTool('templates') })
await win.waitForTimeout(600)
const ids = await win.evaluate(async () => (await window.__isil.mod('templates')).TEMPLATES.map((t) => t.id))
let bad = []
for (const id of ids) {
  const r = await win.evaluate(async (id) => {
    const m = await window.__isil.mod('templates')
    const S = (await window.__isil.store()).getState
    const s = (await window.__isil.mod('session')).session
    await m.applyTemplateById(id)
    await new Promise((r) => setTimeout(r, 600))
    const t = m.TEMPLATES.find((x) => x.id === id)
    const [a, b] = t.ratio.split(':').map(Number)
    const out = s.lastOut
    const d = S().doc
    const tl = d.layers.filter((l) => l.props.template)
    // metinler tuval içinde mi (merkez ve ölçek)
    const inside = tl.every((l) => l.x > 0 && l.x < 1 && l.y > 0 && l.y < 1 && l.scale > 0.3)
    return { ratio: out.w / out.h, want: a / b, layers: tl.length, want2: t.texts.length + (t.shapes?.length ?? 0), inside, box: d.background.box, place: out.place }
  }, id)
  const pass = Math.abs(r.ratio - r.want) < 0.01 && r.layers === r.want2 && r.inside
  if (!pass) bad.push({ id, ...r })
  if (shots) await win.screenshot({ path: join(shots, `tpl-${id}.png`) })
}
ok('Tüm şablonlar doğru oran ve katmanla uygulanıyor', bad.length === 0, bad.length ? JSON.stringify(bad).slice(0, 400) : `${ids.length} şablon`)
// fotoğraf kutuyu dolduruyor (kırpma kutunun oranında)
const fill = await win.evaluate(async () => {
  const m = await window.__isil.mod('templates')
  const s = (await window.__isil.mod('session')).session
  await m.applyTemplateById('story-pastel')
  await new Promise((r) => setTimeout(r, 600))
  return { place: s.lastOut.place, box: m.TEMPLATES.find((x) => x.id === 'story-pastel').box }
})
const err = fill.place && fill.box ? Math.max(...fill.box.map((v, i) => Math.abs(v - fill.place[i]))) : 1
ok('Fotoğraf şablon kutusunu dolduruyor', err < 0.01, JSON.stringify(fill))
// başka şablona geçince eski şablon katmanları kalmıyor; kullanıcı katmanı korunuyor
const keep = await win.evaluate(async () => {
  const m = await window.__isil.mod('templates')
  const S = (await window.__isil.store()).getState
  S().update((d) => void d.layers.push({ id: 'benim', type: 'text', x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, props: { text: 'X', font: 'Inter', weight: 700, size: 0.05, color: '#fff', opacity: 1, align: 'center' } }))
  await m.applyTemplateById('event')
  const d = S().doc
  return { mine: d.layers.some((l) => l.id === 'benim'), tpl: [...new Set(d.layers.filter((l) => l.props.template).map((l) => l.props.template))] }
})
ok('Şablon değişince yalnız şablon katmanları değişiyor', keep.mine && keep.tpl.length === 1 && keep.tpl[0] === 'event', JSON.stringify(keep))
// Arka plan oranı değişince kutu kalkıyor
const reset = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  S().update((d) => { d.background.ratio = '1:1'; d.background.box = null })
  await new Promise((r) => setTimeout(r, 400))
  return (await window.__isil.mod('session')).session.lastOut.place
})
ok('Kutu kalkınca fotoğraf yeniden ortalanıyor', Math.abs(reset[0] + reset[2] / 2 - 0.5) < 0.01 && Math.abs(reset[1] + reset[3] / 2 - 0.5) < 0.01, JSON.stringify(reset))
// dışa aktarma şablon oranında
const exp = await win.evaluate(async () => {
  const m = await window.__isil.mod('templates')
  await m.applyTemplateById('story-night')
  const s = (await window.__isil.mod('session')).session
  const S = (await window.__isil.store()).getState
  const r = await s.exportBlob(S().doc, { exportFormat: 'jpeg', exportQuality: 90, exportMaxSide: 1920 })
  return { w: r.w, h: r.h, kb: Math.round(r.blob.size / 1024) }
}).catch((e) => ({ err: String(e).slice(0, 200) }))
ok('Dışa aktarma şablon oranında (9:16)', !exp.err && Math.abs(exp.w / exp.h - 9 / 16) < 0.01, JSON.stringify(exp))
// geri al tek adım
const undo = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const before = S().doc.background.ratio
  S().undo()
  return { before, after: S().doc.background.ratio }
})
ok('Geri al şablonu tek adımda kaldırıyor', undo.before === '9:16' && undo.after !== '9:16', JSON.stringify(undo))
if (shots) {
  await win.evaluate(async () => { const S = (await window.__isil.store()).getState(); S.closeTool(true); S.setTab('recipes'); S.openTool('templates') })
  await win.waitForTimeout(600)
  await win.screenshot({ path: join(shots, 'tpl-panel.png') })
}
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
