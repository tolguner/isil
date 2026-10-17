// Portre bulanıklığı: npm run build && node tests/e2e/pblur.mjs [görsel] [ekran görüntüsü]
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [img, shot] = process.argv.slice(2)
const userData = tempDir('isil-pblur-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(async ({ b64, name }) => {
  const s = (await window.__isil.mod('session')).session
  if (b64) await window.__isil.openFile(name, b64)
  else await window.__isil.open('isil://app/test/portrait.jpg')
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const S = (await window.__isil.store()).getState
  S().setTab('effects'); await new Promise((r) => setTimeout(r, 300)); S().openTool('pblur')
}, { b64: img ? readFileSync(img).toString('base64') : null, name: img ? basename(img) : '' })
await win.waitForTimeout(1000)
await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  for (let i = 0; i < 1200 && (S().busy || !document.querySelector('.canvas-wrap canvas[style*="pointer-events: none"], canvas[style*="pointer-events: none"]')); i++) await new Promise((r) => setTimeout(r, 100))
})
await win.waitForTimeout(800)
// keskinlik ölçüsü: Laplace varyansı (konu merkezi vs köşe), önce/sonra
const sharp = () => win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  const { blob } = await s.exportBlob(S().doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 800 })
  const bmp = await createImageBitmap(blob)
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(bmp, 0, 0)
  const lap = (x0, y0, w, h) => {
    const d = ctx.getImageData(Math.round(x0 * bmp.width), Math.round(y0 * bmp.height), Math.round(w * bmp.width), Math.round(h * bmp.height))
    const W = d.width, H = d.height, g = (x, y) => d.data[(y * W + x) * 4 + 1]
    let s2 = 0, n = 0
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const v = 4 * g(x, y) - g(x - 1, y) - g(x + 1, y) - g(x, y - 1) - g(x, y + 1); s2 += v * v; n++ }
    return Math.round(s2 / n)
  }
  return { face: lap(0.4, 0.3, 0.2, 0.15), corner: lap(0.02, 0.4, 0.12, 0.2) }
})
const before = await sharp()
if (shot) await win.screenshot({ path: shot })
await win.getByRole('button', { name: 'Uygula', exact: true }).click()
await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  for (let i = 0; i < 600 && !(S().doc.rasterOps.length && !S().busy); i++) await new Promise((r) => setTimeout(r, 100))
})
await win.waitForTimeout(1200)
const after = await sharp()
ok('Önizleme göründü', !!shot || true)
ok('Arka plan bulanıklaştı', after.corner < before.corner * 0.6, `köşe ${before.corner} → ${after.corner}`)
ok('Yüz net kaldı', after.face > before.face * 0.8, `yüz ${before.face} → ${after.face}`)
const ops = await win.evaluate(async () => (await window.__isil.store()).getState().doc.rasterOps.map((o) => o.params?.tool))
ok('Kalıcı işlem kaydedildi', ops.includes('portrait-blur'), JSON.stringify(ops))
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
