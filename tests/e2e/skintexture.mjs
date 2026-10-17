// Cilt dokusu: npm run build && node tests/e2e/skintexture.mjs [çıktı klasörü]
// Pürüzsüzleştirilmiş yanakta yüksek frekans enerjisi doku kaydırıcısıyla geri gelmeli; orijinale yaklaşmalı.
import { _electron as electron } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const outDir = process.argv[2]
if (outDir) mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-skintx-')
mkdirSync(join(userData, 'models'), { recursive: true })
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
const r = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  S().setTab('retouch'); S().openTool('skin')
  for (let i = 0; i < 120 && !(s.faces && s.faces.length && s.seg); i++) await new Promise((r) => setTimeout(r, 250))
  const shot = async (skin) => {
    S().update((d) => { d.retouch.faces = skin ? [{ index: 0, side: 'both', shape: {}, skin, makeup: {} }] : [] })
    await new Promise((r) => setTimeout(r, 300))
    const { blob } = await s.exportBlob(S().doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 0 })
    const bmp = await createImageBitmap(blob)
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    // yanak kutusu (portrede sol yanak)
    const ch = s.faces[0][50]
    const w = Math.round(bmp.width * 0.05), h = w
    const x0 = Math.round(ch.x * bmp.width - w / 2), y0 = Math.round(ch.y * bmp.height - h / 2)
    const d = ctx.getImageData(x0, y0, w, h)
    const g = (x, y) => d.data[(y * w + x) * 4 + 1]
    let e = 0, n = 0
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const v = 4 * g(x, y) - g(x - 1, y) - g(x + 1, y) - g(x, y - 1) - g(x, y + 1); e += v * v; n++ }
    const cut = new OffscreenCanvas(w * 4, h * 4)
    const cc = cut.getContext('2d'); cc.imageSmoothingEnabled = false; cc.drawImage(c, x0, y0, w, h, 0, 0, w * 4, h * 4)
    const b = await cut.convertToBlob({ type: 'image/png' })
    const u = new Uint8Array(await b.arrayBuffer()); let t = ''
    for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return { e: Math.round(e / n), png: btoa(t) }
  }
  const orig = await shot(null)
  const smooth = await shot({ smooth: 80 })
  const tex = await shot({ smooth: 80, texture: 60 })
  return { orig, smooth, tex }
})
if (outDir) for (const k of ['orig', 'smooth', 'tex']) writeFileSync(join(outDir, `doku-${k}.png`), Buffer.from(r[k].png, 'base64'))
ok('Pürüzsüzleştirme dokuyu siliyor', r.smooth.e < r.orig.e * 0.7, `orijinal ${r.orig.e} → pürüzsüz ${r.smooth.e}`)
ok('Doku kaydırıcısı dokuyu geri getiriyor', r.tex.e > r.smooth.e * 1.2 && r.tex.e < r.orig.e * 1.3, `pürüzsüz ${r.smooth.e} → doku ${r.tex.e}`)
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
