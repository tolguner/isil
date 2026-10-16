// Üretken silme kıyası (LaMa / FLUX): npm run build && node tests/e2e/gen-erase.mjs <görsel> <kişi no> [çıktı klasörü]
// Görseldeki <kişi no>. kişiyi (soldan sağa) iki yöntemle siler; sonuçları ve süreleri yazar. Yerel YZ motoru gerekir.
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [img, idx = '0', outDir = join(root, 'tests', 'fixtures', 'out')] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-generase-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
if (!existsSync(join(dev, 'engine', 'python', '.ok'))) { console.log('ATLANDI: motor yok'); process.exit(0) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData, ISIL_ENGINE_DIR: join(dev, 'engine') } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const r = await win.evaluate(async ({ b64, name, idx }) => {
  const s = (await window.__isil.mod('session')).session
  const v = await window.__isil.mod('vision')
  const ops = await window.__isil.mod('ops')
  const gen = await window.__isil.mod('generative')
  await window.__isil.openFile(name, b64)
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const full = await s.fullBase()
  const src = document.createElement('canvas')
  src.width = full.width; src.height = full.height
  src.getContext('2d').drawImage(full, 0, 0)
  const boxes = (await v.detectPeople(s.preview)).sort((a, b) => b.h - a.h).slice(0, 6).sort((a, b) => a.x - b.x)
  const b = boxes[Number(idx)]
  const m = await v.personMaskInBox(s.preview, b, src.width, src.height)
  const mc = document.createElement('canvas')
  mc.width = src.width; mc.height = src.height
  const mctx = mc.getContext('2d')
  const id = mctx.createImageData(src.width, src.height)
  for (let i = 0; i < m.length; i++) { const g = m[i] > 0.4 ? 255 : 0; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g; id.data[i * 4 + 3] = 255 }
  mctx.putImageData(id, 0, 0)
  mctx.filter = `blur(${Math.round(src.width / 250)}px)`
  mctx.drawImage(mc, 0, 0); mctx.drawImage(mc, 0, 0)
  const enc = async (c) => {
    const pad = 0.6
    const x0 = Math.max(0, (b.x - b.w * pad) * c.width), y0 = Math.max(0, (b.y - b.h * 0.2) * c.height)
    const w = Math.min(c.width - x0, b.w * (1 + 2 * pad) * c.width), h = Math.min(c.height - y0, b.h * 1.5 * c.height)
    const t = document.createElement('canvas'); t.width = Math.round(w); t.height = Math.round(h)
    t.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, t.width, t.height)
    const bl = await new Promise((r) => t.toBlob(r, 'image/jpeg', 0.9))
    const u = new Uint8Array(await bl.arrayBuffer()); let s2 = ''
    for (let i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s2)
  }
  let t0 = performance.now()
  const lama = await ops.inpaint(src, mc, { shadow: true })
  const lamaMs = Math.round(performance.now() - t0)
  t0 = performance.now()
  const flux = await gen.generativeErase(src, mc, { shadow: true })
  const fluxMs = Math.round(performance.now() - t0)
  return { lamaMs, fluxMs, orig: await enc(src), lama: await enc(lama), flux: await enc(flux) }
}, { b64: readFileSync(img).toString('base64'), name: basename(img), idx })
for (const k of ['orig', 'lama', 'flux']) writeFileSync(join(outDir, `uretken-${k}.jpg`), Buffer.from(r[k], 'base64'))
console.log(JSON.stringify({ lamaMs: r.lamaMs, fluxMs: r.fluxMs, hata: errors.length }))
await app.close()
