// Aşama 2: YZ kalite ölçümü. Deneme seti: dev-models/eval/set (tests/fixtures/eval_set.py).
//   npm run build && ONLY=faces,cutout,upscale,restore,depth,erase,flux4,flux9,vlm node tests/e2e/eval.mjs
// Çıktılar dev-models/eval/out/<bölüm>/, ölçümler dev-models/eval/out/<bölüm>.json (git dışı).
import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync, statSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const root = process.cwd()
const dev = join(root, 'dev-models')
const setDir = join(dev, 'eval', 'set')
const outDir = join(dev, 'eval', 'out')
const SET = JSON.parse(readFileSync(join(setDir, 'set.json'), 'utf8'))
const only = (process.env.ONLY || 'faces').split(',')
const userData = mkdtempSync(join(tmpdir(), 'isil-eval-'))
mkdirSync(join(userData, 'models'), { recursive: true })
for (const f of readdirSync(dev).filter((f) => statSync(join(dev, f)).isFile())) copyFileSync(join(dev, f), join(userData, 'models', f))
copyFileSync(join(dev, 'eval', 'arcface.onnx'), join(userData, 'models', 'arcface.onnx'))
// yüz onarma adayları (FaceFusion deposu); CodeFormer'ın sadakat ayarlı sürümü ayrı adla
const RD = join(dev, 'eval', 'restore')
if (existsSync(RD)) for (const [from, to] of [['codeformer.onnx', 'codeformer_w.onnx'], ['gfpgan_1.4.onnx'], ['gpen_bfr_512.onnx'], ['restoreformer_plus_plus.onnx']]) copyFileSync(join(RD, from), join(userData, 'models', to ?? from))

const app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ISIL_TEST: '1', ISIL_USERDATA: userData, ISIL_ENGINE_DIR: join(dev, 'engine') } })
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
await win.waitForFunction(() => !!window.__isil, null, { timeout: 20000 })

// ---------- sayfa içi yardımcılar ----------
await win.evaluate(() => {
  const W = window
  W.__img = async (b64) => createImageBitmap(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))]), { imageOrientation: 'from-image' })
  W.__cv = (src, w = src.width, h = src.height) => {
    const c = document.createElement('canvas')
    c.width = Math.round(w)
    c.height = Math.round(h)
    const x = c.getContext('2d', { willReadFrequently: true })
    x.imageSmoothingQuality = 'high'
    x.drawImage(src, 0, 0, c.width, c.height)
    return c
  }
  W.__fit = (src, max) => { const k = Math.min(1, max / Math.max(src.width, src.height)); return W.__cv(src, src.width * k, src.height * k) }
  W.__jpg = async (c, q = 0.88) => {
    const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', q))
    const u = new Uint8Array(await b.arrayBuffer())
    let s = ''
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
    return btoa(s)
  }
  // maskeyi dama tahtası üstünde göster
  W.__comp = (src, mask, max = 640) => {
    const c = W.__fit(src, max)
    const m = W.__cv(mask, c.width, c.height)
    const out = document.createElement('canvas')
    out.width = c.width
    out.height = c.height
    const o = out.getContext('2d')
    for (let y = 0; y < out.height; y += 16) for (let x = 0; x < out.width; x += 16) { o.fillStyle = (x + y) / 16 % 2 ? '#cfcfcf' : '#f4f4f4'; o.fillRect(x, y, 16, 16) }
    const t = W.__cv(c)
    const tx = t.getContext('2d')
    const id = tx.getImageData(0, 0, t.width, t.height)
    const md = m.getContext('2d').getImageData(0, 0, t.width, t.height).data
    for (let i = 0; i < id.data.length; i += 4) id.data[i + 3] = md[i]
    tx.putImageData(id, 0, 0)
    o.drawImage(t, 0, 0)
    return out
  }
  W.__psnr = (a, b) => {
    const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height)
    const da = W.__cv(a, w, h).getContext('2d').getImageData(0, 0, w, h).data
    const db = W.__cv(b, w, h).getContext('2d').getImageData(0, 0, w, h).data
    let se = 0
    for (let i = 0; i < da.length; i += 4) { const la = 0.299 * da[i] + 0.587 * da[i + 1] + 0.114 * da[i + 2]; const lb = 0.299 * db[i] + 0.587 * db[i + 1] + 0.114 * db[i + 2]; se += (la - lb) ** 2 }
    const mse = se / (w * h)
    return +(10 * Math.log10(255 * 255 / Math.max(mse, 1e-6))).toFixed(2)
  }
  // ArcFace: 5 noktayla 112×112 hizala, motorda çalıştır, birim vektör döndür
  const DST = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]]
  const sim = (src, dst) => {
    const n = src.length
    let sx = 0, sy = 0, dx = 0, dy = 0
    for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1] }
    sx /= n; sy /= n; dx /= n; dy /= n
    let a1 = 0, b1 = 0, den = 0
    for (let i = 0; i < n; i++) { const px = src[i][0] - sx, py = src[i][1] - sy, qx = dst[i][0] - dx, qy = dst[i][1] - dy; a1 += px * qx + py * qy; b1 += px * qy - py * qx; den += px * px + py * py }
    const a = a1 / den, b = b1 / den
    return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) }
  }
  W.__faces = async (src) => (await (await window.__isil.mod('vision')).detectFaces(W.__fit(src, 1280)))
  W.__embed = async (src, face) => {
    const P = (i) => [face[i].x * src.width, face[i].y * src.height]
    const eyes = [P(468), P(473)].sort((p, q) => p[0] - q[0])
    const mouth = [P(61), P(291)].sort((p, q) => p[0] - q[0])
    const T = sim([eyes[0], eyes[1], P(1), mouth[0], mouth[1]], DST)
    const c = document.createElement('canvas')
    c.width = c.height = 112
    const x = c.getContext('2d', { willReadFrequently: true })
    x.setTransform(T.a, T.b, -T.b, T.a, T.tx, T.ty)
    x.drawImage(src, 0, 0)
    const d = x.getImageData(0, 0, 112, 112).data
    const data = new Float32Array(3 * 112 * 112)
    for (let i = 0; i < 112 * 112; i++) { data[i] = d[i * 4]; data[12544 + i] = d[i * 4 + 1]; data[25088 + i] = d[i * 4 + 2] }
    const { platform } = await window.__isil.mod('platform')
    const r = await platform.onnxRun({ file: 'arcface.onnx', feeds: { data: { data, dims: [1, 3, 112, 112] } } })
    const v = Object.values(r.outputs)[0].data
    let n = 0
    for (const e of v) n += e * e
    n = Math.sqrt(n)
    return Array.from(v, (e) => e / n)
  }
  W.__cos = (a, b) => +a.reduce((s, x, i) => s + x * b[i], 0).toFixed(3)
  // iki görüntüde en büyük yüzlerin kimlik benzerliği
  W.__idsim = async (a, b) => {
    const big = (fs) => fs.slice().sort((p, q) => (q[454].x - q[234].x) - (p[454].x - p[234].x))[0]
    const fa = await W.__faces(a), fb = await W.__faces(b)
    if (!fa.length || !fb.length) return null
    return W.__cos(await W.__embed(a, big(fa)), await W.__embed(b, big(fb)))
  }
})

const b64 = (id) => readFileSync(join(setDir, id + '.jpg')).toString('base64')
const save = (sec, name, data) => {
  mkdirSync(join(outDir, sec), { recursive: true })
  writeFileSync(join(outDir, sec, name), Buffer.from(data, 'base64'))
}
const results = {}
const record = (sec, row) => {
  ;(results[sec] ??= []).push(row)
  console.log(sec, JSON.stringify(row).slice(0, 240))
  writeFileSync(join(outDir, sec + '.json'), JSON.stringify(results[sec], null, 2))
}
mkdirSync(outDir, { recursive: true })

// ---------- ArcFace doğrulaması ----------
if (only.includes('faces') || only.includes('arc')) {
  const r = await win.evaluate(async ({ a, b }) => {
    const A = await window.__img(a), B = await window.__img(b)
    const flip = document.createElement('canvas')
    flip.width = A.width
    flip.height = A.height
    const fx = flip.getContext('2d')
    fx.translate(A.width, 0)
    fx.scale(-1, 1)
    fx.drawImage(A, 0, 0)
    return { ayniKisiAynali: await window.__idsim(A, flip), farkliKisi: await window.__idsim(A, B) }
  }, { a: b64('portre-gunbatimi'), b: b64('cocuk-portre') })
  record('arc', r)
}

// ---------- yüz algılama ----------
const EXPECT_FACES = { 'portre-gunbatimi': 1, 'sakal-turban': 1, 'gozluk-gunes': 1, 'gozluk-yasli': 1, 'yasli-adam': 1, 'koyu-ten-orgu': 1, 'cocuk-portre': 1, 'cocuk-gulen': 1, profil: 1, 'arka-isik': 1, 'karanlik-telefon': 1, 'grup-karanlik': 4, 'grup-iki-cocuk': 2, 'kivircik-sac': 1, 'tum-vucut': 1, 'eski-foto-kadin': 1, 'eski-foto-adam': 1 }
if (only.includes('faces')) {
  for (const m of SET) {
    const r = await win.evaluate(async (b) => { const im = await window.__img(b); const t = performance.now(); const f = await window.__faces(im); return { n: f.length, ms: Math.round(performance.now() - t) } }, b64(m.id))
    record('faces', { id: m.id, expected: EXPECT_FACES[m.id] ?? 0, found: r.n, ms: r.ms })
  }
}

// ---------- kesim: ISNet / BiRefNet lite / BiRefNet ----------
if (only.includes('cutout')) {
  for (const m of SET) {
    for (const model of ['isnet', 'birefnet']) {
      const r = await win.evaluate(async ({ b, model }) => {
        const im = await window.__img(b)
        const src = window.__fit(im, 1600)
        const ops = await window.__isil.mod('ops')
        const t = performance.now()
        const mask = model === 'isnet' ? await ops.removeBackground(src, false) : await ops.removeBackground(src, true, model)
        const ms = Math.round(performance.now() - t)
        return { ms, jpg: mask ? await window.__jpg(window.__comp(src, mask)) : null }
      }, { b: b64(m.id), model }).catch((e) => ({ err: String(e).slice(0, 200) }))
      if (r.jpg) save('cutout', `${m.id}__${model}.jpg`, r.jpg)
      record('cutout', { id: m.id, model, ms: r.ms, err: r.err })
    }
  }
}

// ---------- kalite artırma: 4× küçült → 4× büyüt, aslıyla karşılaştır ----------
const UPSCALE_IDS = ['portre-gunbatimi', 'sakal-turban', 'yasli-adam', 'koyu-ten-orgu', 'kedi-yakin', 'urun-saat', 'yemek', 'tabela', 'bina-cizgiler', 'manzara-gol', 'eski-foto-adam', 'karanlik-telefon']
if (only.includes('upscale')) {
  for (const id of UPSCALE_IDS) {
    const r = await win.evaluate(async (b) => {
      const im = await window.__img(b)
      const S = 384
      const crop = document.createElement('canvas')
      crop.width = crop.height = S
      crop.getContext('2d').drawImage(im, (im.width - Math.min(im.width, im.height)) / 2 + Math.min(im.width, im.height) * 0.25, (im.height - Math.min(im.width, im.height)) / 2 + Math.min(im.width, im.height) * 0.25, Math.min(im.width, im.height) * 0.5, Math.min(im.width, im.height) * 0.5, 0, 0, S, S)
      const small = window.__cv(crop, S / 4, S / 4)
      const ops = await window.__isil.mod('ops')
      const out = { bicubic: window.__cv(small, S, S) }
      const ms = {}
      for (const model of ['esrgan', 'ultrasharp']) { const t = performance.now(); out[model] = await ops.upscale(small, undefined, undefined, model); ms[model] = Math.round(performance.now() - t) }
      const psnr = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, window.__psnr(crop, v)]))
      const strip = document.createElement('canvas')
      strip.width = S * 4
      strip.height = S
      const sx = strip.getContext('2d')
      ;[crop, out.bicubic, out.esrgan, out.ultrasharp].forEach((c, i) => sx.drawImage(c, i * S, 0, S, S))
      return { psnr, ms, jpg: await window.__jpg(strip, 0.92) }
    }, b64(id)).catch((e) => ({ err: String(e).slice(0, 200) }))
    if (r.jpg) save('upscale', `${id}.jpg`, r.jpg)
    record('upscale', { id, psnr: r.psnr, ms: r.ms, err: r.err })
  }
}

// ---------- yüz onarma: bozulmuş küçük yüz → CodeFormer (karışım 0,5 / 0,8 / 1) ----------
const FACE_IDS = ['portre-gunbatimi', 'sakal-turban', 'gozluk-yasli', 'yasli-adam', 'koyu-ten-orgu', 'cocuk-portre', 'cocuk-gulen', 'profil', 'karanlik-telefon', 'grup-iki-cocuk', 'eski-foto-kadin', 'eski-foto-adam']
if (only.includes('restore')) {
  for (const id of FACE_IDS) {
    const r = await win.evaluate(async (b) => {
      const im = await window.__img(b)
      const clean = window.__fit(im, 480)
      // bozma: yarıya küçült, geri büyüt, düşük kaliteli JPEG
      const half = window.__cv(clean, clean.width / 2.5, clean.height / 2.5)
      const up = window.__cv(half, clean.width, clean.height)
      const jb = await new Promise((r) => up.toBlob(r, 'image/jpeg', 0.35))
      const deg = window.__cv(await createImageBitmap(jb))
      const ops = await window.__isil.mod('ops')
      const res = { degraded: { sim: await window.__idsim(clean, deg), psnr: window.__psnr(clean, deg) } }
      const outs = [clean, deg]
      for (const blend of [0.5, 0.8, 1]) {
        const t = performance.now()
        const o = await ops.restoreFaces(deg, undefined, blend)
        const ms = Math.round(performance.now() - t)
        const c = o ?? deg
        res['b' + blend] = { restored: !!o, ms, sim: await window.__idsim(clean, c), psnr: window.__psnr(clean, c) }
        outs.push(c)
      }
      const strip = document.createElement('canvas')
      strip.width = clean.width * outs.length
      strip.height = clean.height
      outs.forEach((c, i) => strip.getContext('2d').drawImage(c, i * clean.width, 0, clean.width, clean.height))
      return { ...res, jpg: await window.__jpg(strip, 0.92) }
    }, b64(id)).catch((e) => ({ err: String(e).slice(0, 200) }))
    if (r.jpg) save('restore', `${id}.jpg`, r.jpg)
    const { jpg, ...row } = r
    record('restore', { id, ...row })
  }
}

// ---------- derinlik: Small (tarayıcı) / Base (motor) ----------
const DEPTH_IDS = ['portre-gunbatimi', 'tum-vucut', 'kedi-kar', 'urun-vazo', 'manzara-gol', 'bina-cizgiler', 'grup-karanlik', 'yemek']
if (only.includes('depth')) {
  for (const id of DEPTH_IDS) {
    const r = await win.evaluate(async (b) => {
      const im = await window.__img(b)
      const src = window.__fit(im, 900)
      const ops = await window.__isil.mod('ops')
      const ms = {}
      const maps = {}
      for (const model of ['depth-small', 'depth']) { const t = performance.now(); maps[model] = await ops.depthMap(src, model); ms[model] = Math.round(performance.now() - t) }
      const h = 360, w = Math.round(src.width * h / src.height)
      const strip = document.createElement('canvas')
      strip.width = w * 3
      strip.height = h
      const x = strip.getContext('2d')
      x.drawImage(src, 0, 0, w, h)
      x.drawImage(maps['depth-small'], w, 0, w, h)
      x.drawImage(maps.depth, w * 2, 0, w, h)
      return { ms, jpg: await window.__jpg(strip) }
    }, b64(id)).catch((e) => ({ err: String(e).slice(0, 200) }))
    if (r.jpg) save('depth', `${id}.jpg`, r.jpg)
    record('depth', { id, ms: r.ms, err: r.err })
  }
}

// ---------- nesne silme: LaMa / FLUX.2 klein inpaint ----------
const ERASE = [
  ['plaj-kalabalik', 'kisi-kucuk', [0.19, 0.56, 0.27, 0.82]],
  ['plaj-kalabalik', 'grup-buyuk', [0.51, 0.53, 0.72, 0.82]],
  ['gece-pazar', 'arkadaki-kisi', [0.0, 0.12, 0.09, 0.46]],
  ['tabela', 'tabela-yazisi', [0.23, 0.12, 0.75, 0.26]],
  ['yemek', 'sos-kasesi', [0.5, 0.52, 0.76, 0.86]]
]
if (only.includes('erase')) {
  for (const [id, name, box] of ERASE) {
    const r = await win.evaluate(async ({ b, box }) => {
      const im = await window.__img(b)
      const src = window.__fit(im, 1024)
      const m = document.createElement('canvas')
      m.width = src.width
      m.height = src.height
      const mx = m.getContext('2d')
      mx.fillStyle = '#000'
      mx.fillRect(0, 0, m.width, m.height)
      mx.fillStyle = '#fff'
      mx.fillRect(box[0] * m.width, box[1] * m.height, (box[2] - box[0]) * m.width, (box[3] - box[1]) * m.height)
      const ops = await window.__isil.mod('ops')
      const g = await window.__isil.mod('generative')
      const ms = {}
      let t = performance.now()
      const lama = await ops.inpaint(src, m)
      ms.lama = Math.round(performance.now() - t)
      t = performance.now()
      const flux = await g.localMaskedEdit(src, m, 'the natural background continuing seamlessly, nothing in this area')
      ms.flux = Math.round(performance.now() - t)
      const shown = window.__cv(src)
      const sx = shown.getContext('2d')
      sx.strokeStyle = '#ff2bd6'
      sx.lineWidth = 4
      sx.strokeRect(box[0] * src.width, box[1] * src.height, (box[2] - box[0]) * src.width, (box[3] - box[1]) * src.height)
      const strip = document.createElement('canvas')
      strip.width = src.width * 3
      strip.height = src.height
      ;[shown, lama, flux].forEach((c, i) => c && strip.getContext('2d').drawImage(c, i * src.width, 0))
      return { ms, jpg: await window.__jpg(window.__fit(strip, 2400)) }
    }, { b: b64(id), box }).catch((e) => ({ err: String(e).slice(0, 200) }))
    if (r.jpg) save('erase', `${id}__${name}.jpg`, r.jpg)
    record('erase', { id, name, ms: r.ms, err: r.err })
  }
}

// ---------- yüz onarma adayları: hafif / ağır bozulma ----------
if (only.includes('restore2')) {
  const VARIANTS = [['codeformer', 1], ['codeformer-w', 0.5], ['codeformer-w', 0.9], ['gfpgan', 1], ['gpen', 1], ['restoreformer', 1]]
  for (const id of FACE_IDS) {
    for (const [deg, k, q] of [['hafif', 2.5, 0.35], ['agir', 4, 0.25]]) {
      const r = await win.evaluate(async ({ b, VARIANTS, k, q }) => {
        const im = await window.__img(b)
        const clean = window.__fit(im, 480)
        const half = window.__cv(clean, clean.width / k, clean.height / k)
        const up = window.__cv(half, clean.width, clean.height)
        const jb = await new Promise((r) => up.toBlob(r, 'image/jpeg', q))
        const deg = window.__cv(await createImageBitmap(jb))
        const ops = await window.__isil.mod('ops')
        const res = { bozuk: { sim: await window.__idsim(clean, deg), psnr: window.__psnr(clean, deg) } }
        const outs = [clean, deg]
        for (const [model, fid] of VARIANTS) {
          const t = performance.now()
          const o = await ops.restoreFaces(deg, undefined, 1, model, fid)
          const c = o ?? deg
          res[model + (model === 'codeformer-w' ? '@' + fid : '')] = { ok: !!o, ms: Math.round(performance.now() - t), sim: await window.__idsim(clean, c), psnr: window.__psnr(clean, c) }
          outs.push(c)
        }
        const strip = document.createElement('canvas')
        strip.width = clean.width * outs.length
        strip.height = clean.height
        outs.forEach((c, i) => strip.getContext('2d').drawImage(c, i * clean.width, 0, clean.width, clean.height))
        return { ...res, jpg: await window.__jpg(strip, 0.9) }
      }, { b: b64(id), VARIANTS, k, q }).catch((e) => ({ err: String(e).slice(0, 200) }))
      if (r.jpg) save('restore2', `${id}__${deg}.jpg`, r.jpg)
      const { jpg, ...row } = r
      record('restore2', { id, deg, ...row })
    }
  }
}

// ---------- üretken silme: LaMa (GPU) / LaMa ile doldur + FLUX rötuş ----------
if (only.includes('erase2')) {
  for (const [id, name, box] of ERASE) {
    const r = await win.evaluate(async ({ b, box }) => {
      const im = await window.__img(b)
      const src = window.__fit(im, 1024)
      const m = document.createElement('canvas')
      m.width = src.width
      m.height = src.height
      const mx = m.getContext('2d')
      mx.fillStyle = '#000'
      mx.fillRect(0, 0, m.width, m.height)
      mx.fillStyle = '#fff'
      mx.fillRect(box[0] * m.width, box[1] * m.height, (box[2] - box[0]) * m.width, (box[3] - box[1]) * m.height)
      const ops = await window.__isil.mod('ops')
      const g = await window.__isil.mod('generative')
      const ms = {}
      let t = performance.now()
      const lama = await ops.inpaint(src, m)
      ms.lama = Math.round(performance.now() - t)
      t = performance.now()
      const gen = await g.localMaskedEdit(src, m, 'empty background, continue the surrounding scene naturally, no people, no objects, no text', { prefill: lama })
      ms.gen = Math.round(performance.now() - t)
      const shown = window.__cv(src)
      const sx = shown.getContext('2d')
      sx.strokeStyle = '#ff2bd6'
      sx.lineWidth = 4
      sx.strokeRect(box[0] * src.width, box[1] * src.height, (box[2] - box[0]) * src.width, (box[3] - box[1]) * src.height)
      const strip = document.createElement('canvas')
      strip.width = src.width * 3
      strip.height = src.height
      ;[shown, lama, gen].forEach((c, i) => c && strip.getContext('2d').drawImage(c, i * src.width, 0))
      return { ms, jpg: await window.__jpg(window.__fit(strip, 2400)) }
    }, { b: b64(id), box }).catch((e) => ({ err: String(e).slice(0, 200) }))
    if (r.jpg) save('erase2', `${id}__${name}.jpg`, r.jpg)
    record('erase2', { id, name, ms: r.ms, err: r.err })
  }
}

// ---------- FLUX.2 klein düzenleme: 4B / 9B, kimlik korunuyor mu ----------
const FLUX_IDS = ['portre-gunbatimi', 'sakal-turban', 'koyu-ten-orgu', 'yasli-adam', 'cocuk-portre', 'gozluk-yasli']
const PROMPTS = [
  ['arka-plan', 'Change the background to a snowy mountain landscape. Keep the person, face, hair and clothes exactly the same. Photorealistic.'],
  ['studyo', 'Make it a professional studio portrait with soft even lighting and a plain light grey backdrop. Keep the face and identity exactly the same.']
]
for (const q of ['flux4', 'flux9']) {
  if (!only.includes(q)) continue
  await win.evaluate(async (quality) => {
    const S = (await window.__isil.store()).getState
    S().setSettings({ ...S().settings, genQuality: quality })
  }, q === 'flux9' ? 'best' : 'fast')
  for (const id of FLUX_IDS) {
    for (const [pn, prompt] of PROMPTS) {
      const r = await win.evaluate(async ({ b, prompt }) => {
        const im = await window.__img(b)
        const src = window.__fit(im, 1024)
        const g = await window.__isil.mod('generative')
        const t = performance.now()
        const out = await g.localEdit(src, prompt)
        const ms = Math.round(performance.now() - t)
        return { ms, sim: out ? await window.__idsim(src, out) : null, jpg: out ? await window.__jpg(window.__fit(out, 900)) : null }
      }, { b: b64(id), prompt }).catch((e) => ({ err: String(e).slice(0, 200) }))
      if (r.jpg) save(q, `${id}__${pn}.jpg`, r.jpg)
      record(q, { id, prompt: pn, ms: r.ms, sim: r.sim, err: r.err })
    }
  }
}

// ---------- stil danışmanı (Qwen3-VL 4B) ----------
const VLM_Q = [
  ['portre-gunbatimi', 'Bu kişinin saç rengi ne? Ona hangi ruj tonu yakışır? Kısa yanıt ver.'],
  ['koyu-ten-orgu', 'Bu kişinin ten tonuna hangi fondöten tonları uygun olur? Kısa yanıt ver.'],
  ['gozluk-yasli', 'Bu kişi gözlük takıyor mu? Bu portreyi daha etkileyici göstermek için hangi düzenlemeyi önerirsin?'],
  ['yemek', 'Bu fotoğrafta ne var? Instagram için nasıl düzenlemeliyim?'],
  ['tum-vucut', 'Bu kıyafeti değerlendir ve fotoğraf pozu için bir öneri ver.'],
  ['arka-isik', 'Bu fotoğrafta ışıkla ilgili bir sorun var mı? Işıl uygulamasında nasıl düzeltirim?']
]
if (only.includes('vlm')) {
  for (const [id, q] of VLM_Q) {
    const r = await win.evaluate(async ({ b, q }) => {
      const im = await window.__img(b)
      const g = await window.__isil.mod('generative')
      const t = performance.now()
      const text = await g.localChat([{ role: 'user', text: q, image: window.__fit(im, 768) }], 'Sen Işıl fotoğraf uygulamasının güzellik ve stil danışmanısın. Kısa, somut, Türkçe yanıt ver.')
      return { ms: Math.round(performance.now() - t), text }
    }, { b: b64(id), q }).catch((e) => ({ err: String(e).slice(0, 200) }))
    record('vlm', { id, q, ...r })
  }
}

await app.close()
console.log('bitti', errors.slice(0, 5))
