// Vücut "Arka planı koru" + "Boşluğu YZ ile doldur": npm run build && node tests/e2e/body-fill.mjs <tam boy görsel> [çıktı klasörü]
// Korumalı inceltmeyi fotoğrafa işler, açılan şeridi LaMa ile doldurur; öncesi/sonrası PNG yazar.
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [img, outDir = join(root, 'replica', 'arge', 'olcum'), mode = 'incelt'] = process.argv.slice(2)
const SHAPE = mode === 'bacak' ? { legs: 100 } : { slim: 100 }
mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-bodyfill-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }

const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
win.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[konsol]', m.text().slice(0, 300)) })
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const b64 = readFileSync(img).toString('base64')
await win.evaluate(async ({ b64, name, SHAPE }) => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  await window.__isil.openFile(name, b64)
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  S().setTab('retouch'); S().openTool('body')
  for (let i = 0; i < 160 && !(s.pose && s.seg); i++) await new Promise((r) => setTimeout(r, 250))
  S().update((d) => { d.body = { shape: SHAPE, manual: null, protect: true } })
}, { b64, name: basename(img), SHAPE })
await win.waitForTimeout(800)
const toB64 = async () => win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  const { blob } = await s.exportBlob(S().doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 0 })
  const u = new Uint8Array(await blob.arrayBuffer())
  let t = ''
  for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(t)
})
writeFileSync(join(outDir, `govde-koru-${mode}-canli.png`), Buffer.from(await toB64(), 'base64'))
const btn = win.getByRole('button', { name: 'Boşluğu YZ ile doldur ve uygula' })
console.log('düğme sayısı', await btn.count())
await win.screenshot({ path: join(outDir, 'govde-panel.png') })
await btn.click()
await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  // async koşul waitForFunction'da hemen doğru sayılır; elle bekle
  for (let i = 0; i < 1800 && !(S().doc.rasterOps.length > 0 && !S().busy); i++) await new Promise((r) => setTimeout(r, 100))
})
await win.waitForTimeout(1500)
const st = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const d = S().doc
  return { ops: d.rasterOps.map((o) => ({ type: o.type, params: o.params })), body: d.body, toasts: S().toasts.map((t) => t.kind + ': ' + t.text) }
})
writeFileSync(join(outDir, `govde-koru-${mode}-dolu.png`), Buffer.from(await toB64(), 'base64'))
console.log(JSON.stringify(st))
const op = st.ops.find((o) => o.params?.tool === 'body-protect')
ok('Boşluk doldurma işlendi', !!op, JSON.stringify(op ?? st.toasts))
ok('Şerit bulundu', (op?.params?.gap ?? 0) > 0, `piksel=${op?.params?.gap ?? 0}`)
ok('Vücut ayarları sıfırlandı (fotoğrafa işlendi)', !st.body || !Object.keys(st.body.shape ?? {}).length)
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
