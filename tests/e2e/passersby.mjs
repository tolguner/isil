// Yoldan geçenleri sil: npm run build && node tests/e2e/passersby.mjs <görsel> [çıktı klasörü]
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [img, outDir = join(root, 'tests', 'fixtures', 'out'), method = 'lama'] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-passersby-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const engine = existsSync(join(dev, 'engine', 'python', '.ok'))
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData, ...(engine ? { ISIL_ENGINE_DIR: join(dev, 'engine') } : {}) } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(async ({ b64, name }) => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  await window.__isil.openFile(name, b64)
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  S().setTab('cleanup'); S().openTool('passersby')
}, { b64: readFileSync(img).toString('base64'), name: basename(img) })
// kişiler bulunana kadar bekle
await win.waitForSelector('.person-box', { timeout: 120000 }).catch(() => {})
await win.waitForTimeout(500)
const boxes = await win.locator('.person-box').count()
const selected = await win.locator('.person-box.on').count()
const main = await win.locator('.person-box.main').count()
ok('Kişiler bulundu', boxes > 0, `kutu=${boxes} seçili=${selected} ana=${main}`)
await win.screenshot({ path: join(outDir, 'gecenler-secim.png') })
// bir kişiye tıklayınca seçim değişir
const first = win.locator('.person-box:not(.main)').first()
const before = await first.getAttribute('aria-pressed')
await first.click()
const after = await first.getAttribute('aria-pressed')
await first.click()
ok('Tıklama seçimi değiştiriyor', before !== after, `${before} → ${after}`)
if (method === 'flux') await win.getByRole('radio', { name: 'Üretken (FLUX)' }).click()
const t0 = Date.now()
await win.getByRole('button', { name: 'Seçilenleri sil' }).click()
await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  for (let i = 0; i < 1800 && (S().busy || document.querySelectorAll('.person-box.on').length > 0); i++) await new Promise((r) => setTimeout(r, 100))
})
await win.waitForTimeout(800)
const ms = Date.now() - t0
await win.screenshot({ path: join(outDir, 'gecenler-sonuc.png') })
const left = await win.locator('.person-box').count()
ok('Silinenler listeden çıktı', left === boxes - selected, `kalan=${left} süre=${ms} ms`)
await win.getByRole('button', { name: 'Uygula' }).click()
await win.waitForTimeout(1500)
const ops = await win.evaluate(async () => (await window.__isil.store()).getState().doc.rasterOps.map((o) => o.params?.tool))
ok('Uygula kalıcı işlem olarak kaydetti', ops.includes('passersby'), JSON.stringify(ops))
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
