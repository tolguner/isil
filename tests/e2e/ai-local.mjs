// Yerel YZ testi (ağır): CUDA ONNX modelleri + üretken motor (FLUX.2 klein, Qwen3-VL).
//   npm run build && node tests/e2e/ai-local.mjs   (ONLY=flux,chat ile seçilebilir; motor dev-models/engine/python yoksa ISIL_PYTHON=<python.exe>)
// Modeller dev-models/ (ONNX) ve dev-models/engine/models/ (motor) altında olmalı.
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const userData = mkdtempSync(join(tmpdir(), 'isil-ai-'))
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) copyFileSync(join(dev, f), join(userData, 'models', f))
const engine = existsSync(join(dev, 'engine', 'models')) && (!!process.env.ISIL_PYTHON || existsSync(join(dev, 'engine', 'python', '.ok')))
const only = (process.env.ONLY || '').split(',').filter(Boolean)
const want = (k) => !only.length || only.includes(k)

const results = []
const ok = (name, pass, info = '') => {
  results.push({ name, pass, info })
  console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`)
}
const out = join(root, 'replica', 'ai-results')
mkdirSync(out, { recursive: true })

// PACKAGED=1: paketlenmiş uygulamayı (release/win-unpacked) dene
const target = process.env.PACKAGED ? { executablePath: join(root, 'release', 'win-unpacked', 'Isil.exe') } : { args: ['.'], cwd: root }
const app = await electron.launch({
  ...target,
  env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData, ...(engine ? { ISIL_ENGINE_DIR: join(dev, 'engine') } : {}) }
})
const win = await app.firstWindow()
const errors = []
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
// test görseli paketlenmiş uygulamada yok: Node'dan blob URL olarak ver
const photo = readFileSync(join(root, 'src', 'renderer', 'public', 'test', 'portrait.jpg')).toString('base64')
await win.evaluate((b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  window.__photo = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }))
  return window.__isil.open(window.__photo)
}, photo)
await win.waitForFunction(async () => { const s = (await window.__isil.mod('session')).session; return s.W > 0 && !!s.lastOut }, null, { timeout: 20000 })
await win.evaluate(async () => {
  const bm = await createImageBitmap(await (await fetch(window.__photo)).blob())
  const ops = await window.__isil.mod('ops')
  window.__src = ops.toCanvas(bm, 600, 900)
  window.__png = async (c) => {
    const b = await new Promise((r) => c.toBlob(r, 'image/png'))
    const u = new Uint8Array(await b.arrayBuffer())
    let s = ''
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  }
})

const run = async (label, key, fn) => {
  if (!want(key)) return
  const t0 = Date.now()
  try {
    const r = await win.evaluate(fn)
    const { png, ...info } = r ?? {}
    ok(label, !!r?.ok, JSON.stringify({ ...info, ms: Date.now() - t0 }))
    if (png) writeFileSync(join(out, key + '.png'), Buffer.from(png, 'base64'))
  } catch (e) {
    ok(label, false, String(e).slice(0, 400))
  }
}

await run('Detaylı kesim (BiRefNet, CUDA)', 'birefnet', async () => {
  const s = (await window.__isil.mod('session')).session
  const ops = await window.__isil.mod('ops')
  const m = await ops.removeBackground(window.__src, true)
  const models = await window.__isil.mod('models')
  return { ok: !!m, provider: models.lastProvider, png: m && (await window.__png(m)) }
})
await run('Kalite artırma 4× (UltraSharp V2, CUDA)', 'ultrasharp', async () => {
  const s = (await window.__isil.mod('session')).session
  const ops = await window.__isil.mod('ops')
  const r = await ops.upscale(ops.toCanvas(window.__src, 200, 300))
  const models = await window.__isil.mod('models')
  return { ok: !!r && r.width === 800, provider: models.lastProvider, png: r && (await window.__png(r)) }
})
await run('Yüz onarma (GFPGAN, CUDA)', 'codeformer', async () => {
  const s = (await window.__isil.mod('session')).session
  const ops = await window.__isil.mod('ops')
  const small = ops.toCanvas(window.__src, 300, 450)
  const vision = await window.__isil.mod('vision')
  const faces = (await vision.detectFaces(small)).length
  const r = await ops.restoreFaces(small)
  return { ok: !!r, faces, png: r && (await window.__png(r)) }
})
await run('Derinlik (Depth Anything V2 Base, CUDA)', 'depth', async () => {
  const s = (await window.__isil.mod('session')).session
  const ops = await window.__isil.mod('ops')
  const r = await ops.depthMap(window.__src)
  return { ok: !!r && r.width > 100, w: r?.width, png: r && (await window.__png(r)) }
})

if (engine) {
  await run('Motor durumu', 'status', async () => {
    const { platform } = await window.__isil.mod('platform')
    const st = await platform.engineStatus()
    return { ok: st.available && st.installed.runtime && st.installed['flux-fast'], ...st }
  })
  await run('YZ düzenleyici (FLUX.2 klein 4B)', 'flux', async () => {
    const g = await window.__isil.mod('generative')
    const r = await g.localEdit(window.__src, 'Make it a rainy night in a neon-lit city street behind her. Keep the person exactly the same.')
    return { ok: !!r && r.width === window.__src.width, png: r && (await window.__png(r)) }
  })
  await run('YZ ile değiştir (FLUX.2 klein inpaint)', 'inpaint', async () => {
    const g = await window.__isil.mod('generative')
    const src = window.__src
    const m = document.createElement('canvas')
    m.width = src.width
    m.height = src.height
    const c = m.getContext('2d')
    c.fillStyle = '#000'
    c.fillRect(0, 0, m.width, m.height)
    c.fillStyle = '#fff'
    c.fillRect(0, m.height * 0.68, m.width, m.height * 0.32)
    const r = await g.localMaskedEdit(src, m, 'a dark green leather jacket')
    return { ok: !!r, png: r && (await window.__png(r)) }
  })
  await run('YZ Editör: kişileri koru — yüz piksel piksel aynı', 'keep', async () => {
    const g = await window.__isil.mod('generative')
    const vision = await window.__isil.mod('vision')
    const src = window.__src
    const r = await g.localEditKeepPeople(src, 'Change the background to a snowy mountain landscape')
    if (!r) return { ok: false }
    const f = (await vision.detectFaces(src))[0]
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0
    for (const p of f) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
    const box = [x0 * src.width, y0 * src.height, (x1 - x0) * src.width, (y1 - y0) * src.height].map(Math.round)
    const a = src.getContext('2d').getImageData(...box).data
    const b = r.getContext('2d').getImageData(...box).data
    let diff = 0
    for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
    const faceDiff = +(diff / (a.length / 4) / 3).toFixed(2)
    // arka plan değişmiş olmalı (sol üst köşe)
    const ca = src.getContext('2d').getImageData(0, 0, 60, 60).data, cb = r.getContext('2d').getImageData(0, 0, 60, 60).data
    let bg = 0
    for (let i = 0; i < ca.length; i += 4) bg += Math.abs(ca[i] - cb[i]) + Math.abs(ca[i + 1] - cb[i + 1]) + Math.abs(ca[i + 2] - cb[i + 2])
    const bgDiff = +(bg / (ca.length / 4) / 3).toFixed(1)
    return { ok: faceDiff < 2 && bgDiff > 10, faceDiff, bgDiff, png: await window.__png(r) }
  })
  await run('YZ Editör: siyah-beyaz girdi siyah-beyaz kalır', 'gray', async () => {
    const g = await window.__isil.mod('generative')
    const ops = await window.__isil.mod('ops')
    const c = ops.toCanvas(window.__src, 400, 600)
    const x = c.getContext('2d')
    const id = x.getImageData(0, 0, c.width, c.height)
    for (let i = 0; i < id.data.length; i += 4) id.data[i] = id.data[i + 1] = id.data[i + 2] = Math.round(0.299 * id.data[i] + 0.587 * id.data[i + 1] + 0.114 * id.data[i + 2])
    x.putImageData(id, 0, 0)
    const r = await g.localEdit(c, 'Put her on a sunny beach with a blue sky')
    return { ok: !!r && g.isGrayscale(r), gray: r && g.isGrayscale(r), png: r && (await window.__png(r)) }
  })
  await run('Stil danışmanı (Qwen3-VL 4B)', 'chat', async () => {
    const g = await window.__isil.mod('generative')
    const t = await g.localChat([{ role: 'user', text: 'Bu fotoğraftaki kişiye hangi ruj tonu yakışır? Kısa yanıt ver.', image: window.__src }], 'Sen kısa ve somut konuşan bir stil danışmanısın. Türkçe yanıt ver.')
    return { ok: !!t && t.length > 10, text: t }
  })
}

const fatal = errors.filter((e) => !/Download the React DevTools|favicon|XNNPACK|onnxruntime|VerifyEachNodeIsAssignedToAnEp|odml\.pa\.googleapis/i.test(e))
ok('Konsolda hata yok', fatal.length === 0, fatal.slice(0, 5).join(' | '))
await app.close()
writeFileSync(join(out, 'results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2))
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
