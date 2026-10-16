// Ayarlar ekranı: dosya kalitesi seçimi. npm run build && node tests/e2e/settings.mjs [ekran görüntüsü yolu]
import { _electron as electron } from 'playwright'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { tempDir } from './_tmp.mjs'

const userData = tempDir('isil-settings-')
mkdirSync(join(userData, 'models'), { recursive: true })
const results = []
const ok = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${name}  ${info}`) }
const app = await electron.launch({ args: ['.'], cwd: process.cwd(), env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
await win.evaluate(async () => (await window.__isil.store()).getState().go('settings'))
await win.waitForTimeout(800)
if (process.argv[2]) await win.locator('section', { hasText: 'Dosya kalitesi' }).screenshot({ path: process.argv[2] })
const q = async () => win.evaluate(async () => (await window.__isil.store()).getState().settings.exportQuality)
ok('Varsayılan Dengeli seçili', (await win.getByRole('radio', { name: 'Dengeli', exact: true }).getAttribute('aria-checked')) === 'true', `kalite=${await q()}`)
await win.getByRole('radio', { name: 'Küçük', exact: true }).click()
await win.waitForTimeout(300)
ok('Küçük → 80', (await q()) === 80)
await win.getByRole('radio', { name: 'En iyi', exact: true }).click()
await win.waitForTimeout(300)
ok('En iyi → 100', (await q()) === 100)
ok('Sayı kutusu kalmadı', (await win.locator('section', { hasText: 'Dosya kalitesi' }).locator('input[type="number"]').count()) === 0)
ok('Sayfa hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '))
await app.close()
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
