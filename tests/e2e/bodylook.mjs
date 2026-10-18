// Vücut görünümü Ar-Ge düzeneği: npm run build && node tests/e2e/bodylook.mjs <görsel> <çıktı klasörü> [görünümler] [miktar]
// Her görünümü uygular; gövde kırpımlarını ve cilt payını yazar.
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [img, outDir, which = 'abs,chest,arms,collar,all', level = '100'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-bodylook-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
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
for (const look of ['orig', ...which.split(',')]) {
  const r = await win.evaluate(async ({ look, level }) => {
    const s = (await window.__isil.mod('session')).session
    const B = await window.__isil.mod('bodylook')
    const pose = await s.ensurePose()
    const seg = await s.ensureSeg()
    if (!pose) return { err: 'poz yok' }
    const full = await s.fullBase()
    const W = full.width, H = full.height
    const t0 = performance.now()
    let out, skin = null
    if (look === 'map') { const P = (i) => ({ x: pose[i].x * W, y: pose[i].y * H }); const r = B.relief(W, H, P, { abs: 100, chest: 100, arms: 100, collar: 100 }); out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d'); o.drawImage(full, 0, 0); o.globalAlpha = 0.85; o.globalCompositeOperation = 'screen'; o.drawImage(r.map, 0, 0) }
    else if (look === 'orig') { out = document.createElement('canvas'); out.width = W; out.height = H; out.getContext('2d').drawImage(full, 0, 0) }
    else {
      const ai = look.endsWith('+ai'), base = look.replace('+ai', '')
      const n = Number(level); const amt = base === 'all' ? { abs: n, chest: n, arms: n, collar: n } : { [base]: n }
      const fc = document.createElement('canvas'); fc.width = W; fc.height = H; fc.getContext('2d').drawImage(full, 0, 0)
      const res = B.applyBodyLook(fc, pose, seg, amt); out = res.canvas; skin = Math.round(res.skin * 100)
      if (ai) out = await B.refineBodyLook(fc, res.canvas, res.mask, res.box, Object.keys(amt))
    }
    const ms = Math.round(performance.now() - t0)
    if (!out) return { ms, skin, err: 'çizilmedi' }
    // gövde kırpımı: omuzdan kalçaya, kollar dahil
    const xs = [11, 12, 13, 14, 23, 24].map((i) => pose[i].x * W), ys = [11, 12, 13, 14, 23, 24].map((i) => pose[i].y * H)
    const sw = Math.abs(xs[0] - xs[1])
    const x0 = Math.max(0, Math.min(...xs) - sw * 0.4), x1 = Math.min(W, Math.max(...xs) + sw * 0.4)
    const y0 = Math.max(0, Math.min(...ys) - sw * 0.5), y1 = Math.min(H, Math.max(...ys) + sw * 0.15)
    const c = document.createElement('canvas'); c.width = 600; c.height = Math.round(600 * (y1 - y0) / (x1 - x0))
    c.getContext('2d').drawImage(out, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height)
    const bl = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92)); const u = new Uint8Array(await bl.arrayBuffer()); let s2 = ''; for (let i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return { ms, skin, crop: btoa(s2) }
  }, { look, level }).catch((e) => ({ err: String(e).slice(0, 300) }))
  if (r.crop) writeFileSync(join(outDir, `${look}.jpg`), Buffer.from(r.crop, 'base64'))
  console.log(look, JSON.stringify({ ms: r.ms, skin: r.skin, err: r.err }))
}
console.log('hata', errors.length, errors.slice(0, 2).join(' | '))
await app.close()
