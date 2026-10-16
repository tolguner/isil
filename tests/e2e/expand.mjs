// YZ genişlet: npm run build && node tests/e2e/expand.mjs [görsel] [çıktı klasörü] [lama|flux]
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [img, outDir = join(root, 'tests', 'fixtures', 'out'), method = 'lama'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-expand-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
// FLUX denemesi için geliştirici motoru (dev-models/engine) kullanılır
const engine = existsSync(join(dev, 'engine', 'python', '.ok'))
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData, ...(engine ? { ISIL_ENGINE_DIR: join(dev, 'engine') } : {}) } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const W0 = await win.evaluate(async ({ b64, name }) => {
  const s = (await window.__isil.mod('session')).session
  if (b64) await window.__isil.openFile(name, b64)
  else await window.__isil.open('isil://app/test/portrait.jpg')
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const S = (await window.__isil.store()).getState
  S().setTab('crop')
  await new Promise((r) => setTimeout(r, 300))
  S().openTool('expand')
  return [s.W, s.H]
}, { b64: img ? readFileSync(img).toString('base64') : null, name: img ? basename(img) : '' })
await win.waitForTimeout(500)
// Kırp sekmesinde araç ızgarası görünüyor (iki araç)
ok('Kırp sekmesinde iki araç', (await win.locator('.panel').getByRole('button', { name: 'YZ genişlet' }).count()) > 0)
await win.getByRole('button', { name: '1:1', exact: true }).click()
await win.getByRole('radio', { name: method === 'flux' ? 'En iyi (FLUX)' : 'Hızlı (LaMa)' }).click()
ok('Önizleme çerçevesi', (await win.locator('.expand-frame').count()) === 1)
await win.screenshot({ path: join(outDir, 'genislet-once.png') })
const t0 = Date.now()
await win.getByRole('button', { name: 'Genişlet', exact: true }).click()
await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  for (let i = 0; i < 3000 && !(S().doc.rasterOps.length > 0 && !S().busy); i++) await new Promise((r) => setTimeout(r, 100))
})
await win.waitForTimeout(1500)
const ms = Date.now() - t0
const r = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  return { W: s.W, H: s.H, ops: S().doc.rasterOps.map((o) => o.params), crop: S().doc.crop }
})
const op = r.ops.find((o) => o.tool === 'expand')
ok('Tuval 1:1 oldu', Math.abs(r.W - r.H) <= 2 && r.W >= Math.max(...W0), `${W0.join('×')} → ${r.W}×${r.H} (${ms} ms, ${op?.method})`)
// asıl pikseller korunuyor: yeni görüntünün ortasındaki bölge eski görüntüyle aynı
const same = await win.evaluate(async ({ at }) => {
  const s = (await window.__isil.mod('session')).session
  const full = await s.fullBase()
  const c = new OffscreenCanvas(full.width, full.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(full, 0, 0)
  const mid = ctx.getImageData(at[0] + 200, at[1] + 200, 4, 4).data
  // kenardaki yeni alan boş (saydam/siyah) değil
  const edge = ctx.getImageData(5, Math.round(full.height / 2), 4, 4).data
  return { mid: Array.from(mid.slice(0, 4)), edge: Array.from(edge.slice(0, 4)) }
}, { at: op?.at ?? [0, 0] })
ok('Yeni kenar dolduruldu', same.edge[3] === 255 && same.edge[0] + same.edge[1] + same.edge[2] > 3, JSON.stringify(same.edge))
await win.screenshot({ path: join(outDir, 'genislet-sonra.png') })
// karşılaştırma: orijinal ortada, yanlar siyah
await win.evaluate(async () => (await window.__isil.store()).getState().setCompare(true))
await win.waitForTimeout(500)
const cmp = await win.evaluate(() => {
  const c = document.querySelector('canvas.gl')
  const t = document.createElement('canvas')
  t.width = 40; t.height = 40
  t.getContext('2d').drawImage(c, 0, 0, 40, 40)
  const d = t.getContext('2d').getImageData(0, 20, 1, 1).data
  return Array.from(d.slice(0, 3))
})
await win.screenshot({ path: join(outDir, 'genislet-karsilastirma.png') })
await win.evaluate(async () => (await window.__isil.store()).getState().setCompare(false))
ok('Karşılaştırmada orijinal yerinde, kenar boş', cmp[0] + cmp[1] + cmp[2] < 30, JSON.stringify(cmp))
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
