// Veri kaybı ve hata günlüğü: araç açıkken yapılan değişiklik otomatik kaydedilir, kapanış denetimi kaydedilmemiş
// işi bildirir, arayüz hatası günlük dosyasına düşer, çöken panel beyaz ekran yerine hata kartı gösterir.
// npm run build && node tests/e2e/kayit-gunluk.mjs
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const userData = tempDir('isil-kayit-')
mkdirSync(join(userData, 'models'), { recursive: true })
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const results = []
const check = (name, ok, info = '') => { results.push(ok); console.log(ok ? 'GEÇTİ ' : 'KALDI ', name, info) }

await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.waitForTimeout(1500)

// 1) araç açıkken kaydırıcı değişikliği diske yazılır
const saved = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const P = await window.__isil.mod('platform')
  S().openTool('adjust')
  S().update((d) => { d.adjust.exposure = 37 })
  await new Promise((r) => setTimeout(r, 2200))
  const p = await P.platform.loadProject(S().project.id)
  return { inTool: !!S().tool, exposure: p.doc.adjust.exposure }
})
check('Araç açıkken değişiklik kaydedildi', saved.exposure === 37, JSON.stringify(saved))

// 2) iptal edilince eski hal de kaydedilir
const reverted = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const P = await window.__isil.mod('platform')
  S().closeTool(false)
  await new Promise((r) => setTimeout(r, 2200))
  const p = await P.platform.loadProject(S().project.id)
  return p.doc.adjust.exposure
})
check('İptal edilen değişiklik diskte de geri alındı', reverted === 0, String(reverted))

// 3) otomatik kayıt kapalıyken kapanış denetimi kaydedilmemiş işi bildirir
const close = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const proj = await window.__isil.mod('projects')
  S().setSettings({ ...S().settings, autosave: false })
  S().update((d) => { d.adjust.contrast = 20 })
  const a = await proj.beforeClose()
  await proj.saveNow()
  const b = await proj.beforeClose()
  S().setSettings({ ...S().settings, autosave: true })
  return { before: a.unsaved, after: b.unsaved }
})
check('Kaydedilmemiş değişiklik bildiriliyor, kayıttan sonra temiz', close.before === true && close.after === false, JSON.stringify(close))

// 4) arayüz hatası günlüğe yazılır
await win.evaluate(() => { setTimeout(() => { throw new Error('deneme-hatasi-xyz') }, 0) })
await win.waitForTimeout(800)
const logPath = join(userData, 'logs', 'isil.log')
const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : ''
check('Günlük dosyası oluştu ve hata yazıldı', log.includes('deneme-hatasi-xyz') && log.includes('başladı'), logPath)

// 5) çöken panel hata kartı gösterir, uygulama ayakta kalır
const crash = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  const tools = await window.__isil.mod('tools')
  const tab = tools.TABS.find((t) => t.tools.some((x) => x.id === 'adjust'))
  const def = tab.tools.find((x) => x.id === 'adjust')
  const orig = def.Panel
  def.Panel = () => { throw new Error('panel-coktu') }
  S().openTool('adjust')
  await new Promise((r) => setTimeout(r, 500))
  const card = !!document.querySelector('.crash.compact')
  const bar = !!document.querySelector('.titlebar')
  def.Panel = orig
  S().closeTool(false)
  return { card, bar }
})
check('Çöken panelde hata kartı var, uygulama ayakta', crash.card && crash.bar, JSON.stringify(crash))

await app.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} geçti`)
process.exit(results.every(Boolean) ? 0 : 1)
