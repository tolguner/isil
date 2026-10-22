// Tasarım denetimi için ekran görüntüleri: ana ekranlar iki pencere boyutunda, her araç küçük pencerede.
// node tests/e2e/tasarim-tur.mjs <portre> <çıktı klasörü> [dil: tr|en]
import { _electron as electron } from 'playwright'
import { mkdirSync, readFileSync, readdirSync, statSync, existsSync } from 'fs'
import { join, basename } from 'path'
import { tempDir, linkOrCopy } from './_tmp.mjs'

const root = process.cwd()
const [photo, out, lang = 'tr'] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const userData = tempDir('isil-tasarim-')
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) linkOrCopy(join(dev, f), join(userData, 'models', f))
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
if (lang === 'en') await win.evaluate(async () => { const S = (await window.__isil.store()).getState; S().setSettings({ ...S().settings, language: 'en' }) })
const shot = async (name) => { await win.waitForTimeout(700); await win.screenshot({ path: join(out, name + '.png') }) }
const go = (screen) => win.evaluate(async (s) => (await window.__isil.store()).getState().go(s), screen)

for (const [w, h] of [[1440, 900], [1024, 700]]) {
  await win.setViewportSize({ width: w, height: h })
  const tag = `${w}`
  await go('home'); await shot(`${tag}-ana-bos`)
  await go('settings'); await shot(`${tag}-ayarlar`)
  await go('batch'); await shot(`${tag}-toplu`)
  await go('collage'); await shot(`${tag}-kolaj`)
  await go('stylist'); await shot(`${tag}-danisman`)
}
await win.setViewportSize({ width: 1440, height: 900 })
await win.evaluate(async ({ b64, name }) => window.__isil.openFile(name, b64), { b64: readFileSync(photo).toString('base64'), name: basename(photo) })
await win.waitForTimeout(3000)
await shot('1440-editor')
await go('home'); await shot('1440-ana-projeli')
await win.evaluate(async () => { const P = (await window.__isil.mod('platform')).platform; const S = (await window.__isil.store()).getState; const list = await P.listProjects(); S().openProject(await P.loadProject(list[0].id)) })
await win.waitForTimeout(2500)
await win.setViewportSize({ width: 1024, height: 700 })
const tabs = await win.evaluate(async () => (await window.__isil.mod('tools')).TABS.map((t) => ({ id: t.id, tools: t.tools.map((x) => x.id) })))
for (const tab of tabs) {
  for (const tool of tab.tools) {
    await win.evaluate(async ({ tab, tool }) => { const S = (await window.__isil.store()).getState; if (S().tool) S().closeTool(false); S().setTab(tab); if (S().tool !== tool) S().openTool(tool) }, { tab: tab.id, tool })
    await win.waitForTimeout(1500)
    await win.evaluate(async () => { const S = (await window.__isil.store()).getState; for (let i = 0; i < 40 && S().busy; i++) await new Promise((r) => setTimeout(r, 300)) })
    await shot(`1024-${tab.id}-${tool}`)
  }
}
await win.evaluate(async () => { const S = (await window.__isil.store()).getState; if (S().tool) S().closeTool(false) })
await app.evaluate(({ app }) => app.exit(0))
console.log('bitti')
