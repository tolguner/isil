// Yüz bükmesi ölçümü: node tests/e2e/warp-olcum.mjs <görsel> <çıktı klasörü>
// Her kaydırıcı için nötr ve düzenlenmiş PNG yazar (akış analizi depo dışında yapılır).
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, basename } from 'path'

const [img, outDir] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const CASES = { notr: {}, slim: { slim: 100 }, width: { width: 100 }, eyeSize: { eyeSize: 100 }, resize: { resize: -100 }, vshape: { vshape: 100 } }
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: mkdtempSync(join(tmpdir(), 'isil-warp-')) } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const b64 = readFileSync(img).toString('base64')
const out = await win.evaluate(async ({ b64, name, CASES }) => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  await window.__isil.openFile(name, b64)
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  S().setTab('retouch'); S().openTool('faceShape')
  for (let i = 0; i < 120 && !(s.faces && s.faces.length); i++) await new Promise((r) => setTimeout(r, 250))
  const res = {}
  for (const [k, shape] of Object.entries(CASES)) {
    S().update((d) => { d.retouch.faces = Object.keys(shape).length ? [{ index: 0, side: 'both', shape, skin: {}, makeup: {} }] : [] })
    await new Promise((r) => setTimeout(r, 300))
    const { blob } = await s.exportBlob(S().doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 0 })
    const u = new Uint8Array(await blob.arrayBuffer())
    let t = ''
    for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000))
    res[k] = btoa(t)
  }
  return { faces: s.faces?.length ?? 0, res }
}, { b64, name: basename(img), CASES })
for (const [k, v] of Object.entries(out.res)) writeFileSync(join(outDir, `isil-${k}.png`), Buffer.from(v, 'base64'))
console.log('yüz', out.faces)
await app.close()
