// Yaş ve ifade aracı: düğmeler, küçük yüz uyarısı, bir dönüşümün uygulanması ve yüz dışının değişmemesi.
//   npm run build && node tests/e2e/ageface-ui.mjs [küçük yüzlü görsel]   (dönüşüm adımı yerel YZ motoru gerektirir)
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [smallImg] = process.argv.slice(2)
const userData = tempDir('isil-agefaceui-')
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
const openTool = async () => {
  await win.evaluate(async () => {
    const s = (await window.__isil.mod('session')).session
    for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
    const S = (await window.__isil.store()).getState(); S.setTab('retouch'); S.openTool('ageface')
    for (let i = 0; i < 100 && !(s.faces && s.faces.length) ; i++) await new Promise((r) => setTimeout(r, 100))
    for (let i = 0; i < 100 && S.busy; i++) await new Promise((r) => setTimeout(r, 100))
  })
  await win.waitForTimeout(800)
}
if (smallImg) {
  await win.evaluate(async ({ b64, name }) => window.__isil.openFile(name, b64), { b64: readFileSync(smallImg).toString('base64'), name: basename(smallImg) })
  await openTool()
  const warn = await win.locator('.panel', { hasText: 'Yüz çok küçük' }).count()
  const dis = await win.getByRole('button', { name: 'Hafif gülümse' }).isDisabled()
  ok('Küçük yüzde uyarı var, düğmeler kapalı', warn > 0 && dis, JSON.stringify({ warn, dis }))
  await win.evaluate(async () => (await window.__isil.store()).getState().closeTool(false))
}
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await openTool()
const btns = await win.evaluate(() => [...document.querySelectorAll('.panel .presets button')].map((b) => ({ t: b.textContent, d: b.disabled })))
ok('Yedi dönüşüm düğmesi açık', btns.length === 7 && btns.every((b) => !b.d), JSON.stringify(btns.map((b) => b.t)))
if (engine) {
  const before = await win.evaluate(async () => {
    const s = (await window.__isil.mod('session')).session
    const f = await s.fullBase(); const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d').drawImage(f, 0, 0)
    window.__before = c
    window.__box = s.faceGeos(f.width, f.height)[0].bbox(0.6)
    return { w: f.width, h: f.height }
  })
  await win.getByRole('button', { name: 'Hafif gülümse' }).click()
  const t0 = Date.now()
  const done = await win.evaluate(async () => {
    const r = (await window.__isil.mod('aitools'))
    const S = (await window.__isil.store()).getState
    for (let i = 0; i < 1800; i++) { await new Promise((r) => setTimeout(r, 200)); if (!S().busy && document.querySelector('.panel-foot .btn.primary:not([disabled])')) return true }
    return false
  })
  ok('Dönüşüm bitiyor, Uygula açılıyor', done, `${Math.round((Date.now() - t0) / 1000)} sn`)
  await win.locator('.panel-foot .btn.primary').click()
  await win.waitForTimeout(1500)
  const after = await win.evaluate(async () => {
    const S = (await window.__isil.store()).getState()
    const s = (await window.__isil.mod('session')).session
    for (let i = 0; i < 50 && S.busy; i++) await new Promise((r) => setTimeout(r, 200))
    const op = S.doc.rasterOps.at(-1)
    const f = await s.fullBase(); const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d').drawImage(f, 0, 0)
    const A = window.__before.getContext('2d').getImageData(0, 0, c.width, c.height).data, B = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    const b = window.__box
    let inS = 0, inN = 0, outS = 0, outN = 0
    for (let y = 0; y < c.height; y += 3) for (let x = 0; x < c.width; x += 3) {
      const i = (y * c.width + x) * 4, d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])
      const inside = x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h
      if (inside) { inS += d; inN++ } else { outS += d > 24 ? 1 : 0; outN++ }
    }
    return { op: op && { type: op.type, tool: op.params.tool, change: op.params.change }, inFace: Math.round(inS / inN * 10) / 10, outside: Math.round(outS / outN * 10000) / 100, tool: S.tool }
  })
  ok('Uygulanınca kalıcı işlem olarak kaydediliyor', after.op?.tool === 'ageface' && after.op?.change === 'smile' && !after.tool, JSON.stringify(after))
  ok('Yüz değişiyor, yüz dışında belirgin değişen piksel yok', after.inFace > 1 && after.outside < 0.05, JSON.stringify({ inFace: after.inFace, outside: after.outside }))
} else console.log('ATLANDI: yerel YZ motoru yok, dönüşüm adımı sınanmadı')
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
