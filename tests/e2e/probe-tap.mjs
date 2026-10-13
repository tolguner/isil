// Dokun-seç modelinin çıktısını farklı girişlerle ölçer (hata ayıklama).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const app = await electron.launch({ args: ['.'], env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: mkdtempSync(join(tmpdir(), 'isil-probe-')) } })
const win = await app.firstWindow()
win.on('console', (m) => { if (/dokun/i.test(m.text())) console.log('[konsol]', m.text().slice(0, 200)) })
await win.waitForFunction(() => !!window.__isil)
const r = await win.evaluate(async () => {
  const v = await window.__isil.mod('vision')
  const bm = await createImageBitmap(await (await fetch('isil://app/test/group.jpg')).blob())
  const stat = (m) => { let mx = -Infinity, gt = 0; for (const x of m.data) { if (x > mx) mx = x; if (x > 0.5) gt++ } return { w: m.w, h: m.h, mx, gt } }
  const out = {}
  const variants = {
    norm: [{ x: 0.47, y: 0.86 }],
    px: [{ x: 0.47 * bm.width, y: 0.86 * bm.height }],
    stroke: [{ x: 0.46, y: 0.85 }, { x: 0.47, y: 0.86 }, { x: 0.48, y: 0.87 }]
  }
  for (const [name, pts] of Object.entries(variants)) {
    try {
      v.resetTapSelect()
      out[name] = stat(await v.tapSelect(bm, pts))
    } catch (e) {
      out[name] = String(e)
    }
  }
  return out
})
console.log(JSON.stringify(r))
await app.close()
