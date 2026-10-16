// Motor kurulum testi (uzun, ~3 GB indirir): boş klasöre Python + PyTorch + diffusers kurar ve küçük bir model parçası indirir.
//   npm run build && node tests/e2e/engine-install.mjs
import { _electron as electron } from 'playwright'
import { tempDir } from './_tmp.mjs'
import { mkdtempSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const userData = tempDir('isil-eng-')
const engineDir = join(userData, 'engine')
const env = { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData, ISIL_ENGINE_DIR: engineDir }
delete env.ISIL_PYTHON
const app = await electron.launch({ args: ['.'], cwd: root, env })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const t0 = Date.now()
const r = await win.evaluate(async () => {
  const { platform } = await window.__isil.mod('platform')
  const seen = []
  const off = platform.onEngineProgress((p) => { if (p.text && seen[seen.length - 1] !== p.text) seen.push(p.text) })
  try {
    await platform.engineInstall('runtime')
    await platform.engineInstall('flux-common')
    const st = await platform.engineStatus()
    return { ok: st.installed.runtime, st, steps: seen.slice(-6) }
  } catch (e) {
    return { ok: false, err: String(e), steps: seen.slice(-6) }
  } finally {
    off()
  }
})
console.log(r.ok ? 'GEÇTİ' : 'KALDI', 'motor kurulumu', Math.round((Date.now() - t0) / 1000) + ' sn', JSON.stringify(r))
console.log('python.exe', existsSync(join(engineDir, 'python', 'python.exe')), 'flux-common', existsSync(join(engineDir, 'models', 'flux-common', '.ok')))
console.log('klasör:', engineDir)
await app.close()
process.exit(r.ok ? 0 : 1)
