// Kimlik ölçümü: aynı fotoğraf ≈1, hafif ışık değişikliği yüksek, yüzü başka kişiyle değiştirilmiş fotoğraf düşük.
// AuraFace modeli motor içinde çalışır: ISIL_ENGINE_DIR ve KIMLIK_MODEL (glintr100.onnx yolu) gerekir.
// node tests/e2e/kimlik.mjs <portre A> <portre B>
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, copyFileSync } from 'fs'
import { join, basename } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const [a, b] = process.argv.slice(2)
const userData = tempDir('isil-kimlik-')
mkdirSync(join(userData, 'models'), { recursive: true })
copyFileSync(process.env.KIMLIK_MODEL, join(userData, 'models', 'auraface_glintr100.onnx'))
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const results = []
const check = (name, ok, info = '') => { results.push(ok); console.log(ok ? 'GEÇTİ ' : 'KALDI ', name, info) }

const load = (f) => win.evaluate(async ({ b64 }) => {
  const bm = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]))
  const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0)
  window.__img = window.__img || []; window.__img.push(c)
}, { b64: readFileSync(f).toString('base64') })
await load(a); await load(b)
const r = await win.evaluate(async () => {
  const V = await window.__isil.mod('vision')
  const I = await window.__isil.mod('identity')
  const [A, B] = window.__img
  const fa = await V.detectFaces(A)
  const fb = await V.detectFaces(B)
  // hafif düzenleme: biraz parlaklık
  const L = document.createElement('canvas'); L.width = A.width; L.height = A.height
  const lx = L.getContext('2d'); lx.filter = 'brightness(1.12) contrast(1.05)'; lx.drawImage(A, 0, 0)
  // yüz değişimi: B'nin yüzünü A'nın yüz konumuna hizalayarak yapıştır
  const fiveA = I.fivePoints(fa[0], A.width, A.height), fiveB = I.fivePoints(fb[0], B.width, B.height)
  const m = I.similarity(fiveB, fiveA)
  const Sw = document.createElement('canvas'); Sw.width = A.width; Sw.height = A.height
  const sx = Sw.getContext('2d'); sx.drawImage(A, 0, 0); sx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); sx.drawImage(B, 0, 0)
  const same = await I.identityScores(A, A, fa)
  const light = await I.identityScores(A, L, fa)
  const swap = await I.identityScores(A, Sw, fa)
  const restored = await I.identityScores(A, I.restoreFaces(A, Sw, fa), fa)
  return { same: same?.[0], light: light?.[0], swap: swap?.[0], restored: restored?.[0] }
})
console.log(JSON.stringify(r))
check('Aynı fotoğraf ≈ 1', r.same > 0.98)
check('Hafif ışık değişikliği eşiğin üstünde', r.light > 0.6)
check('Başka kişinin yüzü eşiğin altında', r.swap < 0.4)
check('Yüzleri geri koy kimliği düzeltir', r.restored > 0.8)
await app.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} geçti`)
process.exit(results.every(Boolean) ? 0 : 1)
