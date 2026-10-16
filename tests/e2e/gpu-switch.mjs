// GPU paylaşımı regresyon testi: tarayıcı modeli (ISNet) ↔ motor (BiRefNet, FLUX) arasında 3 tur gidip gelir.
// Daha önce: 2. turdan sonra tarayıcı modelleri "model yüklenemedi" diyordu (WASM belleği), motor 30 sn'ye çıkıyordu.
//   npm run build && node tests/e2e/gpu-switch.mjs   (dev-models/engine gerekli)
import { _electron as electron } from 'playwright'
import { tempDir, linkOrCopy } from './_tmp.mjs'
import { mkdtempSync, mkdirSync, readdirSync, copyFileSync, statSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
const root = process.cwd(), dev = join(root, 'dev-models')
const ud = tempDir('isil-gpu-')
mkdirSync(join(ud, 'models'), { recursive: true })
for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(ud, 'models', f))
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: ud, ISIL_ENGINE_DIR: join(dev, 'engine') } })
const win = await app.firstWindow()
win.on('console', (m) => { if (m.type() === 'warning' && /başarısız|çalışmadı|bad_alloc/.test(m.text())) console.log('[uyarı]', m.text().slice(0, 300)) })
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const vram = () => execSync('nvidia-smi --query-gpu=memory.used --format=csv,noheader').toString().trim()
const b = readFileSync(join(dev, 'eval', 'set', 'sakal-turban.jpg')).toString('base64')
await win.evaluate(async (b) => { window.__src = await createImageBitmap(new Blob([Uint8Array.from(atob(b), (c) => c.charCodeAt(0))])) }, b)
let fails = 0
const mem = () => win.evaluate(() => ({ heapMB: Math.round(performance.memory.usedJSHeapSize / 1e6) }))
for (let round = 1; round <= 3; round++) {
  for (const model of ['isnet', 'birefnet', 'flux', 'isnet']) {
    const r = await win.evaluate(async (model) => {
      const ops = await window.__isil.mod('ops')
      const t = performance.now()
      try { let m; if (model === 'flux') { const g = await window.__isil.mod('generative'); const c = document.createElement('canvas'); c.width = 512; c.height = 512; c.getContext('2d').drawImage(window.__src, 0, 0, 512, 512); m = await g.localEdit(c, 'make it black and white') } else m = model === 'isnet' ? await ops.removeBackground(window.__src, false) : await ops.removeBackground(window.__src, true, model); return { ok: !!m, ms: Math.round(performance.now() - t) } } catch (e) { return { err: String(e).slice(0, 150) } }
    }, model)
    if (!r.ok) fails++
    console.log(r.ok ? 'GEÇTİ' : 'KALDI', round, model, JSON.stringify(r), 'vram', vram(), JSON.stringify(await mem()))
  }
}
await app.close()
console.log(fails ? `${fails} adım başarısız` : '12/12 geçti')
process.exit(fails ? 1 : 0)
