// Çıkartma yapıcı: npm run build && node tests/e2e/stickermaker.mjs [ekran görüntüsü]
import { _electron as electron } from 'playwright'
import { mkdirSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const userData = tempDir('isil-sticker-')
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
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  ;(await window.__isil.store()).getState().setTab('stickers')
})
await win.waitForTimeout(600)
ok('"Benim" sekmesi açık ve çıkartma yapıcı görünüyor', (await win.getByRole('button', { name: 'Bu fotoğraftan' }).count()) === 1)
await win.getByRole('button', { name: 'Bu fotoğraftan' }).click()
await win.waitForSelector('.sticker-preview canvas', { timeout: 120000 }).catch(() => {})
const pv = await win.evaluate(() => {
  const c = document.querySelector('.sticker-preview canvas')
  if (!c) return null
  const ctx = c.getContext('2d')
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let clear = 0, white = 0
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 10) clear++; else if (d[i] > 240 && d[i + 1] > 240 && d[i + 2] > 240) white++ }
  const n = d.length / 4
  return { w: c.width, h: c.height, clear: Math.round((clear / n) * 100), white: Math.round((white / n) * 100) }
})
ok('Çıkartma üretildi: saydam zemin + beyaz kenar', !!pv && pv.clear > 10 && pv.white > 1, JSON.stringify(pv))
if (process.argv[2]) await win.screenshot({ path: process.argv[2] })
await win.getByRole('button', { name: 'Fotoğrafa ekle' }).click()
await win.waitForTimeout(800)
const layers = await win.evaluate(async () => (await window.__isil.store()).getState().doc.layers.map((l) => ({ type: l.type, kind: l.props.kind, png: String(l.props.value).startsWith('data:image/png') })))
ok('Fotoğrafa çıkartma katmanı eklendi', layers.some((l) => l.type === 'sticker' && l.kind === 'image' && l.png), JSON.stringify(layers))
const lib = await win.locator('.my-sticker').count()
ok('Kitaplığa kaydedildi', lib === 1, `kitaplık=${lib}`)
await win.locator('.my-sticker .del').first().click({ force: true })
await win.waitForTimeout(400)
ok('Kitaplıktan silinebiliyor', (await win.locator('.my-sticker').count()) === 0)
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
