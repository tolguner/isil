// Saç ve kıyafet değiştirme: npm run build && node tests/e2e/restyle.mjs [çıktı klasörü]
// Yerel YZ motoru (dev-models/engine) gerekir. Yüz bölgesinin piksel piksel korunduğunu ölçer.
import { _electron as electron } from 'playwright'
import { mkdirSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const outDir = process.argv[2] ?? join(root, 'tests', 'fixtures', 'out')
mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-restyle-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
const engine = existsSync(join(dev, 'engine', 'python', '.ok'))
if (!engine) { console.log('ATLANDI: dev-models/engine yok'); process.exit(0) }
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData, ISIL_ENGINE_DIR: join(dev, 'engine') } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
})
for (const [kind, what, file] of [['hair', 'pastel pink hair, same hairstyle', 'sac-pembe'], ['outfit', 'a black leather biker jacket over a white t-shirt', 'kiyafet-deri']]) {
  const r = await win.evaluate(async ({ kind, what }) => {
    const s = (await window.__isil.mod('session')).session
    const v = await window.__isil.mod('vision')
    const full = await s.fullBase()
    const src = document.createElement('canvas')
    src.width = full.width; src.height = full.height
    src.getContext('2d').drawImage(full, 0, 0)
    const mod = await window.__isil.mod('restyle')
    const t0 = performance.now()
    const out = await mod.restyle(src, kind, what)
    const ms = Math.round(performance.now() - t0)
    // yüz bölgesi: yüz derisi maskesinde ortalama mutlak fark
    const parts = await v.segmentPerson(src)
    const a = src.getContext('2d').getImageData(0, 0, src.width, src.height).data
    const b = out.getContext('2d').getImageData(0, 0, src.width, src.height).data
    let fs = 0, fn = 0, ms2 = 0, mn = 0
    const tgt = kind === 'hair' ? parts.hair : parts.clothes
    for (let y = 0; y < src.height; y += 3) for (let x = 0; x < src.width; x += 3) {
      const k = Math.floor((y / src.height) * parts.h) * parts.w + Math.floor((x / src.width) * parts.w)
      const i = (y * src.width + x) * 4
      const d = (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3
      if (parts.faceSkin[k] > 0.8) { fs += d; fn++ }
      if (tgt[k] > 0.8) { ms2 += d; mn++ }
    }
    const blob = await new Promise((r) => out.toBlob(r, 'image/jpeg', 0.9))
    const u = new Uint8Array(await blob.arrayBuffer())
    let t = ''
    for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return { ms, face: +(fs / fn).toFixed(2), target: +(ms2 / mn).toFixed(2), jpg: btoa(t) }
  }, { kind, what })
  writeFileSync(join(outDir, file + '.jpg'), Buffer.from(r.jpg, 'base64'))
  ok(`${kind}: hedef bölge değişti`, r.target > 8, `fark=${r.target} (${r.ms} ms)`)
  ok(`${kind}: yüz korunuyor`, r.face < 1.5, `yüz farkı=${r.face}`)
}
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
