// YZ efekt kartlarının örnek görsellerini üretir (bir kez; çıktı uygulamayla gelir).
// Kaynak: deneme setindeki kamu malı portre (eski-foto-kadin, Wikimedia Commons, Public domain).
//   npm run build && node tests/e2e/gen-style-previews.mjs   → src/renderer/public/style-previews/<id>.jpg
import { _electron as electron } from 'playwright'
import { tempDir } from './_tmp.mjs'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const out = join(root, 'src', 'renderer', 'public', 'style-previews')
mkdirSync(out, { recursive: true })
const ud = tempDir('isil-sp-')
mkdirSync(join(ud, 'models'), { recursive: true })
if (existsSync(join(root, 'dev-models', 'animegan_face_paint_v2.onnx'))) writeFileSync(join(ud, 'models', 'animegan_face_paint_v2.onnx'), readFileSync(join(root, 'dev-models', 'animegan_face_paint_v2.onnx')))
const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: ud, ISIL_ENGINE_DIR: join(root, 'dev-models', 'engine') } })
const win = await app.firstWindow()
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })
const styles = await win.evaluate(async () => (await window.__isil.mod('aitools')).STYLES.map((s) => ({ id: s.id, cat: s.cat, prompt: s.prompt, local: s.local })))
const src = readFileSync(join(root, 'dev-models', 'eval', 'set', 'eski-foto-kadin.jpg')).toString('base64')
for (const s of styles) {
  if (existsSync(join(out, s.id + '.jpg'))) continue
  const t0 = Date.now()
  const b64 = await win.evaluate(async ({ src, prompt, local, cat, SEED }) => {
    const bm = await createImageBitmap(new Blob([Uint8Array.from(atob(src), (c) => c.charCodeAt(0))]))
    // kare kırpım (yüz üst-orta), 512
    const side = Math.min(bm.width, bm.height)
    const c = document.createElement('canvas')
    c.width = c.height = 512
    // gardırop: kıyafet görünsün diye kırpım aşağıda (yüz yine karede)
    c.getContext('2d').drawImage(bm, (bm.width - side) / 2, cat === 'wardrobe' ? bm.height - side : 0, side, side, 0, 0, 512, 512)
    const png = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer())
    let ob
    if (cat === 'hair' || cat === 'wardrobe') {
      // saç/kıyafet: uygulamadaki gibi yalnız o bölge yeniden çizilir (yüz aynı kalır)
      const models = await window.__isil.mod('models')
      await models.claimGpu('engine', true)
      ob = await (await window.__isil.mod('restyle')).restyle(c, cat === 'hair' ? 'hair' : 'outfit', prompt)
    } else if (local === 'anime') {
      // yerel AnimeGAN (motor gerekmez)
      ob = await (await window.__isil.mod('ops')).animeStyle(c)
    } else {
      const { platform } = await window.__isil.mod('platform')
      const models = await window.__isil.mod('models')
      await models.claimGpu('engine', true)
      const outBytes = await platform.genEdit({ image: png, prompt, width: 512, height: 512, quality: 'fast', seed: Number(SEED) })
      ob = await createImageBitmap(new Blob([outBytes], { type: 'image/png' }))
    }
    const t = document.createElement('canvas')
    t.width = t.height = 160
    t.getContext('2d').drawImage(ob, 0, 0, 160, 160)
    const jb = await new Promise((r) => t.toBlob(r, 'image/jpeg', 0.82))
    const u = new Uint8Array(await jb.arrayBuffer())
    let s2 = ''
    for (let i = 0; i < u.length; i += 0x8000) s2 += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s2)
  }, { src, prompt: s.prompt, local: s.local, cat: s.cat, SEED: process.env.SEED || 7 })
  writeFileSync(join(out, s.id + '.jpg'), Buffer.from(b64, 'base64'))
  console.log(s.id, Math.round((Date.now() - t0) / 1000) + ' sn')
}
await app.close()
