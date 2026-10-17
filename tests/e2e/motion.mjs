// 3B hareketli fotoğraf: derinlik hazırlanır, önizleme canlanır, döngü videosu kaydedilir ve oynatılabilir.
//   npm run build && node tests/e2e/motion.mjs [kare klasörü]
import { _electron as electron } from 'playwright'
import { mkdirSync, readdirSync, statSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const shots = process.argv[2]
const userData = tempDir('isil-motion-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
})
const doc0 = await win.evaluate(async () => JSON.stringify((await window.__isil.store()).getState().doc))
await win.evaluate(async () => { const S = (await window.__isil.store()).getState(); S.setTab('effects'); S.openTool('motion') })
const ready = await win.evaluate(async () => {
  const m = (await window.__isil.mod('motion')).motion
  const t0 = performance.now()
  for (let i = 0; i < 600 && !m.depth; i++) await new Promise((r) => setTimeout(r, 100))
  return { ok: !!m.depth, ms: Math.round(performance.now() - t0), w: m.img?.width, h: m.img?.height }
})
ok('Derinlik hazırlanıyor', ready.ok, JSON.stringify(ready))
await win.waitForTimeout(500)
// önizleme canlanıyor: iki farklı anda kare farklı
const anim = await win.evaluate(async () => {
  const c = document.querySelector('canvas[data-motion-preview]')
  if (!c) return { err: 'önizleme yok' }
  const grab = () => { const t = document.createElement('canvas'); t.width = 64; t.height = 96; t.getContext('2d').drawImage(c, 0, 0, 64, 96); return t.getContext('2d').getImageData(0, 0, 64, 96).data }
  const a = grab()
  await new Promise((r) => setTimeout(r, 700))
  const b = grab()
  let s = 0
  for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i])
  return { diff: Math.round((s / (a.length / 4)) * 100) / 100 }
})
ok('Önizleme hareket ediyor', anim.diff > 0.5, JSON.stringify(anim))
// paralaks: yakın (yüz) uzaktan (arka plan) daha çok kayıyor
const par = await win.evaluate(async () => {
  const M = await window.__isil.mod('motion')
  const m = M.motion
  const c = document.createElement('canvas')
  c.width = m.img.width; c.height = m.img.height
  const r = new M.MotionRenderer(c, m.img, m.depth)
  const read = (ph) => { r.draw('sway', 100, 0, ph); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0); return t.getContext('2d').getImageData(0, 0, c.width, c.height).data }
  const A = read(0.25), B = read(0.75)
  // derinliğe göre iki bölge: en yakın %20 ve en uzak %40
  const dc = document.createElement('canvas'); dc.width = c.width; dc.height = c.height
  dc.getContext('2d').drawImage(m.depth, 0, 0, c.width, c.height)
  const D = dc.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let nS = 0, nN = 0, fS = 0, fN = 0
  for (let i = 0; i < D.length; i += 16) {
    const d = D[i], v = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])
    if (d > 200) { nS += v; nN++ } else if (d < 90) { fS += v; fN++ }
  }
  r.dispose()
  return { near: Math.round(nS / Math.max(nN, 1)), far: Math.round(fS / Math.max(fN, 1)), nN, fN }
})
ok('Yakın bölgeler uzaktakinden çok kayıyor (odak uzakta)', par.near > par.far * 1.5, JSON.stringify(par))
if (shots) {
  for (const [i, ph] of [[0, 0], [1, 0.25], [2, 0.5], [3, 0.75]]) {
    const png = await win.evaluate(async (ph) => {
      const M = await window.__isil.mod('motion'); const m = M.motion
      const c = document.createElement('canvas'); c.width = m.img.width; c.height = m.img.height
      const r = new M.MotionRenderer(c, m.img, m.depth); r.draw('circle', 100, 50, ph)
      const t = document.createElement('canvas'); t.width = c.width; t.height = c.height; t.getContext('2d').drawImage(c, 0, 0); r.dispose()
      return t.toDataURL('image/png').split(',')[1]
    }, ph)
    writeFileSync(join(shots, `motion-${i}.png`), Buffer.from(png, 'base64'))
  }
}
// video kaydı (3 sn) ve oynatma
const vid = await win.evaluate(async () => {
  const M = await window.__isil.mod('motion')
  M.motion.seconds = 3
  const t0 = performance.now()
  const r = await M.recordLoop({ maxSide: 720 })
  const ms = Math.round(performance.now() - t0)
  const url = URL.createObjectURL(r.blob)
  const v = document.createElement('video')
  v.muted = true
  v.src = url
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video açılmadı')) })
  // webm süresi kimi zaman Infinity gelir; sona sarınca düzelir
  if (!isFinite(v.duration)) { v.currentTime = 1e9; await new Promise((res) => (v.ontimeupdate = res)) }
  return { type: r.type, kb: Math.round(r.blob.size / 1024), w: v.videoWidth, h: v.videoHeight, dur: Math.round(v.duration * 10) / 10, ms }
}).catch((e) => ({ err: String(e).slice(0, 200) }))
ok('Video kaydediliyor ve oynatılabiliyor', !vid.err && vid.kb > 20 && vid.w > 0 && vid.dur >= 2.5 && vid.dur <= 3.6, JSON.stringify(vid))
await win.evaluate(async () => (await window.__isil.store()).getState().closeTool(false))
const doc1 = await win.evaluate(async () => JSON.stringify((await window.__isil.store()).getState().doc))
ok('Belge değişmiyor', doc0 === doc1)
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
