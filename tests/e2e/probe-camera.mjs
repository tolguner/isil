// Kamera ekranının görüntü ürettiğini görüntüye bakmadan doğrular (yalnızca piksel istatistiği).
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const app = await electron.launch({ args: ['.'], env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: mkdtempSync(join(tmpdir(), 'isil-cam-')) } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil)
await win.evaluate(async () => (await window.__isil.store()).getState().go('camera'))
await win.waitForTimeout(4000)
const r = await win.evaluate(() => {
  const c = document.querySelector('.stage canvas')
  if (!c) return { canvas: false, err: document.querySelector('.empty')?.textContent }
  const t = document.createElement('canvas')
  t.width = 64
  t.height = 36
  const ctx = t.getContext('2d')
  ctx.drawImage(c, 0, 0, 64, 36)
  const d = ctx.getImageData(0, 0, 64, 36).data
  let sum = 0, nonBlack = 0
  for (let i = 0; i < d.length; i += 4) { const l = d[i] + d[i + 1] + d[i + 2]; sum += l; if (l > 30) nonBlack++ }
  return { canvas: true, w: c.width, h: c.height, meanLuma: Math.round(sum / (d.length / 4) / 3), nonBlackPct: Math.round((nonBlack / (d.length / 4)) * 100) }
})
console.log(JSON.stringify(r))
await app.close()
