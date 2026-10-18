// Sanatsal efektler ve kayıtlı görünümler: npm run build && node tests/e2e/arteffects.mjs [çıktı klasörü]
import { _electron as electron } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'
const outDir = process.argv[2]
if (outDir) mkdirSync(outDir, { recursive: true })
const userData = tempDir('isil-art-'); mkdirSync(join(userData, 'models'), { recursive: true })
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => { const s = (await window.__isil.mod('session')).session; for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100)) })
for (const id of ['suluboya', 'guas', 'neon', 'karakalem', 'cizgi-roman']) {
  const r = await win.evaluate(async (id) => {
    const S = (await window.__isil.store()).getState
    const s = (await window.__isil.mod('session')).session
    S().update((d) => { d.effects = [{ id, amount: 100 }] })
    const { blob } = await s.exportBlob(S().doc, { exportFormat: 'jpeg', exportQuality: 90, exportMaxSide: 900 })
    const bm = await createImageBitmap(blob)
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0)
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    let m = 0; for (let i = 0; i < d.length; i += 4) m += d[i]; m /= d.length / 4
    const u = new Uint8Array(await blob.arrayBuffer()); let s2 = ''; for (let i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return { mean: Math.round(m), b64: btoa(s2) }
  }, id)
  if (outDir) writeFileSync(join(outDir, `${id}.jpg`), Buffer.from(r.b64, 'base64'))
  ok(`${id} çiziliyor`, r.mean > 5 && r.mean < 250, `ortalama ${r.mean}`)
}
// kayıtlı görünüm: kaydet → başka ayar → uygula → geri gelir; ayarlarda kalıcı
await win.evaluate(async () => { const S = (await window.__isil.store()).getState(); S.update((d) => { d.effects = []; d.adjust.exposure = 33; d.adjust.temperature = -21; d.filter = { id: 'altin-saat', amount: 70 } }); S.setTab('recipes'); S.openTool('recipes') })
await win.waitForTimeout(500)
await win.getByRole('tab', { name: 'Benim' }).click()
await win.waitForTimeout(400)
await win.getByRole('textbox', { name: 'Görünüm adı' }).fill('Benim sıcak')
await win.getByRole('button', { name: 'Kaydet', exact: true }).click()
await win.waitForTimeout(500)
const saved = await win.evaluate(async () => { const S = (await window.__isil.store()).getState(); S.update((d) => { d.adjust.exposure = 0; d.adjust.temperature = 0; d.filter = null }); return S.settings.myLooks?.map((l) => l.name) })
await win.getByRole('button', { name: 'Benim sıcak' }).first().click()
await win.waitForTimeout(300)
const applied = await win.evaluate(async () => { const d = (await window.__isil.store()).getState().doc; return { e: d.adjust.exposure, t: d.adjust.temperature, f: d.filter?.id } })
ok('Görünüm kaydedilip başka zaman uygulanıyor', saved?.[0] === 'Benim sıcak' && applied.e === 33 && applied.t === -21 && applied.f === 'altin-saat', JSON.stringify({ saved, applied }))
await win.getByRole('button', { name: 'Benim sıcak görünümünü sil' }).click({ force: true })
await win.waitForTimeout(300)
const left = await win.evaluate(async () => (await window.__isil.store()).getState().settings.myLooks?.length ?? 0)
ok('Görünüm silinebiliyor', left === 0, String(left))
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((x) => !x.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
