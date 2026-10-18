// Karın kası aracı: npm run build && node tests/e2e/physique-ui.mjs <tişörtsüz gövde görseli>
// Portrede uyarı, gövde görselinde anlık önizleme, uygulama (YZ kapalı ve motor varsa açık) ve bölge dışının değişmemesi.
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [img] = process.argv.slice(2)
if (!img) { console.log('kullanım: node tests/e2e/physique-ui.mjs <görsel>'); process.exit(2) }
const userData = tempDir('isil-physique-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
const engine = existsSync(join(dev, 'engine', 'python', '.ok'))
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData, ...(engine ? { ISIL_ENGINE_DIR: join(dev, 'engine') } : {}) } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const open = async () => {
  await win.evaluate(async () => {
    const s = (await window.__isil.mod('session')).session
    for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
    const S = (await window.__isil.store()).getState(); S.setTab('retouch'); S.openTool('abs')
    await new Promise((r) => setTimeout(r, 500))
    for (let i = 0; i < 200 && S.busy; i++) await new Promise((r) => setTimeout(r, 100))
    for (let i = 0; i < 100 && (await window.__isil.store()).getState().busy; i++) await new Promise((r) => setTimeout(r, 100))
  })
  await win.waitForTimeout(800)
}
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await open()
const warn = await win.locator('.panel .card').innerText().catch(() => '')
ok('Gövdesiz portrede uyarı', /Gövde bulunamadı|Karın açıkta değil/.test(warn), warn.split('\n')[0])
await win.evaluate(async () => (await window.__isil.store()).getState().closeTool(false))
await win.evaluate(async ({ b64, name }) => window.__isil.openFile(name, b64), { b64: readFileSync(img).toString('base64'), name: basename(img) })
await open()
const pv = await win.evaluate(async () => {
  const R = await window.__isil.mod('aitools').catch(() => null)
  const c = document.querySelector('.stage canvas[style*="position: absolute"], canvas[style*="pointer-events: none"]')
  const sl = document.querySelector('.panel .slider .track')
  return { overlay: !!c, slider: sl && !sl.classList.contains('disabled'), applyOn: !!document.querySelector('.panel-foot .btn.primary:not([disabled])') }
})
ok('Gövdede önizleme açık, Uygula etkin', pv.overlay && pv.slider && pv.applyOn, JSON.stringify(pv))
const runApply = async (ai) => {
  await win.evaluate(async () => {
    const s = (await window.__isil.mod('session')).session
    const f = await s.fullBase(); const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d').drawImage(f, 0, 0); window.__before = c
    window.__key = s.baseKey
  })
  const sw = win.locator('.panel .setting [role="switch"]')
  if ((await sw.getAttribute('aria-checked')) !== String(ai)) await sw.click()
  const t0 = Date.now()
  await win.locator('.panel-foot .btn.primary').click()
  await win.evaluate(async () => { const S = (await window.__isil.store()).getState; for (let i = 0; i < 1800 && (S().tool || S().busy); i++) await new Promise((r) => setTimeout(r, 200)) })
  return win.evaluate(async (sec) => {
    const S = (await window.__isil.store()).getState()
    const s = (await window.__isil.mod('session')).session
    const op = S.doc.rasterOps.at(-1)
    for (let i = 0; i < 100 && s.baseKey === window.__key; i++) await new Promise((r) => setTimeout(r, 100))
    const pose = await s.ensurePose()
    const f = await s.fullBase(); const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d').drawImage(f, 0, 0)
    const A = window.__before.getContext('2d').getImageData(0, 0, c.width, c.height).data, B = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    // karın kutusu: omuz-kalça arası, omuz genişliği kadar
    const W = c.width, H = c.height, P = (i) => ({ x: pose[i].x * W, y: pose[i].y * H })
    const S0 = { x: (P(11).x + P(12).x) / 2, y: (P(11).y + P(12).y) / 2 }, H0 = { x: (P(23).x + P(24).x) / 2, y: (P(23).y + P(24).y) / 2 }
    const sw = Math.abs(P(11).x - P(12).x)
    const bx0 = Math.min(S0.x, H0.x) - sw * 0.45, bx1 = Math.max(S0.x, H0.x) + sw * 0.45, by0 = S0.y + (H0.y - S0.y) * 0.3, by1 = H0.y + sw * 0.1
    let inS = 0, inN = 0, out = 0, outN = 0
    for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) {
      const i = (y * W + x) * 4, d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])
      if (x > bx0 && x < bx1 && y > by0 && y < by1) { inS += d; inN++ } else { out += d > 24 ? 1 : 0; outN++ }
    }
    return { op: op && op.params, inside: Math.round(inS / inN * 10) / 10, outsideChanged: Math.round(out / outN * 10000) / 100, sec }
  }, Math.round((Date.now() - t0) / 1000))
}
let r = await runApply(false)
ok('Işık-gölgeyle uygulanıyor, karın dışında değişiklik yok', r.op?.tool === 'abs' && r.op?.ai === false && r.inside > 0.5 && r.outsideChanged < 0.1, JSON.stringify(r))
if (engine) {
  await win.evaluate(async () => (await window.__isil.store()).getState().undo())
  await open()
  const st2 = await win.evaluate(() => ({ card: document.querySelector('.panel .card')?.textContent ?? '', on: !!document.querySelector('.panel-foot .btn.primary:not([disabled])') }))
  if (!st2.on) console.log('ikinci açılış:', JSON.stringify(st2))
  r = await runApply(true)
  ok('YZ ile uygulanıyor, karın dışında belirgin değişiklik yok', r.op?.tool === 'abs' && r.op?.ai === true && r.inside > 0.5 && r.outsideChanged < 0.5, JSON.stringify(r))
} else console.log('ATLANDI: yerel YZ motoru yok')
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
