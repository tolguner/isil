// Dövme ekleme: npm run build && node tests/e2e/tattoo.mjs [ekran görüntüsü]
import { _electron as electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const userData = tempDir('isil-tattoo-')
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
  ;(await window.__isil.store()).getState().setTab('stickers')
})
await win.waitForTimeout(500)
await win.getByRole('tab', { name: 'Dövme' }).click()
await win.getByRole('button', { name: 'Kalp' }).click()
await win.waitForTimeout(800)
const l = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  S().update((d) => { const x = d.layers[d.layers.length - 1]; x.x = 0.42; x.y = 0.74 })
  const x = S().doc.layers.at(-1)
  return { type: x?.type, tattoo: x?.props.tattoo, png: String(x?.props.value).startsWith('data:image/png') }
})
ok('Dövme katmanı eklendi', l.type === 'sticker' && l.tattoo === true && l.png, JSON.stringify(l))
await win.waitForTimeout(600)
if (process.argv[2]) await win.screenshot({ path: process.argv[2] })
// dışa aktarımda karışım: dövme bölgesi koyulaşmalı ama cilt rengi korunmalı (siyah değil)
const px = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  const { blob } = await s.exportBlob(S().doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 800 })
  const bmp = await createImageBitmap(blob)
  const c = new OffscreenCanvas(bmp.width, bmp.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(bmp, 0, 0)
  const d = ctx.getImageData(Math.round(0.42 * bmp.width) - 40, Math.round(0.74 * bmp.height) - 40, 80, 80).data
  let mn = 255, sum = 0
  for (let i = 0; i < d.length; i += 4) { const L = (d[i] + d[i + 1] + d[i + 2]) / 3; if (L < mn) mn = L; sum += L }
  return { min: Math.round(mn), avg: Math.round(sum / (d.length / 4)) }
})
ok('Mürekkep görünüyor, cilt dokusu korunuyor', px.min < 60 && px.avg > 60, JSON.stringify(px))
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
