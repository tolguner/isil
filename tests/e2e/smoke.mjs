// Uçtan uca duman testi: npm run build && node tests/e2e/smoke.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const userData = mkdtempSync(join(tmpdir(), 'isil-test-'))
mkdirSync(join(userData, 'models'), { recursive: true })
if (existsSync(join(root, 'dev-models'))) for (const f of readdirSync(join(root, 'dev-models'))) copyFileSync(join(root, 'dev-models', f), join(userData, 'models', f))

const results = []
const ok = (name, pass, info = '') => {
  results.push({ name, pass, info })
  console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`)
}
const shots = join(root, 'replica', 'clone-screens')
mkdirSync(shots, { recursive: true })

const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.screenshot({ path: join(shots, 'S01-home.png') })
ok('Ana sayfa açıldı', true)

const gpu = await win.evaluate(async () => {
  const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })
  return { webgpu: !!a, vendor: a?.info?.vendor, arch: a?.info?.architecture, coi: self.crossOriginIsolated, storageBuffers: a?.limits?.maxStorageBuffersPerShaderStage }
})
ok('GPU bilgisi', true, JSON.stringify(gpu))

await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.waitForFunction(async () => { const s = (await window.__isil.mod('session')).session; return s.W > 0 && !!s.lastOut }, null, { timeout: 20000 })
await win.waitForTimeout(500)
await win.screenshot({ path: join(shots, 'S03-editor.png') })
ok('Editör fotoğrafı çizdi', true)

await win.evaluate(async () => {
  const S = await window.__isil.store()
  S.getState().commit((d) => { d.adjust.exposure = 15; d.adjust.contrast = 20; d.filter = { id: 'altin-saat', amount: 80 }; d.effects = [{ id: 'hale', amount: 40 }] })
})
await win.waitForTimeout(600)
await win.screenshot({ path: join(shots, 'S06-filter.png') })
ok('Ayar + filtre + efekt', true)

const faces = await win.evaluate(async () => {
  const S = await window.__isil.store()
  S.getState().setTab('retouch')
  S.getState().openTool('skin')
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 80 && !(s.faces && s.faces.length); i++) await new Promise((r) => setTimeout(r, 250))
  S.getState().update((d) => { d.retouch.faces = [{ index: 0, side: 'both', shape: { eyeSize: 30, slim: 30 }, skin: { smooth: 60, blemish: 60, undereye: 50, teeth: 40 }, makeup: { lip: { preset: null, amount: 45, color: '#b8324a' } } }] })
  return s.faces?.length ?? 0
})
await win.waitForTimeout(1000)
await win.screenshot({ path: join(shots, 'S08-retouch.png') })
ok('Yüz algılama + rötuş', faces > 0, `yüz=${faces}`)
await win.evaluate(async () => (await window.__isil.store()).getState().closeTool(true))

const cut = await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  const ops = await window.__isil.mod('ops')
  const t0 = performance.now()
  const m = await ops.removeBackground(s.preview)
  const t1 = performance.now()
  await ops.removeBackground(s.preview)
  const models = await window.__isil.mod('models')
  return { ok: !!m, firstMs: Math.round(t1 - t0), secondMs: Math.round(performance.now() - t1), provider: models.lastProvider }
}).catch((e) => ({ ok: false, err: String(e) }))
ok('Arka plan kesme (ISNet)', cut.ok, JSON.stringify(cut))

const lama = await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  const ops = await window.__isil.mod('ops')
  const src = ops.toCanvas(s.preview)
  const m = document.createElement('canvas')
  m.width = src.width
  m.height = src.height
  const c = m.getContext('2d')
  c.fillStyle = '#000'
  c.fillRect(0, 0, m.width, m.height)
  c.fillStyle = '#fff'
  c.fillRect(m.width * 0.05, m.height * 0.05, m.width * 0.12, m.height * 0.08)
  const t0 = performance.now()
  const r = await ops.inpaint(src, m)
  const models = await window.__isil.mod('models')
  return { ok: !!r, ms: Math.round(performance.now() - t0), provider: models.lastProvider }
}).catch((e) => ({ ok: false, err: String(e) }))
ok('Nesne silme (LaMa)', lama.ok, JSON.stringify(lama))

const up = await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  const ops = await window.__isil.mod('ops')
  const small = ops.toCanvas(s.preview, 256, 384)
  const t0 = performance.now()
  const r = await ops.upscale(small)
  return { ok: !!r && r.width === 1024, w: r?.width, ms: Math.round(performance.now() - t0) }
}).catch((e) => ({ ok: false, err: String(e) }))
ok('Kalite artırma 4× (Real-ESRGAN)', up.ok, JSON.stringify(up))

const ex = await win.evaluate(async () => {
  const S = await window.__isil.store()
  const s = (await window.__isil.mod('session')).session
  const r = await s.exportBlob(S.getState().doc, { exportFormat: 'jpeg', exportQuality: 90, exportMaxSide: 0 })
  return { size: r.blob.size, w: r.w, h: r.h, type: r.blob.type }
})
ok('Tam çözünürlükte dışa aktarma', ex.size > 50000 && ex.w >= 1400, JSON.stringify(ex))

await win.waitForTimeout(1500)
await win.evaluate(async () => (await window.__isil.store()).getState().closeProject())
await win.waitForTimeout(1500)
const listed = await win.locator('.pcard').count()
await win.screenshot({ path: join(shots, 'S27-projects.png') })
ok('Proje otomatik kaydedildi', listed >= 1, `kart=${listed}`)

const fatal = errors.filter((e) => !/Download the React DevTools|favicon|XNNPACK|onnxruntime|VerifyEachNodeIsAssignedToAnEp/i.test(e))
ok('Konsolda hata yok', fatal.length === 0, fatal.slice(0, 5).join(' | '))

await app.close()
writeFileSync(join(root, 'replica', 'smoke-results.json'), JSON.stringify({ at: new Date().toISOString(), gpu, results }, null, 2))
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
