// Kişi bulma ölçümü (yoldan geçenleri silme): npm run build && node tests/e2e/people.mjs <görsel> [çıktı.png]
// Kutuları ve kişi maskelerini görselin üstüne çizer; kaç kişi bulunduğunu yazar.
import { _electron as electron } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
import { basename } from 'path'
import { tempDir } from './_tmp.mjs'

const [img, out] = process.argv.slice(2)
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: tempDir('isil-people-') } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const res = await win.evaluate(async ({ b64, name }) => {
  const s = (await window.__isil.mod('session')).session
  const v = await window.__isil.mod('vision')
  await window.__isil.openFile(name, b64)
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const t0 = performance.now()
  const boxes = await v.detectPeople(s.preview)
  const t1 = performance.now()
  const W = s.preview.width, H = s.preview.height
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')
  ctx.drawImage(s.preview, 0, 0)
  const ov = ctx.createImageData(W, H)
  for (const [k, b] of boxes.entries()) {
    const m = await v.personMaskInBox(s.preview, b, W, H)
    const hue = [[255, 80, 80], [80, 200, 255], [255, 200, 60], [120, 255, 120], [220, 120, 255]][k % 5]
    for (let i = 0; i < m.length; i++) if (m[i] > 0.5) { ov.data[i * 4] = hue[0]; ov.data[i * 4 + 1] = hue[1]; ov.data[i * 4 + 2] = hue[2]; ov.data[i * 4 + 3] = 110 }
  }
  const t2 = performance.now()
  const oc = document.createElement('canvas'); oc.width = W; oc.height = H; oc.getContext('2d').putImageData(ov, 0, 0)
  ctx.drawImage(oc, 0, 0)
  ctx.lineWidth = 2
  for (const b of boxes) { ctx.strokeStyle = '#fff'; ctx.strokeRect(b.x * W, b.y * H, b.w * W, b.h * H); ctx.fillStyle = '#fff'; ctx.font = '12px sans-serif'; ctx.fillText(b.score.toFixed(2), b.x * W + 2, b.y * H + 12) }
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9))
  const u = new Uint8Array(await blob.arrayBuffer())
  let t = ''
  for (let i = 0; i < u.length; i += 0x8000) t += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return { n: boxes.length, detMs: Math.round(t1 - t0), maskMs: Math.round(t2 - t1), boxes: boxes.map((b) => [+(b.x).toFixed(3), +(b.y).toFixed(3), +(b.w).toFixed(3), +(b.h).toFixed(3), +b.score.toFixed(2)]), jpg: btoa(t) }
}, { b64: readFileSync(img).toString('base64'), name: basename(img) })
if (out) writeFileSync(out, Buffer.from(res.jpg, 'base64'))
delete res.jpg
console.log(JSON.stringify(res))
console.log('hata', errors.length)
await app.close()
