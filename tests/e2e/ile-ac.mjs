// "Işıl ile aç": komut satırında verilen fotoğraf açılışta yeni proje olarak açılır; dışa aktarma kanalı
// yol içeren adları ve bilinmeyen uzantıları kabul etmez.
// node tests/e2e/ile-ac.mjs <fotoğraf>
import { _electron as electron } from 'playwright'
import { mkdirSync, existsSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { tempDir } from './_tmp.mjs'

const root = process.cwd()
const file = resolve(process.argv[2] ?? '')
const userData = tempDir('isil-ileac-')
mkdirSync(join(userData, 'models'), { recursive: true })
const app = await electron.launch({ args: ['.', file], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const results = []
const check = (name, ok, info = '') => { results.push(ok); console.log(ok ? 'GEÇTİ ' : 'KALDI ', name, info) }

const opened = await win.waitForFunction(async () => {
  const S = (await window.__isil.store()).getState()
  return S.project ? { name: S.project.name, screen: S.screen } : null
}, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => null)
check('Komut satırındaki fotoğraf proje olarak açıldı', !!opened && opened.screen === 'editor', JSON.stringify(opened))

const out = tempDir('isil-ileac-out-')
const ex = await win.evaluate(async (dir) => {
  const P = (await window.__isil.mod('platform')).platform
  const bad = await P.exportSave({ bytes: new Uint8Array([1]), ext: 'exe', suggestedName: 'x', dir }).then(() => 'kabul', (e) => 'ret')
  const p = await P.exportSave({ bytes: new Uint8Array([1]), ext: 'jpg', suggestedName: '..\\..\\kacis/ad', dir })
  return { bad, p }
}, out)
check('Bilinmeyen uzantı reddedildi', ex.bad === 'ret')
check('Ad içindeki yol temizlendi, dosya seçilen klasörde', !!ex.p && ex.p.startsWith(out) && readdirSync(out).length === 1 && existsSync(ex.p), ex.p)

await app.close()
console.log(`\n${results.filter(Boolean).length}/${results.length} geçti`)
process.exit(results.every(Boolean) ? 0 : 1)
