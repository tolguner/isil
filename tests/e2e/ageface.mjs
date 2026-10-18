// Yaş ve ifade dönüşümü Ar-Ge düzeneği: npm run build && node tests/e2e/ageface.mjs <görsel> <çıktı klasörü> [değişimler] [güç]
// Her dönüşümü uygular; sonuç PNG'lerini, yüz kırpımlarını ve 5 nokta yüz işaretlerini (kimlik ölçümü için) yazar.
// Kimlik benzerliği uygulama dışında ölçülür (isil-olcum/kimlik/benzerlik.py, ArcFace). Yerel YZ motoru gerekir.
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [img, outDir, which = 'smile,grin,neutral,eyes,younger,older,elderly', strength] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-ageface-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
if (!existsSync(join(dev, 'engine', 'python', '.ok'))) { console.log('ATLANDI: motor yok'); process.exit(0) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData, ISIL_ENGINE_DIR: join(dev, 'engine') } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(async ({ b64, name }) => {
  const s = (await window.__isil.mod('session')).session
  await window.__isil.openFile(name, b64)
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
}, { b64: readFileSync(img).toString('base64'), name: basename(img) })
const meta = {}
for (const ch of ['orig', ...which.split(',')]) {
  const r = await win.evaluate(async ({ ch, strength }) => {
    const s = (await window.__isil.mod('session')).session
    const v = await window.__isil.mod('vision')
    const A = await window.__isil.mod('ageface')
    const F = await window.__isil.mod('face')
    const full = await s.fullBase()
    const W = full.width, H = full.height
    const lm0 = (await v.detectFaces(full))[0]
    const g = new F.FaceGeo(lm0, W, H)
    const t0 = performance.now()
    const out = ch === 'orig' ? (() => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(full, 0, 0); return c })() : await A.changeFace(full, g, ch, strength ? Number(strength) : undefined)
    const ms = Math.round(performance.now() - t0)
    if (!out) return { err: 'sonuç yok' }
    const lm = (await v.detectFaces(out))[0]
    const pts = lm ? (() => {
      const m = (idx) => { let x = 0, y = 0; for (const i of idx) { x += lm[i].x; y += lm[i].y } return [x / idx.length * W, y / idx.length * H] }
      return [m(F.EYE_R), m(F.EYE_L), [lm[1].x * W, lm[1].y * H], [lm[61].x * W, lm[61].y * H], [lm[291].x * W, lm[291].y * H]]
    })() : null
    // yüz çevresi kırpımı (görsel karşılaştırma için)
    const b = g.bbox(0.35)
    const t = document.createElement('canvas'); t.width = 512; t.height = Math.round(512 * b.h / b.w)
    t.getContext('2d').drawImage(out, b.x, b.y, b.w, b.h, 0, 0, t.width, t.height)
    const enc = async (c, type) => { const bl = await new Promise((r) => c.toBlob(r, type, 0.92)); const u = new Uint8Array(await bl.arrayBuffer()); let s2 = ''; for (let i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s2) }
    return { ms, pts, full: await enc(out, 'image/png'), crop: await enc(t, 'image/jpeg') }
  }, { ch, strength }).catch((e) => ({ err: String(e).slice(0, 300) }))
  if (r.err) { console.log(ch, 'HATA', r.err); continue }
  writeFileSync(join(outDir, `${ch}.png`), Buffer.from(r.full, 'base64'))
  writeFileSync(join(outDir, `${ch}-yuz.jpg`), Buffer.from(r.crop, 'base64'))
  meta[ch] = { ms: r.ms, pts: r.pts }
  console.log(ch, r.ms + ' ms', r.pts ? 'yüz bulundu' : 'YÜZ YOK')
}
writeFileSync(join(outDir, 'noktalar.json'), JSON.stringify(meta, null, 1))
console.log('hata', errors.length)
await app.close()
