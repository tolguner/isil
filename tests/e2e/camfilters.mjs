// Kamera filtreleri: npm run build && node tests/e2e/camfilters.mjs [ekran görüntüsü]
import { _electron as electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'
const userData = tempDir('isil-cam-')
mkdirSync(join(userData, 'models'), { recursive: true })
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const S = (await window.__isil.store()).getState
  S().setTab('filters'); S().openTool('filters')
})
await win.waitForTimeout(500)
await win.getByRole('tab', { name: 'Kamera' }).click()
await win.waitForTimeout(1500)
const cards = await win.locator('.panel .preset').count()
ok('Kamera sekmesinde 8 filtre', cards >= 8, `kart=${cards}`)
if (process.argv[2]) await win.locator('.panel').screenshot({ path: process.argv[2] })
// her filtre görüntüyü farklı değiştiriyor
const sig = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  const ids = ['kam-sokak', 'kam-tekkullanim', 'kam-ccd', 'kam-slayt', 'kam-portre-neg', 'kam-tungsten', 'kam-telefon09', 'kam-lomo']
  const out = {}
  for (const id of ids) {
    S().update((d) => { d.filter = { id, amount: 100 } })
    const { blob } = await s.exportBlob(S().doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 200 })
    const b = await createImageBitmap(blob)
    const c = new OffscreenCanvas(8, 8); const x = c.getContext('2d'); x.drawImage(b, 0, 0, 8, 8)
    const d = x.getImageData(0, 0, 8, 8).data
    let r = 0, g = 0, bl = 0
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; bl += d[i + 2] }
    out[id] = [r, g, bl].map((v) => Math.round(v / 64))
  }
  return out
})
const vals = Object.values(sig).map((v) => v.join(','))
ok('Filtreler birbirinden farklı', new Set(vals).size === vals.length, JSON.stringify(sig))
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
