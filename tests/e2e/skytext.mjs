// Gökyüzü ve metin silme: npm run build && node tests/e2e/skytext.mjs <yazılı görsel> [çıktı klasörü]
// Modeller dev-models'tan (skyseg.onnx, ppocr_det_v4.onnx) bağlanır.
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'
const root = process.cwd()
const [textImg, outDir] = process.argv.slice(2)
if (outDir) mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-skytext-'); mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const waitIdle = () => win.evaluate(async () => { const S = (await window.__isil.store()).getState; await new Promise((r) => setTimeout(r, 400)); for (let i = 0; i < 600 && S().busy; i++) await new Promise((r) => setTimeout(r, 200)) })
const dump = async (name) => {
  if (!outDir) return
  const b64 = await win.evaluate(async () => { const s = (await window.__isil.mod('session')).session; const S = (await window.__isil.store()).getState(); const k = S.doc.base; for (let i = 0; i < 100 && !String(s.baseKey).includes(k ?? '§'); i++) await new Promise((r) => setTimeout(r, 100)); const f = await s.fullBase(); const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d').drawImage(f, 0, 0); return c.toDataURL('image/jpeg', 0.88).split(',')[1] })
  writeFileSync(join(outDir, name), Buffer.from(b64, 'base64'))
}
// gökyüzü
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => { const s = (await window.__isil.mod('session')).session; for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100)); const S = (await window.__isil.store()).getState(); S.setTab('background'); S.openTool('sky') })
await waitIdle()
await win.getByRole('button', { name: 'Gün batımı' }).click()
await win.waitForTimeout(1500)
const before = await win.evaluate(async () => { const s = (await window.__isil.mod('session')).session; const f = await s.fullBase(); const c = document.createElement('canvas'); c.width = 64; c.height = 96; c.getContext('2d').drawImage(f, 0, 0, 64, 96); window.__b = c.getContext('2d').getImageData(0, 0, 64, 96).data; return true })
await win.locator('.panel-foot .btn.primary').click()
await waitIdle()
const sky = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState()
  const s = (await window.__isil.mod('session')).session
  const op = S.doc.rasterOps.at(-1)
  await new Promise((r) => setTimeout(r, 800))
  const f = await s.fullBase(); const c = document.createElement('canvas'); c.width = 64; c.height = 96; c.getContext('2d').drawImage(f, 0, 0, 64, 96)
  const a = window.__b, b = c.getContext('2d').getImageData(0, 0, 64, 96).data
  const diff = (y0, y1) => { let d = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = 0; x < 64; x++) { const i = (y * 64 + x) * 4; d += Math.abs(a[i] - b[i]) + Math.abs(a[i + 2] - b[i + 2]); n++ } return Math.round(d / n) }
  return { tool: op?.params?.tool, top: diff(0, 10), bottom: diff(70, 96) }
})
ok('Gökyüzü değişiyor, alt kısım (kişi) çok az değişiyor', sky.tool === 'sky' && sky.top > 40 && sky.bottom < sky.top / 3, JSON.stringify(sky))
await dump('gokyuzu.jpg')
// metin silme
if (textImg) {
  await win.evaluate(async ({ b64, name }) => window.__isil.openFile(name, b64), { b64: readFileSync(textImg).toString('base64'), name: basename(textImg) })
  await win.evaluate(async () => { const s = (await window.__isil.mod('session')).session; for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100)); const S = (await window.__isil.store()).getState(); S.setTab('cleanup'); S.openTool('textremove') })
  await waitIdle()
  const found = await win.locator('.text-box').count()
  ok('Yazılar bulunuyor', found >= 2, `${found} kutu`)
  await win.getByRole('button', { name: 'Seçili yazıları sil' }).click()
  await waitIdle()
  const changed = await win.evaluate(async () => { const r = await window.__isil.mod('aitools').catch(() => null); const S = (await window.__isil.store()).getState(); return !!document.querySelector('.panel-foot .btn.primary:not([disabled])') })
  console.log('iş sonucu değişti mi:', changed)
  await win.locator('.panel-foot .btn.primary').click()
  await waitIdle()
  const op = await win.evaluate(async () => (await window.__isil.store()).getState().doc.rasterOps.at(-1)?.params?.tool)
  ok('Yazılar siliniyor ve kaydediliyor', op === 'text', String(op))
  await dump('metin-silindi.jpg')
}
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
