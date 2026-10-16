// "Orijinali göster" (karşılaştırma) denetimi: npm run build && node tests/e2e/compare.mjs
// Ayar, filtre, efekt, rötuş, bükme, metin katmanı ve bir raster işlemden (sihirli silgi benzeri) sonra
// düğmeye basılıyken görüntünün hiç düzenlenmemiş fotoğrafa eşit olması beklenir.
import { _electron as electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const userData = tempDir('isil-compare-')
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
})

// ekrandaki tuvalin küçük bir parmak izi (ortalama renk ızgarası)
const snap = () => win.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 400))
  const c = document.querySelector('canvas')
  const t = document.createElement('canvas')
  t.width = 32
  t.height = 48
  const ctx = t.getContext('2d')
  ctx.drawImage(c, 0, 0, 32, 48)
  return { w: c.width, h: c.height, px: Array.from(ctx.getImageData(0, 0, 32, 48).data) }
})
const diff = (a, b) => {
  if (a.w !== b.w || a.h !== b.h) return 999
  let s = 0
  for (let i = 0; i < a.px.length; i++) if (i % 4 !== 3) s += Math.abs(a.px[i] - b.px[i])
  return Math.round((s / (a.px.length * 0.75)) * 100) / 100
}
const setCompare = (v) => win.evaluate(async (v) => (await window.__isil.store()).getState().setCompare(v), v)

const original = await snap()
// düzenlemeler: ayar + filtre + efekt + rötuş + yüz bükmesi + metin
await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  S().setTab('retouch'); S().openTool('skin')
  for (let i = 0; i < 80 && !(s.faces && s.faces.length); i++) await new Promise((r) => setTimeout(r, 250))
  S().closeTool(true)
  S().commit((d) => {
    d.adjust.exposure = 30; d.adjust.contrast = 25; d.filter = { id: 'altin-saat', amount: 90 }; d.effects = [{ id: 'hale', amount: 60 }]
    d.retouch.faces = [{ index: 0, side: 'both', shape: { slim: 80, eyeSize: 60 }, skin: { smooth: 70 }, makeup: { lip: { preset: null, amount: 60, color: '#b8324a' } } }]
    d.layers.push({ id: 'x', type: 'text', x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, props: { text: 'DENEME', font: 'Inter', weight: 700, size: 0.1, color: '#ff0000', opacity: 1, align: 'center', stroke: null, shadow: null, bg: null, spacing: 0 } })
  })
})
const edited = await snap()
await setCompare(true)
const cmp1 = await snap()
await setCompare(false)
ok('Düzenleme görünür fark yaratıyor', diff(original, edited) > 5, `fark=${diff(original, edited)}`)
ok('Basılıyken orijinal (renk/rötuş/bükme/metin yok)', diff(original, cmp1) < 1.5, `fark=${diff(original, cmp1)}`)
ok('Bırakınca düzenlenmiş hale dönüyor', diff(edited, await snap()) < 1.5)

// raster işlem: fotoğrafın üst yarısı karartılıp kalıcı işlem olarak kaydedilir (sihirli silgi, YZ, kalite artır gibi)
await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  const projects = await window.__isil.mod('projects')
  const full = await s.fullBase()
  const c = document.createElement('canvas')
  c.width = full.width; c.height = full.height
  const ctx = c.getContext('2d')
  ctx.drawImage(full, 0, 0)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, c.width, c.height / 2)
  await projects.commitRaster(c, 'paint', { test: true })
  for (let i = 0; i < 100; i++) { await new Promise((r) => setTimeout(r, 100)); if (s.baseBlob && s.lastOut) break }
})
await win.waitForTimeout(1200)
await setCompare(true)
const cmp2 = await snap()
await setCompare(false)
ok('Raster işlemden sonra da gerçek orijinali gösteriyor', diff(original, cmp2) < 1.5, `fark=${diff(original, cmp2)}`)

// klavye: "\" basılıyken orijinal
await win.locator('canvas').first().click({ position: { x: 5, y: 5 } }).catch(() => {})
await win.keyboard.down('\\')
const kb = await win.evaluate(async () => (await window.__isil.store()).getState().compare)
await win.keyboard.up('\\')
const kb2 = await win.evaluate(async () => (await window.__isil.store()).getState().compare)
ok('"\\" tuşu basılıyken açık, bırakınca kapalı', kb === true && kb2 === false, `${kb} ${kb2}`)
// düğme: basılı tut / bırak
const btn = win.getByRole('button', { name: 'Orijinalle karşılaştır' })
await btn.hover()
await win.mouse.down()
const b1 = await win.evaluate(async () => (await window.__isil.store()).getState().compare)
await win.mouse.up()
const b2 = await win.evaluate(async () => (await window.__isil.store()).getState().compare)
ok('Düğme basılıyken açık, bırakınca kapalı', b1 === true && b2 === false, `${b1} ${b2}`)
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
