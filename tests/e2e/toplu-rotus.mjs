// Toplu rötuş: birkaç farklı portrede tek dokunuş ön ayarı her yüze uygulanır, geçici projeler silinir.
// node tests/e2e/toplu-rotus.mjs <portre>...
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const files = process.argv.slice(2)
const userData = tempDir('isil-toplu-')
mkdirSync(join(userData, 'models'), { recursive: true })
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const results = []
const check = (name, ok, info = '') => { results.push(ok); console.log(ok ? 'GEÇTİ ' : 'KALDI ', name, info) }

for (const f of files) {
  const r = await win.evaluate(async ({ b64, name }) => {
    const B = await window.__isil.mod('batch')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const S = (await window.__isil.store()).getState
    const doc = structuredClone(S().doc)
    doc.retouch.faces = []; doc.rasterOps = []; doc.base = undefined; doc.layers = []
    const t0 = performance.now()
    const blob = await B.batchRetouch(bytes, name, doc, { preset: 'fresh', amount: 100 }, 'jpeg')
    const ms = Math.round(performance.now() - t0)
    // önce/sonra farkı: yüz bölgesi ve kenar şeridi
    const a = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'from-image' }), b = await createImageBitmap(blob)
    const W = 256, H = Math.round((256 * a.height) / a.width)
    const px = (bm) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(bm, 0, 0, W, H); return x.getImageData(0, 0, W, H).data }
    const pa = px(a), pb = px(b)
    let tot = 0, edge = 0, en = 0
    for (let i = 0; i < W * H; i++) {
      const d = Math.abs(pa[i * 4] - pb[i * 4]) + Math.abs(pa[i * 4 + 1] - pb[i * 4 + 1]) + Math.abs(pa[i * 4 + 2] - pb[i * 4 + 2])
      tot += d
      const x = i % W, y = (i / W) | 0
      if (x < 8 || y < 8 || x >= W - 8) { edge += d; en++ }
    }
    const P = (await window.__isil.mod('platform')).platform
    const left = (await P.listProjects()).filter((p) => p.name.startsWith('~toplu-')).length
    return { ms, mean: +(tot / (W * H)).toFixed(2), edge: +(edge / en).toFixed(2), left, size: blob.size }
  }, { b64: readFileSync(f).toString('base64'), name: basename(f) })
  check(`${basename(f)}: rötuş uygulandı, kenar korunuyor, geçici proje silindi`, r.mean > 0.5 && r.edge < r.mean && r.left === 0, JSON.stringify(r))
}
await app.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} geçti`)
process.exit(results.every(Boolean) ? 0 : 1)
