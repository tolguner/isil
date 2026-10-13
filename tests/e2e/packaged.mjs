// Paketlenmiş uygulamanın açıldığını doğrular: npm run dist && node tests/e2e/packaged.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const root = process.cwd()
const app = await electron.launch({ executablePath: join(root, 'release/win-unpacked/Isil.exe'), env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: mkdtempSync(join(tmpdir(), 'isil-pkg-')) } })
const win = await app.firstWindow()
const errs = []
win.on('pageerror', (e) => errs.push(String(e)))
await win.waitForSelector('.hero', { timeout: 20000 })
await win.screenshot({ path: join(root, 'replica/clone-screens/S01-home-packaged.png') })
const r = await win.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 600; c.height = 800
  const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 600, 800); g.addColorStop(0, '#ffb547'); g.addColorStop(1, '#3a2a5a'); x.fillStyle = g; x.fillRect(0, 0, 600, 800)
  const b = await new Promise((res) => c.toBlob(res, 'image/png'))
  return { hook: !!window.__isil, title: document.title, pngBytes: b.size }
})
console.log(JSON.stringify(r), 'errors:', errs.length)
await app.close()
