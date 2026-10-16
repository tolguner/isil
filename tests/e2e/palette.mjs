// Ctrl+K kaydırıcı düzeyinde arama: npm run build && node tests/e2e/palette.mjs
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
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
