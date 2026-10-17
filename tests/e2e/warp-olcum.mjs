// Bükme ölçümü: node tests/e2e/warp-olcum.mjs <görsel> <çıktı klasörü> [govde]
// Her kaydırıcı için nötr ve düzenlenmiş PNG yazar (akış analizi depo dışında yapılır).
import { _electron as electron } from 'playwright'
import { tempDir } from './_tmp.mjs'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, basename } from 'path'

const [img, outDir, mode] = process.argv.slice(2)
const BODY = mode === 'govde'
mkdirSync(outDir, { recursive: true })
const CASES = BODY
  ? { notr: {}, waist: { waist: 100 }, hips: { hips: 100 }, slim: { slim: 100 }, thighs: { thighs: 100 }, legs: { legs: 100 }, asiri: { slim: 100, waist: 100, hips: -100, thighs: 100, chest: 100, head: -100, arms: 100 }, slimKoru: { slim: 100, _koru: 1 }, waistKoru: { waist: 100, _koru: 1 }, legsKoru: { legs: 100, _koru: 1 } }
  : { notr: {}, slim: { slim: 100 }, width: { width: 100 }, eyeSize: { eyeSize: 100 }, resize: { resize: -100 }, vshape: { vshape: 100 }, liftContour: { liftContour: 100 }, liftForehead: { liftForehead: 100 }, liftEyes: { liftEyes: 100 }, liftMid: { liftMid: 100 }, liftMouth: { liftMouth: 100 }, asiri: { slim: 100, vshape: 100, jaw: 100, eyeSize: 100, smallFace: 100, chin: 100, noseSize: -100, lipSize: 100 } }
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: tempDir('isil-warp-') } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const b64 = readFileSync(img).toString('base64')
const out = await win.evaluate(async ({ b64, name, CASES, BODY }) => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  await window.__isil.openFile(name, b64)
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  S().setTab('retouch'); S().openTool(BODY ? 'body' : 'faceShape')
  for (let i = 0; i < 120 && !(BODY ? s.pose && s.seg : s.faces && s.faces.length); i++) await new Promise((r) => setTimeout(r, 250))
  const res = {}
  const fold = {}
  for (const [k, shape] of Object.entries(CASES)) {
    S().update((d) => {
      if (BODY) { const { _koru, ...sh } = shape; d.body = Object.keys(sh).length ? { shape: sh, manual: null, ...(_koru ? { protect: true } : {}) } : null }
      else d.retouch.faces = Object.keys(shape).length ? [{ index: 0, side: 'both', shape, skin: {}, makeup: {} }] : []
    })
    await new Promise((r) => setTimeout(r, 300))
    const { blob } = await s.exportBlob(S().doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 0 })
    const u = new Uint8Array(await blob.arrayBuffer())
    let t = ''
    for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000))
    res[k] = btoa(t)
    fold[k] = Math.round(s.foldScale * 1000) / 1000
  }
  return { faces: BODY ? (s.pose ? 1 : 0) : s.faces?.length ?? 0, res, fold }
}, { b64, name: basename(img), CASES, BODY })
for (const [k, v] of Object.entries(out.res)) writeFileSync(join(outDir, `isil-${k}.png`), Buffer.from(v, 'base64'))
console.log('yüz', out.faces, 'katlanma ölçeği', JSON.stringify(out.fold))
await app.close()
