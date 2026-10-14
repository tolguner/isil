// Aşama 1 denetimi: kenar durumları + çıktıların ölçülmesi (replica/test-plani.md).
//   python tests/fixtures/make.py && npm run build && node tests/e2e/audit.mjs
// Çıktılar replica/audit/ altına (git dışı) yazılır; sonuçlar replica/audit/results.json.
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, copyFileSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const fx = join(root, 'tests', 'fixtures', 'out')
if (!existsSync(fx)) throw new Error('önce: python tests/fixtures/make.py')
const out = join(root, 'replica', 'audit')
mkdirSync(out, { recursive: true })
const userData = mkdtempSync(join(tmpdir(), 'isil-audit-'))
// NO_MODELS=1: modelsiz ilk kullanım; yoksa dev-models/ kopyalanır
mkdirSync(join(userData, 'models'), { recursive: true })
const dev = join(root, 'dev-models')
if (!process.env.NO_MODELS && existsSync(dev)) for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) copyFileSync(join(dev, f), join(userData, 'models', f))
const only = (process.env.ONLY || '').split(',').filter(Boolean)
const want = (k) => !only.length || only.some((o) => k.startsWith(o))

const results = []
const ok = (id, name, pass, info = {}) => {
  results.push({ id, name, pass, info })
  console.log(`${pass ? 'GEÇTİ' : 'KALDI'}  ${id}  ${name}  ${JSON.stringify(info).slice(0, 300)}`)
}

const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData } })
const win = await app.firstWindow()
const errors = []
win.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })

// sayfa içi yardımcılar
await win.evaluate(() => {
  window.__stats = async (blob) => {
    const bm = await createImageBitmap(blob)
    const c = new OffscreenCanvas(Math.min(bm.width, 512), Math.min(bm.height, 512))
    const ctx = c.getContext('2d')
    ctx.drawImage(bm, 0, 0, c.width, c.height)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    let s = 0, s2 = 0, amin = 255
    const n = d.length / 4
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      s += l; s2 += l * l
      if (d[i + 3] < amin) amin = d[i + 3]
    }
    const r = { w: bm.width, h: bm.height, type: blob.type, kb: Math.round(blob.size / 1024), mean: Math.round(s / n), std: Math.round(Math.sqrt(s2 / n - (s / n) ** 2)), alphaMin: amin }
    bm.close()
    return r
  }
  window.__b64 = async (blob) => {
    const u = new Uint8Array(await blob.arrayBuffer())
    let s = ''
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  }
  window.__ready = async (ms = 30000) => {
    const S = (await window.__isil.store()).getState
    const s = (await window.__isil.mod('session')).session
    const t0 = performance.now()
    while (performance.now() - t0 < ms) {
      if (S().screen === 'editor' && s.baseBlob && s.project?.id === S().project?.id && s.W > 0 && s.lastOut && !S().busy) return true
      if (S().screen !== 'editor' && !S().busy && performance.now() - t0 > 1500) return false
      await new Promise((r) => setTimeout(r, 100))
    }
    return false
  }
  window.__export = async (opts = {}) => {
    const S = (await window.__isil.store()).getState
    const s = (await window.__isil.mod('session')).session
    const r = await s.exportBlob(S().doc, { exportFormat: opts.format ?? 'jpeg', exportQuality: opts.quality ?? 90, exportMaxSide: opts.maxSide ?? 0 })
    return { blob: r.blob, stats: await window.__stats(r.blob) }
  }
})

const fresh = async () => win.evaluate(async () => {
  const S = (await window.__isil.store()).getState
  if (S().project) {
    await (await window.__isil.mod('projects')).saveNow()
    S().closeProject()
  }
  for (const t of S().toasts) S().dismissToast(t.id)
})
const openFx = async (file) => {
  const b64 = readFileSync(join(fx, file)).toString('base64')
  return win.evaluate(async ({ file, b64 }) => {
    const S = (await window.__isil.store()).getState
    const t0 = performance.now()
    await window.__isil.openFile(file, b64)
    const ready = await window.__ready()
    const s = (await window.__isil.mod('session')).session
    return { ready, ms: Math.round(performance.now() - t0), W: s.W, H: s.H, name: S().project?.name, toasts: S().toasts.map((t) => t.kind + ': ' + t.text) }
  }, { file, b64 })
}
const saveBlob = async (name, expr, arg) => {
  const b64 = await win.evaluate(expr, arg)
  if (b64) writeFileSync(join(out, name), Buffer.from(b64, 'base64'))
}

// ---------- F00: dosya açma, her biçim ----------
const files = readdirSync(fx)
const expectFail = new Set(['corrupt.jpg', 'not-an-image.jpg'])
for (const [i, f] of files.entries()) {
  const id = `F00-${String(i + 1).padStart(2, '0')}`
  if (!want(id) && !want('F00')) continue
  await fresh()
  try {
    const r = await openFx(f)
    let info = { file: f.slice(0, 50), ...r }
    if (r.ready) {
      const ex = await win.evaluate(async () => (await window.__export({ maxSide: 1200 })).stats)
      info.export = ex
      await saveBlob(`F00-${i + 1}.jpg`, async () => window.__b64((await window.__export({ maxSide: 900 })).blob))
    }
    let pass = expectFail.has(f) ? !r.ready && r.toasts.some((t) => t.startsWith('error')) : r.ready && info.export.std > 3
    if (f === 'exif-orient-6.jpg') pass = pass && r.H > r.W // dikey görünmeli
    if (f === 'transparent.png') pass = pass && info.export !== undefined
    ok(id, 'aç: ' + f.slice(0, 40), pass, info)
  } catch (e) {
    ok(id, 'aç: ' + f.slice(0, 40), false, { err: String(e).slice(0, 300) })
  }
}

// ---------- dışa aktarma ----------
if (want('X')) {
  await fresh()
  await openFx('transparent.png')
  const t = await win.evaluate(async () => (await window.__export({ format: 'png' })).stats)
  ok('X-01', 'saydam PNG açılıp PNG verilince saydamlık korunur', t.alphaMin < 50, t)

  await fresh()
  const o = await openFx('exif-orient-6.jpg')
  const r = await win.evaluate(async () => {
    const res = {}
    for (const f of ['jpeg', 'png', 'webp']) res[f] = (await window.__export({ format: f })).stats
    res.max1024 = (await window.__export({ maxSide: 1024 })).stats
    res.q60 = (await window.__export({ quality: 60 })).stats
    res.q100 = (await window.__export({ quality: 100 })).stats
    return res
  })
  ok('X-02', 'biçimler doğru MIME ile çıkar', r.jpeg.type === 'image/jpeg' && r.png.type === 'image/png' && r.webp.type === 'image/webp', { jpeg: r.jpeg.type, png: r.png.type, webp: r.webp.type })
  ok('X-03', 'EXIF yönlü foto dışa aktarımda da dik', r.jpeg.h > r.jpeg.w, { w: r.jpeg.w, h: r.jpeg.h, opened: [o.W, o.H] })
  ok('X-04', 'en uzun kenar 1024 sınırı', Math.max(r.max1024.w, r.max1024.h) === 1024, r.max1024)
  ok('X-05', 'kalite düşünce dosya küçülür', r.q60.kb < r.jpeg.kb && r.jpeg.kb < r.q100.kb, { q60: r.q60.kb, q90: r.jpeg.kb, q100: r.q100.kb })
  ok('X-06', 'proje adı uzantısız', o.name === 'exif-orient-6', { name: o.name })

  await fresh()
  const h = await openFx('huge-48mp.jpg')
  const big = await win.evaluate(async () => {
    const t0 = performance.now()
    const r = (await window.__export({ quality: 90 })).stats
    return { ...r, ms: Math.round(performance.now() - t0) }
  }).catch((e) => ({ err: String(e) }))
  ok('X-07', '48 MP tam çözünürlükte dışa aktarma', big.w === 8000 && big.h === 6000, { open: h.ms, ...big })

  await fresh()
  const longName = files.find((f) => f.startsWith('Çok uzun'))
  const ln = await openFx(longName)
  ok('X-08', 'uzun Türkçe/emoji adlı dosya açılır, ad korunur', ln.ready && ln.name?.startsWith('Çok uzun ğüşiöç') && ln.name.includes('😀'), { name: ln.name?.slice(0, 50), len: ln.name?.length })
}

// ---------- F10: toplu dışa aktarma aynı ad ----------
if (want('F10')) {
  const dir = mkdtempSync(join(tmpdir(), 'isil-batch-'))
  const r = await win.evaluate(async (dir) => {
    const { platform } = await window.__isil.mod('platform')
    const a = await platform.exportSave({ bytes: new Uint8Array([1, 2, 3]), ext: 'jpg', suggestedName: 'IMG_0001-isil', dir })
    const b = await platform.exportSave({ bytes: new Uint8Array([9, 9, 9, 9]), ext: 'jpg', suggestedName: 'IMG_0001-isil', dir })
    return { a, b }
  }, dir)
  const files = readdirSync(dir)
  ok('F10-E1', 'aynı adlı iki çıktı birbirinin üstüne yazmaz', files.length === 2, { files, ...r })
}

// ---------- F02: geri al / yinele ----------
if (want('F02')) {
  await fresh()
  await openFx('exif-orient-6.jpg')
  const r = await win.evaluate(async () => {
    const S = (await window.__isil.store()).getState
    const base = JSON.stringify(S().doc)
    for (let i = 1; i <= 20; i++) S().commit((d) => void (d.adjust.exposure = i * 2))
    const after = S().doc.adjust.exposure
    for (let i = 0; i < 20; i++) S().undo()
    const undone = JSON.stringify(S().doc) === base
    for (let i = 0; i < 20; i++) S().redo()
    const redone = S().doc.adjust.exposure
    S().undo()
    S().commit((d) => void (d.adjust.contrast = 10))
    const branch = { exposure: S().doc.adjust.exposure, canRedo: S().future.length }
    return { after, undone, redone, branch }
  })
  ok('F02-H1', '20 adım geri al → başlangıç, 20 ileri al → son', r.after === 40 && r.undone && r.redone === 40, r)
  ok('F02-E1', 'geri aldıktan sonra yeni değişiklik ileri geçmişi siler', r.branch.exposure === 38 && r.branch.canRedo === 0, r.branch)
}

// ---------- F06: kırp / döndür ----------
if (want('F06')) {
  await fresh()
  await openFx('exif-orient-6.jpg') // 700x1050
  const r = await win.evaluate(async () => {
    const S = (await window.__isil.store()).getState
    S().commit((d) => { d.crop.x = 0; d.crop.y = 0.1; d.crop.w = 1; d.crop.h = 700 / 1050; d.crop.ratio = '1:1' })
    const sq = (await window.__export()).stats
    // arayüzdeki "Sağa 90°" düğmesi gibi: çeyrek dönüş + kırpmayı sıfırla
    S().commit((d) => { d.crop.quarter = 1; d.crop = { ...d.crop, x: 0, y: 0, w: 1, h: 1, ratio: null } })
    const q = (await window.__export()).stats
    S().commit((d) => { d.crop.quarter = 0; d.crop.x = 0; d.crop.y = 0; d.crop.w = 1; d.crop.h = 1; d.crop.ratio = null; d.crop.rotation = 10 })
    const rot = (await window.__export()).stats
    return { sq, q, rot }
  })
  ok('F06-H1', '1:1 kırpma kare çıkar', Math.abs(r.sq.w - r.sq.h) <= 1, r.sq)
  ok('F06-H2', '90° döndürme en ve boyu yer değiştirir', r.q.w === 1050 && r.q.h === 700, r.q)
  ok('F06-E1', 'ince döndürmede boş köşe yok (doldurma yakınlaştırması)', r.rot.alphaMin === 255, r.rot)
  await saveBlob('F06-rot10.jpg', async () => window.__b64((await window.__export({ maxSide: 900 })).blob))
}

// ---------- F07: metin katmanı ----------
if (want('F07')) {
  await fresh()
  await openFx('exif-orient-6.jpg')
  const r = await win.evaluate(async () => {
    const S = (await window.__isil.store()).getState
    const L = await window.__isil.mod('layers')
    const before = (await window.__export()).stats
    // arayüzde yazıldığı gibi: metin değişince fitText çalışır
    S().commit((d) => { const l = { id: 't1', type: 'text', x: 0.5, y: 0.2, scale: 1, rotation: 0, opacity: 1, props: { ...L.defaultText(), text: 'Merhaba Işıl çğüşİı 😀' } }; L.fitText(l); d.layers.push(l) })
    const after = (await window.__export()).stats
    const kept = S().doc.layers.length
    const l = S().doc.layers[0]
    return { before: before.mean, after: after.mean, std: [before.std, after.std], kept, scale: +l.scale.toFixed(3) }
  })
  ok('F07-H1', 'Türkçe + emoji metin katmanı çıktıya çizilir', r.kept === 1 && (r.after !== r.before || r.std[0] !== r.std[1]), r)
  ok('F07-E1', 'uzun metin dar fotoğrafta tuvale sığdırılır', r.scale < 1, r)
  await saveBlob('F07-text.jpg', async () => window.__b64((await window.__export({ maxSide: 900 })).blob))
}

// ---------- F03: kesim → saydam PNG ----------
if (want('F03')) {
  await fresh()
  await openFx('exif-orient-6.jpg')
  const r = await win.evaluate(async () => {
    const S = (await window.__isil.store()).getState
    const s = (await window.__isil.mod('session')).session
    const ops = await window.__isil.mod('ops')
    const P = await window.__isil.mod('projects')
    const m = await ops.removeBackground(s.preview)
    if (!m) return { err: 'maske yok' }
    await P.commitMask(m.getContext('2d').getImageData(0, 0, m.width, m.height))
    S().commit((d) => void (d.background.useCutout = true))
    await new Promise((r) => setTimeout(r, 500))
    return (await window.__export({ format: 'png' })).stats
  })
  ok('F03-H1', 'arka plan kesilip PNG verilince saydam', r.alphaMin === 0, r)
  await saveBlob('F03-cutout.png', async () => window.__b64((await window.__export({ format: 'png', maxSide: 900 })).blob))
}

// ---------- F01: rötuş, yüz durumları ----------
if (want('F01')) {
  for (const [id, f, expect] of [['F01-E1', 'no-face.jpg', 0], ['F01-H1', 'exif-orient-6.jpg', 1]]) {
    await fresh()
    await openFx(f)
    const r = await win.evaluate(async () => {
      const s = (await window.__isil.mod('session')).session
      const faces = await s.ensureFaces()
      return { faces: faces.length }
    })
    ok(id, `yüz algılama: ${f}`, r.faces === expect, r)
  }
  await fresh()
  await openFx('three-faces.jpg')
  const g = await win.evaluate(async () => ({ faces: (await (await window.__isil.mod('session')).session.ensureFaces()).length }))
  ok('F01-E2', 'üç yüzlü fotoğrafta üç yüz', g.faces === 3, g)
}

// ---------- F08: proje kaydet / yeniden aç ----------
if (want('F08')) {
  await fresh()
  await openFx('exif-orient-6.jpg')
  const r = await win.evaluate(async () => {
    const S = (await window.__isil.store()).getState
    const P = await window.__isil.mod('projects')
    S().commit((d) => { d.adjust.exposure = 25; d.filter = { id: 'altin-saat', amount: 70 } })
    await P.saveNow()
    const id = S().project.id
    const doc = JSON.stringify(S().doc)
    S().closeProject()
    await P.openExisting(id)
    await window.__ready()
    return { same: JSON.stringify(S().doc) === doc, exposure: S().doc.adjust.exposure }
  })
  ok('F08-H1', 'kaydedilen proje aynı düzenlemelerle açılır', r.same, r)
}

// bozuk/sahte dosyaları bilerek açtırıyoruz: onların çözme hatası beklenen
const fatal = errors.filter((e) => !/Download the React DevTools|favicon|XNNPACK|onnxruntime|VerifyEachNodeIsAssignedToAnEp|odml\.pa\.googleapis|source image could not be decoded/i.test(e))
ok('Z-01', 'konsolda beklenmeyen hata yok', fatal.length === 0, { errors: fatal.slice(0, 6) })
await app.close()
writeFileSync(join(out, 'results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2))
const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} geçti`)
process.exit(failed.length ? 1 : 0)
