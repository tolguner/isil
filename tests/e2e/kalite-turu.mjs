// Kalite turu: npm run build && node tests/e2e/kalite-turu.mjs <görsel klasörü> <çıktı klasörü> [işlemler]
// Her görselde her işlemi uygular, çıktıyı (uzun kenar 700) ve ölçümleri yazar; hata ve süreleri sonuc.json'a koyar.
// Görseller farklı olmalı (ten rengi, yaş, gözlük, sakal, başörtüsü, grup, gece, gökyüzü, yazı, tam boy).
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [dir, outDir, only] = process.argv.slice(2)
const OPS = (only ?? 'orig,beauty,makeup,shape,pose,body,auto,night,look,sky,text,cutout').split(',')
mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-kalite-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
let errors = []
win.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
win.on('console', (m) => { if (m.type() === 'error' && !/DevTools|favicon|XNNPACK|onnxruntime|VerifyEachNode|odml/i.test(m.text())) errors.push(m.text().slice(0, 200)) })
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()
const report = {}

async function runOp(op) {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  const t0 = performance.now()
  const n = s.faces?.length ?? 0
  const faces = (shape, skin, makeup) => Array.from({ length: n }, (_, i) => ({ index: i, side: 'both', shape, skin, makeup }))
  const note = {}
  let raster = null
  const copyFull = async () => { const full = await s.fullBase(); const c = document.createElement('canvas'); c.width = full.width; c.height = full.height; c.getContext('2d').drawImage(full, 0, 0); return c }
  S().update((d) => { d.retouch.faces = []; d.body = null; d.effects = []; d.filter = null; d.local = undefined; d.adjust = Object.fromEntries(Object.keys(d.adjust).map((k) => [k, 0])) })
  if (op === 'beauty') S().update((d) => { d.retouch.faces = faces({ eyeSize: 10, slim: 10 }, { smooth: 45, blemish: 60, undereye: 45, eyes: 30, whiten: 15, teeth: 25, texture: 30 }, {}) })
  else if (op === 'makeup') S().update((d) => { d.retouch.faces = faces({}, {}, { lip: { preset: 'gloss', amount: 55, color: '#b8324a' }, liner: { preset: 'wing', amount: 70, color: '#141012' }, lash: { preset: 'natural', amount: 70 }, catch: { preset: 'dot', amount: 80 }, iris: { preset: null, amount: 45, color: '#4f9fd0' }, blush: { preset: null, amount: 35, color: '#f08a8a' }, freckle: { preset: null, amount: 50 } }) })
  else if (op === 'shape') S().update((d) => { d.retouch.faces = faces({ slim: 40, eyeSize: 30, noseWidth: -30, smile: 30, jaw: 20 }, {}, {}) })
  else if (op === 'pose') S().update((d) => { d.retouch.faces = faces({ yaw: 70, symmetry: 60, selfie: 60 }, {}, {}) })
  else if (op === 'body') S().update((d) => { d.body = { shape: { slim: 40, waist: 40, legs: 30 }, manual: null } })
  else if (op === 'auto') S().update((d) => { d.adjust.exposure = 10; d.adjust.shadows = 30; d.adjust.highlights = -20; d.adjust.vibrance = 15; d.adjust.clarity = 15 })
  else if (op === 'night') S().update((d) => { d.adjust.exposure = 45; d.adjust.shadows = 45; d.adjust.highlights = -25; d.adjust.structure = -30 })
  else if (op === 'look') S().update((d) => { d.filter = { id: 'altin-saat', amount: 70 }; d.effects = [{ id: 'suluboya', amount: 70 }] })
  else if (op === 'sky') {
    const sky = await window.__isil.mod('sky')
    const mk = await sky.skyMask(s.preview, await s.ensureSeg().catch(() => null))
    note.share = mk ? +mk.share.toFixed(3) : null
    note.backdrop = mk?.backdrop
    if (mk && mk.share > 0.03 && !mk.backdrop) {
      const im = new Image()
      im.src = 'skies/gunbatimi.jpg'
      await im.decode()
      raster = sky.composeSky(await copyFull(), im, mk, { brightness: 0, harmony: 50, shift: 0 })
    }
  } else if (op === 'text') {
    const T = await window.__isil.mod('textdet')
    const r = await T.detectText(s.preview, T.faceRects(s.faces ?? []))
    note.boxes = r ? r.boxes.length : 0
    if (r && r.boxes.length) {
      const c = await copyFull()
      const x = c.getContext('2d')
      x.strokeStyle = '#ff3b30'
      x.lineWidth = Math.max(3, c.width / 300)
      for (const b of r.boxes) x.strokeRect(b.x * c.width, b.y * c.height, b.w * c.width, b.h * c.height)
      raster = c
    }
  } else if (op === 'cutout') {
    const ops = await window.__isil.mod('ops')
    const m = await ops.removeBackground(s.preview, false)
    if (m) {
      const c = document.createElement('canvas')
      c.width = s.preview.width
      c.height = s.preview.height
      const x = c.getContext('2d')
      x.fillStyle = '#3cb371'
      x.fillRect(0, 0, c.width, c.height)
      const fg = document.createElement('canvas')
      fg.width = c.width
      fg.height = c.height
      const fx = fg.getContext('2d')
      fx.drawImage(s.preview, 0, 0)
      const md = m.getContext('2d').getImageData(0, 0, c.width, c.height)
      const id = fx.getImageData(0, 0, c.width, c.height)
      for (let i = 0; i < id.data.length; i += 4) id.data[i + 3] = md.data[i]
      fx.putImageData(id, 0, 0)
      x.drawImage(fg, 0, 0)
      raster = c
    }
  }
  let blob
  if (raster) {
    const k = Math.min(1, 700 / Math.max(raster.width, raster.height))
    const t = document.createElement('canvas')
    t.width = Math.round(raster.width * k)
    t.height = Math.round(raster.height * k)
    t.getContext('2d').drawImage(raster, 0, 0, t.width, t.height)
    blob = await new Promise((res) => t.toBlob(res, 'image/jpeg', 0.88))
  } else blob = (await s.exportBlob(S().doc, { exportFormat: 'jpeg', exportQuality: 88, exportMaxSide: 700 })).blob
  const u = new Uint8Array(await blob.arrayBuffer())
  let b64 = ''
  for (let i = 0; i < u.length; i += 0x8000) b64 += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return { ms: Math.round(performance.now() - t0), note, b64: btoa(b64) }
}

for (const f of files) {
  const id = basename(f).replace(/\.[^.]+$/, '')
  await win.evaluate(async ({ b64, name }) => window.__isil.openFile(name, b64), { b64: readFileSync(join(dir, f)).toString('base64'), name: f })
  const info = await win.evaluate(async () => {
    const s = (await window.__isil.mod('session')).session
    for (let i = 0; i < 300 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
    const t0 = performance.now()
    const faces = await s.ensureFaces().catch(() => [])
    const tf = performance.now() - t0
    const pose = await s.ensurePose().catch(() => null)
    const seg = await s.ensureSeg().catch(() => null)
    const F = await window.__isil.mod('face')
    const st = s.faceGeos().map((g) => { const x = F.faceState(g); return { open: +x.open.toFixed(2), smile: +x.smile.toFixed(2), w: Math.round(g.width) } })
    return { W: s.W, H: s.H, faces: faces.length, faceMs: Math.round(tf), pose: !!pose, seg: !!seg, state: st }
  })
  report[id] = { info, ops: {} }
  console.log(id, JSON.stringify(info))
  for (const op of OPS) {
    errors = []
    const r = await win.evaluate(runOp, op).catch((e) => ({ err: String(e).slice(0, 300) }))
    mkdirSync(join(outDir, op), { recursive: true })
    if (r.b64) writeFileSync(join(outDir, op, `${id}.jpg`), Buffer.from(r.b64, 'base64'))
    report[id].ops[op] = { ms: r.ms, note: r.note, err: r.err, pageErrors: errors.slice(0, 3) }
    if (r.err || errors.length) console.log('  ', op, 'HATA', r.err ?? '', errors.slice(0, 2).join(' | '))
  }
}
writeFileSync(join(outDir, 'sonuc.json'), JSON.stringify(report, null, 1))
await app.close()
console.log('bitti', files.length, 'görsel')
