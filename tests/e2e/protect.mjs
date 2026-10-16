// "İşaretleri koru" fırçası ölçümü: npm run build && node tests/e2e/protect.mjs
// Dövmeli yüzde (replica/screens/rakip/isil/0-orijinal.jpg) yumuşat 80 + leke 60 uygulanır;
// korumasız ve korumalı çıktıda dövme bölgesi ile yanak bölgesindeki fark ölçülür.
// Ölçüt (replica/arge/01): işaret bölgesinde fark düşük, cildin geri kalanında yumuşama sürer.
import { _electron as electron } from 'playwright'
import { tempDir } from './_tmp.mjs'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const userData = tempDir('isil-protect-')
const outDir = join(root, 'replica', 'arge', 'olcum')
mkdirSync(outDir, { recursive: true })
const results = []
const ok = (name, pass, info = '') => {
  results.push({ name, pass, info })
  console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`)
}

// 1080×720 görüntüde normalize kutular
const TATTOO = { x0: 0.41, y0: 0.72, x1: 0.475, y1: 0.85 }
const PIERCING = { x0: 0.343, y0: 0.553, x1: 0.362, y1: 0.578 }
const CHEEK = { x0: 0.52, y0: 0.6, x1: 0.62, y1: 0.7 }
const STROKES = [
  { pts: [0.443, 0.735, 0.443, 0.79, 0.445, 0.835], r: 0.06 },
  { pts: [0.352, 0.565], r: 0.02 }
]
const SKIN = { smooth: 80, blemish: 60 }

const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })

const b64 = readFileSync(join(root, 'replica/screens/rakip/isil/0-orijinal.jpg')).toString('base64')
const res = await win.evaluate(async ({ b64, TATTOO, PIERCING, CHEEK, STROKES, SKIN }) => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  await window.__isil.openFile('dovme.jpg', b64)
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  S().setTab('retouch')
  S().openTool('skin')
  for (let i = 0; i < 120 && !(s.faces && s.faces.length && s.seg); i++) await new Promise((r) => setTimeout(r, 250))
  const render = async (faces) => {
    S().update((d) => { d.retouch.faces = faces })
    await new Promise((r) => setTimeout(r, 300))
    const { blob } = await s.exportBlob(S().doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 0 })
    const bmp = await createImageBitmap(blob)
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    return { img: ctx.getImageData(0, 0, bmp.width, bmp.height), blob }
  }
  const face = (protect) => [{ index: 0, side: 'both', shape: {}, skin: { ...SKIN }, makeup: {}, ...(protect ? { protect } : {}) }]
  const base = await render([])
  const plain = await render(face(null))
  const kept = await render(face(STROKES))
  // kutudaki ortalama mutlak fark (0..255)
  const diff = (a, b, box) => {
    const W = a.width, H = a.height
    const x0 = Math.round(box.x0 * W), x1 = Math.round(box.x1 * W), y0 = Math.round(box.y0 * H), y1 = Math.round(box.y1 * H)
    let sum = 0, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 4
      sum += (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2])) / 3
      n++
    }
    return Math.round((sum / n) * 100) / 100
  }
  const toB64 = async (blob) => {
    const u = new Uint8Array(await blob.arrayBuffer())
    let t = ''
    for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(t)
  }
  return {
    faces: s.faces?.length ?? 0,
    tattoo: { plain: diff(base.img, plain.img, TATTOO), kept: diff(base.img, kept.img, TATTOO) },
    piercing: { plain: diff(base.img, plain.img, PIERCING), kept: diff(base.img, kept.img, PIERCING) },
    cheek: { plain: diff(base.img, plain.img, CHEEK), kept: diff(base.img, kept.img, CHEEK) },
    files: { plain: await toB64(plain.blob), kept: await toB64(kept.blob) }
  }
}, { b64, TATTOO, PIERCING, CHEEK, STROKES, SKIN })

writeFileSync(join(outDir, 'koru-yok.png'), Buffer.from(res.files.plain, 'base64'))
writeFileSync(join(outDir, 'koru-var.png'), Buffer.from(res.files.kept, 'base64'))
delete res.files
console.log(JSON.stringify(res))

ok('Yüz bulundu', res.faces > 0, `yüz=${res.faces}`)
ok('Dövme korunuyor (fark en az %70 düşük)', res.tattoo.kept <= res.tattoo.plain * 0.3, `korumasız=${res.tattoo.plain} korumalı=${res.tattoo.kept}`)
ok('Hızma korunuyor (fark en az %70 düşük)', res.piercing.kept <= res.piercing.plain * 0.3, `korumasız=${res.piercing.plain} korumalı=${res.piercing.kept}`)
ok('Yanak yine yumuşuyor (fark %90+ korunur)', res.cheek.kept >= res.cheek.plain * 0.9 && res.cheek.plain > 0.5, `korumasız=${res.cheek.plain} korumalı=${res.cheek.kept}`)
// arayüz: anahtarı aç, tuvalde boya → belgeye bir iz yazılmalı
await win.evaluate(async () => (await window.__isil.store()).getState().update((d) => { d.retouch.faces = [{ index: 0, side: 'both', shape: {}, skin: { smooth: 80, blemish: 60 }, makeup: {} }] }))
await win.getByRole('switch', { name: 'Koruma fırçası' }).click()
const cv = await win.locator('canvas').first().boundingBox()
const cx = cv.x + cv.width * 0.45, cy = cv.y + cv.height * 0.55
await win.mouse.move(cx, cy)
await win.mouse.down()
for (let i = 1; i <= 8; i++) await win.mouse.move(cx + i * 4, cy + i * 6)
await win.mouse.up()
await win.waitForTimeout(500)
const ui = await win.evaluate(async () => (await window.__isil.store()).getState().doc.retouch.faces[0]?.protect ?? [])
await win.screenshot({ path: join(outDir, 'koru-arayuz.png') })
ok('Fırça izi belgeye yazıldı', ui.length === 1 && ui[0].pts.length >= 10, `iz=${ui.length} nokta=${(ui[0]?.pts.length ?? 0) / 2}`)
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
writeFileSync(join(outDir, 'koru-sonuc.json'), JSON.stringify({ date: new Date().toISOString(), ...res, results }, null, 2))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
