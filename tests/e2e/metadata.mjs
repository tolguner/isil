// Dışa aktarma meta verisi: konum silinir, çekim tarihi ve kamera korunur, yön 1 olur; üretken YZ adımı varsa
// XMP'de IPTC DigitalSourceType yazılır; "çekim bilgilerini koru" kapalıysa EXIF hiç yazılmaz.
// node tests/e2e/metadata.mjs <GPS ve EXIF içeren bir JPEG>
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const file = process.argv[2]
if (!file) { console.log('kullanım: node tests/e2e/metadata.mjs <jpeg>'); process.exit(2) }
const userData = tempDir('isil-meta-')
mkdirSync(join(userData, 'models'), { recursive: true })
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const results = []
const check = (name, ok, info = '') => { results.push(ok); console.log(ok ? 'GEÇTİ ' : 'KALDI ', name, info) }

await win.evaluate(async ({ b64, name }) => window.__isil.openFile(name, b64), { b64: readFileSync(file).toString('base64'), name: basename(file) })
const r = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 300 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const text = async (meta, ai) => {
    const doc = structuredClone(S().doc)
    if (ai) doc.rasterOps.push({ id: 'x', type: 'gen', file: doc.base ?? '', params: { tool: 'ai', ai: true }, at: '' })
    const { blob } = await s.exportBlob(doc, { exportFormat: 'jpeg', exportQuality: 90, exportMaxSide: 800, exportMeta: meta })
    const u = new Uint8Array(await blob.arrayBuffer())
    let str = ''
    for (let i = 0; i < Math.min(u.length, 70000); i++) str += String.fromCharCode(u[i])
    return str
  }
  const keep = await text('keep', false)
  const ai = await text('keep', true)
  const strip = await text('strip', false)
  const kb = await (async () => { const doc = structuredClone(S().doc); const { blob } = await s.exportBlob(doc, { exportFormat: 'jpeg', exportQuality: 90, exportMaxSide: 800, exportMeta: 'keep' }); const u = new Uint8Array(await blob.arrayBuffer()); let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b) })()
  return {
    keepB64: kb,
    keepExif: keep.includes('Exif\0\0'), keepCanon: keep.includes('Canon'), keepGps: /GPS|\x88\x25/.test(keep.slice(0, 4000)) && keep.includes('N\0'),
    keepXmp: keep.includes('Işıl'.replace('ş', '\xc5\x9f').replace('ı', '\xc4\xb1').replace('ı', '\xc4\xb1')) || keep.includes('CreatorTool'),
    keepAiMark: keep.includes('DigitalSourceType'), aiMark: ai.includes('compositeWithTrainedAlgorithmicMedia'),
    stripExif: strip.includes('Exif\0\0'), stripXmp: strip.includes('CreatorTool')
  }
})
if (process.env.META_OUT) writeFileSync(process.env.META_OUT, Buffer.from(r.keepB64, 'base64'))
delete r.keepB64
check('EXIF korunuyor (kamera bilgisi)', r.keepExif && r.keepCanon, JSON.stringify(r))
check('Konum silindi', !r.keepGps)
check('XMP CreatorTool var, YZ yoksa YZ işareti yok', r.keepXmp && !r.keepAiMark)
check('Üretken YZ adımında DigitalSourceType yazıldı', r.aiMark)
check('"Koru" kapalıyken EXIF yok, XMP var', !r.stripExif && r.stripXmp)

await app.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} geçti`)
process.exit(results.every(Boolean) ? 0 : 1)
