// Arayüz taraması: her sekme ve her araç açılır, panel çizilir, konsola hata düşmez,
// "iptal" belgeyi değiştirmez. Ekran görüntüleri replica/audit/ui/ altına.
//   npm run build && node tests/e2e/ui-sweep.mjs
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, copyFileSync, statSync, existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const out = join(root, 'replica', 'audit', 'ui')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'isil-ui-'))
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) copyFileSync(join(dev, f), join(userData, 'models', f))

const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
await win.setViewportSize({ width: 1440, height: 900 })
let errs = []
win.on('console', (m) => { if (m.type() === 'error' && !/DevTools|favicon|XNNPACK|onnxruntime|VerifyEachNode|odml\.pa\.googleapis/i.test(m.text())) errs.push(m.text().slice(0, 200)) })
win.on('pageerror', (e) => errs.push('PAGE: ' + String(e).slice(0, 200)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const b64 = readFileSync(join(root, 'tests', 'fixtures', 'out', 'exif-orient-6.jpg')).toString('base64')
await win.evaluate((b) => window.__isil.openFile('portre.jpg', b), b64)
await win.waitForTimeout(2500)

const tabs = await win.evaluate(async () => (await window.__isil.mod('tools')).TABS.map((t) => ({ id: t.id, label: t.label[0], tools: t.tools.map((x) => ({ id: x.id, label: x.label[0] })) })))
const results = []
for (const tab of tabs) {
  for (const tool of tab.tools) {
    errs = []
    const r = await win.evaluate(async ({ tab, tool }) => {
      const S = (await window.__isil.store()).getState
      if (S().tool) S().closeTool(false)
      const before = JSON.stringify(S().doc)
      S().setTab(tab)
      await new Promise((r) => setTimeout(r, 300))
      if (S().tool !== tool) S().openTool(tool)
      await new Promise((r) => setTimeout(r, 1800))
      while (S().busy) await new Promise((r) => setTimeout(r, 300))
      const panel = document.querySelector('.panel, aside, [class*=panel]')
      const info = { open: S().tool === tool, panelText: (panel?.textContent || '').trim().length }
      S().closeTool(false)
      await new Promise((r) => setTimeout(r, 300))
      info.cancelClean = JSON.stringify(S().doc) === before
      return info
    }, { tab: tab.id, tool: tool.id }).catch((e) => ({ err: String(e).slice(0, 200) }))
    // ekran görüntüsü için aracı yeniden aç
    await win.evaluate(async ({ tab, tool }) => { const S = (await window.__isil.store()).getState; S().setTab(tab); if (S().tool !== tool) S().openTool(tool) }, { tab: tab.id, tool: tool.id }).catch(() => {})
    await win.waitForTimeout(900)
    await win.screenshot({ path: join(out, `${tab.id}-${tool.id}.png`) })
    await win.evaluate(async () => { const S = (await window.__isil.store()).getState; if (S().tool) S().closeTool(false) }).catch(() => {})
    const pass = r.open && r.panelText > 0 && r.cancelClean && errs.length === 0
    results.push({ tab: tab.id, tool: tool.id, label: tool.label, pass, ...r, errs })
    console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${tab.id}/${tool.id} (${tool.label})  ${JSON.stringify({ ...r, errs }).slice(0, 260)}`)
  }
}
await app.close()
writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2))
const failed = results.filter((r) => !r.pass).length
console.log(`\n${results.length - failed}/${results.length} geçti`)
process.exit(failed ? 1 : 0)
