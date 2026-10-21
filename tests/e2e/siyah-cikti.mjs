// Siyah dışa aktarma denetimi: büyük portrede tam makyajı tam çözünürlükte dışa aktar, çıktı siyah olmamalı;
// ardından başka bir fotoğrafta yüz bulma çalışmaya devam etmeli.
// node tests/e2e/siyah-cikti.mjs <büyük portre> <ikinci fotoğraf>
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const [a, b] = process.argv.slice(2)
const userData = tempDir('isil-siyah-')
mkdirSync(join(userData, 'models'), { recursive: true })
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const results = []
const check = (name, ok, info = '') => { results.push(ok); console.log(ok ? 'GEÇTİ ' : 'KALDI ', name, info) }
const open = (f) => win.evaluate(async ({ b64, name }) => {
  await window.__isil.openFile(name, b64)
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 300 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const f = await s.ensureFaces()
  await s.ensureSeg().catch(() => null)
  return { W: s.W, H: s.H, faces: f.length }
}, { b64: readFileSync(f).toString('base64'), name: basename(f) })

const i1 = await open(a)
console.log('1.', JSON.stringify(i1))
for (let round = 0; round < 3; round++) {
  const r = await win.evaluate(async () => {
    const S = (await window.__isil.store()).getState
    const s = (await window.__isil.mod('session')).session
    const n = s.faces?.length ?? 0
    S().update((d) => {
      d.retouch.faces = Array.from({ length: n }, (_, i) => ({ index: i, side: 'both', shape: {}, skin: { smooth: 40, texture: 30 }, makeup: {
        lip: { preset: 'gloss', amount: 60, color: '#b8324a' }, blush: { preset: null, amount: 40, color: '#f08a8a' }, freckle: { preset: null, amount: 60 },
        liner: { preset: 'wing', amount: 70, color: '#141012' }, lash: { preset: 'natural', amount: 70 }, lid: { preset: null, amount: 40, color: '#8a5a7a' },
        catch: { preset: 'dot', amount: 80 }, iris: { preset: null, amount: 45, color: '#4f9fd0' }, brow: { preset: null, amount: 40, color: '#4a3426' }, mole: { preset: null, amount: 60 } } }))
    })
    const t0 = performance.now()
    const out = await s.exportBlob(S().doc, { exportFormat: 'jpeg', exportQuality: 90, exportMaxSide: 0 })
    const ms = Math.round(performance.now() - t0)
    const bmp = await createImageBitmap(out.blob)
    const c = document.createElement('canvas'); c.width = 200; c.height = 200
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, 200, 200)
    const d = x.getImageData(0, 0, 200, 200).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2]
    return { w: out.w, h: out.h, ms, mean: +(sum / (d.length / 4) / 3).toFixed(1) }
  })
  check(`Tam makyaj tam çözünürlük dışa aktarma ${round + 1}: siyah değil`, r.mean > 20, JSON.stringify(r))
}
const i2 = await open(b)
check('Sonraki fotoğrafta yüz bulma çalışıyor', i2.faces > 0, JSON.stringify(i2))
const i3 = await open(a)
check('İlk fotoğrafa dönünce yüz bulunuyor', i3.faces > 0, JSON.stringify(i3))
await app.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} geçti`)
process.exit(results.every(Boolean) ? 0 : 1)
