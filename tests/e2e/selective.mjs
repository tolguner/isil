// Seçmeli ayar: npm run build && node tests/e2e/selective.mjs
import { _electron as electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const userData = tempDir('isil-selective-')
mkdirSync(join(userData, 'models'), { recursive: true })
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
  const S = (await window.__isil.store()).getState
  S().setTab('adjust'); S().openTool('selective')
})
await win.waitForTimeout(600)

// dışa aktarılan görüntüde bölge ortalaması (0..255)
const regions = () => win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  const { blob } = await s.exportBlob(S().doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 600 })
  const bmp = await createImageBitmap(blob)
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(bmp, 0, 0)
  const avg = (x, y) => {
    const d = ctx.getImageData(Math.round(x * bmp.width) - 5, Math.round(y * bmp.height) - 5, 10, 10).data
    let s2 = 0
    for (let i = 0; i < d.length; i += 4) s2 += (d[i] + d[i + 1] + d[i + 2]) / 3
    return Math.round(s2 / (d.length / 4))
  }
  return { near: avg(0.5, 0.35), far: avg(0.1, 0.9) }
})
const before = await regions()
// tuvalde yüzün ortasına tıkla → nokta eklenir
const box = await win.locator('canvas.gl').boundingBox()
const view = await win.evaluate(() => {
  const c = document.querySelector('canvas').getBoundingClientRect()
  return { x: c.x, y: c.y, w: c.width, h: c.height }
})
void view
await win.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.35)
await win.waitForTimeout(300)
const pts = await win.evaluate(async () => (await window.__isil.store()).getState().doc.local ?? [])
ok('Tıklama nokta ekliyor', pts.length === 1, JSON.stringify(pts.map((p) => [p.x.toFixed(2), p.y.toFixed(2)])))
// parlaklığı artır (paneldeki kaydırıcı)
await win.evaluate(async () => (await window.__isil.store()).getState().update((d) => { d.local[0].adj.b = 80 }))
await win.waitForTimeout(400)
const after = await regions()
if (process.argv[2]) await win.screenshot({ path: process.argv[2] })
ok('Noktanın çevresi aydınlanıyor', after.near - before.near > 15, `${before.near} → ${after.near}`)
ok('Uzak bölge değişmiyor', Math.abs(after.far - before.far) <= 3, `${before.far} → ${after.far}`)
// panelde kaydırıcılar görünüyor
const sliders = await win.locator('.panel .slider-top label').allInnerTexts()
ok('Seçili noktanın kaydırıcıları', ['Parlaklık', 'Kontrast', 'Doygunluk', 'Sıcaklık', 'Yarıçap', 'Renk duyarlılığı'].every((t) => sliders.some((x) => x.startsWith(t))), JSON.stringify(sliders))
// noktayı sürükle
const p0 = await win.locator('.sel-point').first().boundingBox()
await win.mouse.move(p0.x + p0.width / 2, p0.y + p0.height / 2)
await win.mouse.down()
await win.mouse.move(p0.x + 80, p0.y + 60, { steps: 6 })
await win.mouse.up()
await win.waitForTimeout(300)
const moved = await win.evaluate(async () => (await window.__isil.store()).getState().doc.local[0])
ok('Sürükleme noktayı taşıyor', Math.abs(moved.x - pts[0].x) > 0.02 && (await win.evaluate(async () => (await window.__isil.store()).getState().doc.local.length)) === 1, `${pts[0].x.toFixed(2)} → ${moved.x.toFixed(2)}`)
// karşılaştırmada etkisiz
await win.evaluate(async () => (await window.__isil.store()).getState().setCompare(true))
await win.evaluate(async () => (await window.__isil.store()).getState().setCompare(false))
await win.getByRole('button', { name: 'Noktayı sil' }).click()
await win.waitForTimeout(300)
const left = await win.evaluate(async () => ((await window.__isil.store()).getState().doc.local ?? []).length)
ok('Noktayı sil', left === 0)
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
