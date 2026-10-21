// İndirme dayanıklılığı: sabit sürüm + sha256 doğrulaması, iptal sonrası kaldığı yerden devam, motor konumu.
// İnternet ister (Hugging Face'ten 4,7 MB'lık yazı algılama modeli iner). npm run build && node tests/e2e/indirme.mjs
import { _electron as electron } from 'playwright'
import { mkdirSync, existsSync, statSync, readFileSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const userData = tempDir('isil-indirme-')
mkdirSync(join(userData, 'models'), { recursive: true })
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const results = []
const check = (name, ok, info = '') => { results.push(ok); console.log(ok ? 'GEÇTİ ' : 'KALDI ', name, info) }
const manifest = JSON.parse(readFileSync(join(root, 'src/shared/manifest.json'), 'utf8'))
const want = manifest['SWHL/RapidOCR/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx']
const target = join(userData, 'models', 'ppocr_det_v4.onnx')

// 1) iptal: yarıda kesilince .part kalır
const cut = await win.evaluate(async () => {
  const P = (await window.__isil.mod('platform')).platform
  const M = (await window.__isil.mod('models'))
  const m = M.modelById('textdet')
  let canceled = false
  const off = P.onModelProgress((p) => { if (!canceled && p.file === m.file && p.got > 0) { canceled = true; void P.cancelModel(m.file) } })
  const r = await P.downloadModel({ file: m.file, url: m.url }).then(() => 'bitti', (e) => 'iptal: ' + e.message)
  off()
  return r
})
const partSize = existsSync(target + '.part') ? statSync(target + '.part').size : 0
// bağlantı çok hızlıysa indirme ilk ilerleme bildiriminden önce bitebilir: o zaman iptal adımı denenemez
if (cut === 'bitti') console.log('ATLANDI', 'İndirme iptalden önce bitti (hızlı bağlantı)')
else check('İptal edilince yarım dosya saklanıyor', cut.startsWith('iptal') && partSize > 0 && !existsSync(target), `${cut} part=${partSize}`)

// 2) devam: yeniden indirince yalnız kalan kısım iner, sha256 tutar
const resumed = await win.evaluate(async () => {
  const P = (await window.__isil.mod('platform')).platform
  const m = (await window.__isil.mod('models')).modelById('textdet')
  let first = -1
  const off = P.onModelProgress((p) => { if (p.file === m.file && first < 0) first = p.got })
  const r = await P.downloadModel({ file: m.file, url: m.url })
  off()
  return { first, size: r.size, sha256: r.sha256 }
})
const disk = existsSync(target) ? createHash('sha256').update(readFileSync(target)).digest('hex') : ''
check('Kaldığı yerden devam etti', resumed.first >= partSize - 1, `ilk ilerleme=${resumed.first} yarım=${partSize}`)
check('Dosya sabit sürümle aynı (sha256 ve boyut)', resumed.sha256 === want.sha256 && disk === want.sha256 && resumed.size === want.size, resumed.sha256?.slice(0, 12))

// 3) motor konumu bilgisi
const loc = await win.evaluate(async () => (await window.__isil.mod('platform')).platform.engineLocation())
check('Motor konumu okunuyor', typeof loc.dir === 'string' && loc.dir.length > 0, JSON.stringify(loc))

// 4) motoru başka klasöre taşı, sonra kaldır
const dest = tempDir('isil-motor-yeni-')
const moved = await win.evaluate(async (d) => {
  const P = (await window.__isil.mod('platform')).platform
  await P.engineMove(d)
  const after = await P.engineLocation()
  await P.engineRemove()
  const gone = await P.engineLocation()
  return { after: after.dir, custom: after.custom, goneSize: gone.size }
}, dest)
check('Motor yeni konuma taşındı ve kaldırılabiliyor', moved.after.startsWith(dest) && moved.custom && moved.goneSize === 0 && existsSync(join(userData, 'engine-location.txt')), JSON.stringify(moved))

await app.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} geçti`)
process.exit(results.every(Boolean) ? 0 : 1)
