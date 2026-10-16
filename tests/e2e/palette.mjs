// 0.4 arayüz işleri: Ctrl+K kaydırıcı araması, kategori noktası, tarif özeti, ana sayfa görev kısayolları
// npm run build && node tests/e2e/palette.mjs
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const userData = tempDir('isil-palette-')
mkdirSync(join(userData, 'models'), { recursive: true })
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(() => window.__isil.open('isil://app/test/portrait.jpg'))
await win.evaluate(async () => {
  const s = (await window.__isil.mod('session')).session
  for (let i = 0; i < 200 && !(s.W > 0 && s.lastOut); i++) await new Promise((r) => setTimeout(r, 100))
})
const search = async (q) => {
  await win.keyboard.press('Control+K')
  await win.getByRole('dialog', { name: 'Araç bul' }).waitFor()
  await win.keyboard.type(q)
  await win.waitForTimeout(150)
  const items = await win.locator('#palette-list li').allInnerTexts()
  return items
}
// 1) "bel" → Vücut aracındaki Bel kaydırıcısı
let items = await search('bel')
ok('"bel" kaydırıcıyı buluyor', items.some((t) => t.startsWith('Bel') && t.includes('Vücut')), JSON.stringify(items.slice(0, 4)))
await win.keyboard.press('Escape')
// 2) "çene" → Yüz şekli kaydırıcısı; Enter → araç açılır, alt sekme seçilir, kaydırıcı vurgulanır
items = await search('cene hatti')
ok('"cene hatti" (Türkçe karaktersiz) buluyor', items.some((t) => t.startsWith('Çene hattı')), JSON.stringify(items.slice(0, 3)))
await win.keyboard.press('Enter')
await win.waitForTimeout(700)
const st = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState()
  const flash = document.querySelector('.flash .slider-top label, .slider.flash label')?.textContent ?? null
  return { tab: S.tab, tool: S.tool, flash }
})
ok('Enter yüz aracını açıp kaydırıcıyı vurguluyor', st.tool === 'faceShape' && (st.flash ?? '').startsWith('Çene hattı'), JSON.stringify(st))
// 3) ayar kaydırıcısı
items = await search('golgeler')
ok('"golgeler" Ayarla kaydırıcısını buluyor', items.some((t) => t.startsWith('Gölgeler')), JSON.stringify(items.slice(0, 3)))
await win.keyboard.press('Escape')
// 4) değişen kategoride nokta: göz kaydırıcısı değişince Yüz aracında "Göz" sekmesi işaretli
const dots = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  S().update((d) => { d.retouch.faces = [{ index: 0, side: 'both', shape: { eyeSize: 30 }, skin: {}, makeup: {} }] })
  S().setTab('retouch'); S().openTool('faceShape')
  await new Promise((r) => setTimeout(r, 400))
  return [...document.querySelectorAll('.tabs [role="tab"]')].filter((b) => b.querySelector('.mod')).map((b) => b.textContent)
})
ok('Değişen sekmede nokta var, diğerlerinde yok', dots.length === 1 && dots[0].startsWith('Göz'), JSON.stringify(dots))
// 5) tarif özeti: "Altın ışıltı" seçilince değiştirdikleri listelenir; satıra dokununca Ayarla açılır
await win.evaluate(async () => { const S = (await window.__isil.store()).getState; S().closeTool(false); S().setTab('recipes') })
await win.waitForTimeout(300)
await win.getByRole('button', { name: 'Altın ışıltı' }).click()
await win.waitForTimeout(300)
const rows = await win.locator('.recipe-summary li').allInnerTexts()
ok('Tarif özeti değişenleri gösteriyor', rows.some((t) => t.startsWith('Pozlama')) && rows.some((t) => t.startsWith('Filtre')), JSON.stringify(rows))
await win.locator('.recipe-summary li', { hasText: 'Pozlama' }).getByRole('button').click()
await win.waitForTimeout(700)
const go = await win.evaluate(async () => {
  const S = (await window.__isil.store()).getState()
  return { tab: S.tab, tool: S.tool, flash: document.querySelector('.slider.flash label')?.textContent ?? null }
})
ok('Özet satırı kaydırıcıya götürüyor', go.tool === 'adjust' && (go.flash ?? '').startsWith('Pozlama'), JSON.stringify(go))
// 6) ana sayfa görev kısayolları
await win.evaluate(async () => { const m = await window.__isil.mod('projects'); await m.saveNow(); (await window.__isil.store()).getState().closeProject() })
await win.waitForTimeout(500)
const quick = await win.locator('.quick').innerText().catch(() => '')
ok('Ana sayfada görev kısayolları', ['Kalite artır', 'Yüz rötuşu', 'Vücut şekillendir'].every((t) => quick.includes(t)), quick.split(/\s*\n\s*/).join(' | ').slice(0, 200))
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
