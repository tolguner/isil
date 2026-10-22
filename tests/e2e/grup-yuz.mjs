// Kalabalık grup: 8'den sonraki bir yüze ayrı rötuş verilebilmeli (16 yüz yuvası), diğer yüzler etkilenmemeli.
// node tests/e2e/grup-yuz.mjs <grup fotoğrafı>
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const file = process.argv[2]
const userData = tempDir('isil-grup-')
mkdirSync(join(userData, 'models'), { recursive: true })
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const results = []
const check = (name, ok, info = '') => { results.push(ok); console.log(ok ? 'GEÇTİ ' : 'KALDI ', name, info) }

await win.evaluate(async ({ b64, name }) => window.__isil.openFile(name, b64), { b64: readFileSync(file).toString('base64'), name: basename(file) })
win.on('console', (m) => { if (m.type() === 'error') console.log('KONSOL', m.text().slice(0, 300)) })
const r = await win.evaluate(async (minI) => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 300 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const faces = await s.ensureFaces()
  await s.ensureSeg().catch(() => null)
  const geos = s.faceGeos()
  // en büyük yüzlerden 12. sıradakini seç (8'in ötesinde bir yuva)
  const order = geos.map((g, i) => ({ i, w: g.width })).sort((a, b) => b.w - a.w)
  const target = order.find((o) => o.i >= minI && o.i < 16).i // 8. yuvanın ötesinde en büyük yüz
  const other = order.find((o) => o.i !== target).i
  const exportPx = async (edit) => {
    const doc = structuredClone(S().doc)
    doc.retouch.faces = edit ? [{ index: target, side: 'both', shape: {}, skin: {}, makeup: { lip: { preset: 'gloss', amount: 100, color: '#00c040' } } }] : []
    const { blob } = await s.exportBlob(doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 0 })
    const bm = await createImageBitmap(blob)
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0)
    return c.getContext('2d').getImageData(0, 0, c.width, c.height)
  }
  const a = await exportPx(false), b = await exportPx(true)
  const diffIn = (g) => {
    const x0 = Math.max(0, Math.round((g.center.x - g.width / 2))), x1 = Math.min(a.width, Math.round(g.center.x + g.width / 2))
    const y0 = Math.max(0, Math.round(g.center.y - g.width / 2)), y1 = Math.min(a.height, Math.round(g.center.y + g.width * 0.7))
    let d = 0, n = 0, mx = 0 // RGB toplam farkı 30'u aşan pikseller
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * a.width + x) * 4; const dd = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]); if (dd > mx) mx = dd; if (dd > 30) d++; n++ }
    return (100 * d) / Math.max(1, n) // değişen piksel yüzdesi
  }
  const crop = (img, g) => { const c = document.createElement('canvas'); const w = Math.round(g.width * 2); c.width = c.height = w; const t = document.createElement('canvas'); t.width = img.width; t.height = img.height; t.getContext('2d').putImageData(img, 0, 0); c.getContext('2d').drawImage(t, g.center.x - w / 2, g.center.y - w / 2, w, w, 0, 0, w, w); return c.toDataURL('image/png') }
  window.__crops = [crop(a, geos[target]), crop(b, geos[target])]
  return { faces: faces.length, target, tDiff: +diffIn(geos[target]).toFixed(2), oDiff: +diffIn(geos[other]).toFixed(2) }
}, Number(process.env.MINI ?? 8))
const crops = await win.evaluate(() => window.__crops)
if (process.env.CROP_OUT) crops.forEach((d, i) => writeFileSync(process.env.CROP_OUT + i + '.png', Buffer.from(d.split(',')[1], 'base64')))
check('8. yuvanın ötesindeki yüze ayrı ruj uygulandı', r.tDiff > 0.2, JSON.stringify(r))
check('Başka yüz etkilenmedi', r.oDiff < 0.2)
await app.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} geçti`)
process.exit(results.every(Boolean) ? 0 : 1)
