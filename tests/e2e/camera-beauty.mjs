// Canlı güzellik kamerası (sahte kamera akışıyla, gerçek kamera kullanılmaz):
//   npm run build && node tests/e2e/camera-beauty.mjs <kare.mjpeg> [ekran görüntüsü]
import { _electron as electron } from 'playwright'
import { tempDir } from './_tmp.mjs'
const [mjpeg, shot] = process.argv.slice(2)
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${mjpeg}`], env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: tempDir('isil-cambeauty-') } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil)
await win.evaluate(async () => (await window.__isil.store()).getState().go('camera'))
await win.waitForTimeout(6000)
// yüz bölgesi yüksek frekans enerjisi (kanvas ortası üst)
const energy = () => win.evaluate(() => {
  const c = document.querySelector('.stage canvas')
  if (!c) return null
  const t = document.createElement('canvas')
  t.width = c.width; t.height = c.height
  const x = t.getContext('2d'); x.drawImage(c, 0, 0)
  const w = Math.round(c.width * 0.12), h = Math.round(c.height * 0.12)
  const d = x.getImageData(Math.round(c.width * 0.47), Math.round(c.height * 0.38), w, h)
  const g = (i, j) => d.data[(j * w + i) * 4 + 1]
  let e = 0, n = 0
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) { const v = 4 * g(i, j) - g(i - 1, j) - g(i + 1, j) - g(i, j - 1) - g(i, j + 1); e += v * v; n++ }
  return Math.round(e / n)
})
const on = await energy()
if (shot) await win.screenshot({ path: shot })
ok('Kamera görüntü veriyor', on !== null && on > 0, `enerji=${on}`)
// Pürüzsüz kaydırıcısını sıfırla (çift tık), Aydınlat'ı da
for (const name of ['Pürüzsüz', 'Aydınlat']) await win.locator('.slider', { hasText: name }).locator('[role="slider"]').dblclick()
await win.waitForTimeout(1500)
const off = await energy()
ok('Canlı pürüzsüzleştirme yüzde dokuyu yumuşatıyor', on < off * 0.85, `açık ${on} / kapalı ${off}`)
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
