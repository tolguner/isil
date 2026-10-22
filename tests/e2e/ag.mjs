// Ağ denetimi: tipik bir düzenleme oturumunda (fotoğraf aç, yüz bul, rötuş, makyaj, dışa aktar) uygulama dışarıya
// hiçbir istek göndermemeli. Gizlilik iddiasının ("fotoğrafın hiçbir yere gitmez") testi; MediaPipe'ın kullanım
// günlüğü denemesi gibi istekler CSP ile engellenmeli ve hiç ağa çıkmamalı.
// node tests/e2e/ag.mjs <fotoğraf>
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync } from 'fs'
import { join, basename } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const file = process.argv[2]
const userData = tempDir('isil-ag-')
mkdirSync(join(userData, 'models'), { recursive: true })
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
// ana süreçte tüm oturum isteklerini kaydet (yerel şemalar hariç)
await app.evaluate(({ session }) => {
  globalThis.__net = []
  session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
    if (!/^(isil|file|data|blob|devtools|chrome-extension):/.test(d.url)) globalThis.__net.push(d.url)
    cb({})
  })
})
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const results = []
const check = (name, ok, info = '') => { results.push(ok); console.log(ok ? 'GEÇTİ ' : 'KALDI ', name, info) }

await win.evaluate(async ({ b64, name }) => window.__isil.openFile(name, b64), { b64: readFileSync(file).toString('base64'), name: basename(file) })
const r = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 300 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
  const faces = await s.ensureFaces()
  await s.ensureSeg().catch(() => null)
  await s.ensurePose().catch(() => null)
  S().update((d) => { d.retouch.faces = faces.map((_, i) => ({ index: i, side: 'both', shape: { slim: 20 }, skin: { smooth: 40 }, makeup: { lip: { preset: 'satin', amount: 50, color: '#b8324a' } } })); d.adjust.exposure = 10 })
  await new Promise((r) => setTimeout(r, 1500))
  const { blob } = await s.exportBlob(S().doc, { exportFormat: 'jpeg', exportQuality: 90, exportMaxSide: 1200 })
  return { faces: faces.length, size: blob.size }
})
await win.waitForTimeout(1500)
const net = await app.evaluate(() => globalThis.__net)
check('Düzenleme oturumu tamamlandı', r.faces > 0 && r.size > 1000, JSON.stringify(r))
check('Dışarıya hiç istek gitmedi', net.length === 0, JSON.stringify(net.slice(0, 5)))

await app.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} geçti`)
process.exit(results.every(Boolean) ? 0 : 1)
