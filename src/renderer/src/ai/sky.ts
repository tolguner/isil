// Gökyüzü değiştirme: U²-Net tabanlı gökyüzü bölütleme (skyseg, MIT) 320×320'de çalışır; kaba maske görüntünün
// kendisi kılavuz alınarak yönlendirilmiş süzgeçle (guided filter) inceltilir, böylece ağaç dalı ve saç kenarı
// korunur. Yeni gökyüzü ufka oturtulur, ön plan gökyüzünün rengine hafifçe uyumlanır.
import { ensureModel, runModel, ort } from './models'
import { toCanvas } from './ops'

type Src = CanvasImageSource & { width: number; height: number }
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225]

/** Kaba gökyüzü olasılığı (320×320, 0..1). */
async function coarse(src: Src): Promise<Float32Array | null> {
  if (!(await ensureModel('skyseg'))) return null
  const S = 320
  const c = toCanvas(src, S, S)
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, S, S).data
  const t = new Float32Array(3 * S * S)
  for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) t[k * S * S + i] = (d[i * 4 + k] / 255 - MEAN[k]) / STD[k]
  const { out, sess } = await runModel('skyseg', { 'input.1': new ort.Tensor('float32', t, [1, 3, S, S]) })
  const r = out[sess.outputNames[0]].data as Float32Array
  let mn = Infinity, mx = -Infinity
  for (const v of r) { if (v < mn) mn = v; if (v > mx) mx = v }
  const o = new Float32Array(S * S)
  for (let i = 0; i < S * S; i++) o[i] = (r[i] - mn) / Math.max(mx - mn, 1e-6)
  return o
}

/** Kutu toplamı (tümleşik görüntüyle), yarıçap r. */
function boxMean(a: Float32Array, w: number, h: number, r: number) {
  const I = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) {
    let row = 0
    for (let x = 0; x < w; x++) { row += a[y * w + x]; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row }
  }
  const o = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r)
      const s = I[(y1 + 1) * (w + 1) + x1 + 1] - I[y0 * (w + 1) + x1 + 1] - I[(y1 + 1) * (w + 1) + x0] + I[y0 * (w + 1) + x0]
      o[y * w + x] = s / ((x1 - x0 + 1) * (y1 - y0 + 1))
    }
  }
  return o
}

/** Yönlendirilmiş süzgeç (He vd. 2010): kılavuz I (ışıklılık), giriş p. */
function guided(I: Float32Array, p: Float32Array, w: number, h: number, r: number, eps: number) {
  const mI = boxMean(I, w, h, r), mp = boxMean(p, w, h, r)
  const Ip = new Float32Array(w * h), II = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) { Ip[i] = I[i] * p[i]; II[i] = I[i] * I[i] }
  const mIp = boxMean(Ip, w, h, r), mII = boxMean(II, w, h, r)
  const a = new Float32Array(w * h), b = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const cov = mIp[i] - mI[i] * mp[i], v = mII[i] - mI[i] * mI[i]
    a[i] = cov / (v + eps)
    b[i] = mp[i] - a[i] * mI[i]
  }
  const ma = boxMean(a, w, h, r), mb = boxMean(b, w, h, r)
  const q = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) q[i] = Math.max(0, Math.min(1, ma[i] * I[i] + mb[i]))
  return q
}

/**
 * Gökyüzü maskesi (0..1), en çok 1024 px'lik çalışma boyutunda; dönen nesne boyut bilgisi taşır.
 * Kaba maske çift doğrusal büyütülür, sonra görüntü kılavuzlu süzgeçle kenara oturtulur.
 */
export async function skyMask(src: Src, person?: { w: number; h: number; background: Float32Array } | null): Promise<{ m: Float32Array; w: number; h: number; share: number } | null> {
  const c = await coarse(src)
  if (!c) return null
  const k = Math.min(1, 1024 / Math.max(src.width, src.height))
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k))
  const img = toCanvas(src, w, h).getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  const I = new Float32Array(w * h), p = new Float32Array(w * h)
  const S = 320
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    I[i] = (0.299 * img[i * 4] + 0.587 * img[i * 4 + 1] + 0.114 * img[i * 4 + 2]) / 255
    // çift doğrusal örnekleme
    const fx = (x + 0.5) / w * S - 0.5, fy = (y + 0.5) / h * S - 0.5
    const x0 = Math.max(0, Math.min(S - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(S - 1, Math.floor(fy)))
    const x1 = Math.min(S - 1, x0 + 1), y1 = Math.min(S - 1, y0 + 1), ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0))
    p[i] = (c[y0 * S + x0] * (1 - ax) + c[y0 * S + x1] * ax) * (1 - ay) + (c[y1 * S + x0] * (1 - ax) + c[y1 * S + x1] * ax) * ay
  }
  const r = Math.max(4, Math.round(Math.max(w, h) / 120))
  const m = guided(I, p, w, h, r, 1e-3)
  // kesin olmayan kenarları sıkılaştır
  for (let i = 0; i < w * h; i++) m[i] = Math.max(0, Math.min(1, (m[i] - 0.12) / 0.45))
  // renk desteği: kaba model başın ve saçın çevresindeki açık gökyüzünü kaçırabiliyor (hale kalıyordu). Kesin
  // gökyüzü piksellerinin renk dağılımına yakın, kararsız pikseller gökyüzüne katılır; yalnız gökyüzü olan
  // satırların çevresinde (ufkun altına inmez).
  let cr = 0, cg = 0, cb = 0, n = 0, lowest = 0
  for (let i = 0; i < w * h; i++) if (m[i] > 0.9) { cr += img[i * 4]; cg += img[i * 4 + 1]; cb += img[i * 4 + 2]; n++; lowest = Math.max(lowest, (i / w) | 0) }
  if (n > 50) {
    cr /= n; cg /= n; cb /= n
    let v = 0
    for (let i = 0; i < w * h; i++) if (m[i] > 0.9) v += (img[i * 4] - cr) ** 2 + (img[i * 4 + 1] - cg) ** 2 + (img[i * 4 + 2] - cb) ** 2
    const sd = Math.sqrt(v / n / 3) + 4
    for (let y = 0; y <= Math.min(h - 1, lowest + Math.round(h * 0.06)); y++) for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (m[i] >= 0.95) continue
      const d = Math.sqrt(((img[i * 4] - cr) ** 2 + (img[i * 4 + 1] - cg) ** 2 + (img[i * 4 + 2] - cb) ** 2) / 3) / sd
      const c = Math.max(0, Math.min(1, (2.2 - d) / 1.2))
      if (c > m[i]) m[i] = c
    }
    // yumuşak kenar: renk desteğini tekrar kılavuzlu süzgeçten geçir
    const m2 = guided(I, m, w, h, Math.max(2, Math.round(r / 2)), 1e-3)
    for (let i = 0; i < w * h; i++) m[i] = m2[i]
  }
  // kişi bölütlemesi varsa kişinin üstüne gökyüzü taşmaz (açık tenli alın gökyüzü rengine benzeyebiliyor)
  if (person) {
    for (let y = 0; y < h; y++) {
      const sy = Math.min(person.h - 1, Math.floor((y / h) * person.h))
      for (let x = 0; x < w; x++) {
        const bg = person.background[sy * person.w + Math.min(person.w - 1, Math.floor((x / w) * person.w))]
        m[y * w + x] *= Math.max(0, Math.min(1, (bg - 0.25) / 0.5))
      }
    }
  }
  let s = 0
  for (let i = 0; i < w * h; i++) s += m[i]
  return { m, w, h, share: s / (w * h) }
}

/** Gökyüzünün alt sınırı (ufuk): maskenin ağırlıklı en alt satırı, 0..1. */
function horizon(mk: { m: Float32Array; w: number; h: number }) {
  for (let y = mk.h - 1; y >= 0; y--) {
    let s = 0
    for (let x = 0; x < mk.w; x++) s += mk.m[y * mk.w + x]
    if (s / mk.w > 0.25) return (y + 1) / mk.h
  }
  return 0.5
}

export interface SkyOpts { brightness: number; harmony: number; shift: number }

/**
 * Bileşim: gökyüzü görseli ufka oturacak biçimde kaplanır (üstten ufkun biraz altına), maskeyle karıştırılır.
 * Ön plan, gökyüzünün ortalama rengine "uyum" oranında çekilir (renk sıcaklığı/ton uyumu).
 */
export function composeSky(src: Src, sky: Src, mk: { m: Float32Array; w: number; h: number }, o: SkyOpts): HTMLCanvasElement {
  const W = src.width, H = src.height
  const out = toCanvas(src)
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  // gökyüzü katmanı: genişliği kaplar, yüksekliği ufka kadar (+%8) ve en az görüntünün yarısı
  const hz = Math.min(1, horizon(mk) + 0.08 + o.shift / 100 * 0.3)
  const tH = Math.max(H * 0.5, H * hz)
  const sc = Math.max(W / sky.width, tH / sky.height)
  const sw = sky.width * sc, sh = sky.height * sc
  const layer = document.createElement('canvas')
  layer.width = W
  layer.height = H
  const lc = layer.getContext('2d', { willReadFrequently: true })!
  lc.filter = `brightness(${1 + o.brightness / 100})`
  lc.drawImage(sky as CanvasImageSource, (W - sw) / 2, tH - sh, sw, sh)
  const L = lc.getImageData(0, 0, W, H).data
  const id = ctx.getImageData(0, 0, W, H)
  const D = id.data
  // gökyüzünün ortalama rengi (uyum için)
  let sr = 0, sg = 0, sb = 0, n = 0
  for (let i = 0; i < W * H; i += 13) { sr += L[i * 4]; sg += L[i * 4 + 1]; sb += L[i * 4 + 2]; n++ }
  sr /= n; sg /= n; sb /= n
  const sl = (sr + sg + sb) / 3 || 1
  const tint = [sr / sl, sg / sl, sb / sl]
  const hm = o.harmony / 100 * 0.25
  for (let y = 0; y < H; y++) {
    const fy = Math.max(0, Math.min(mk.h - 1, (y + 0.5) / H * mk.h - 0.5)), y0 = Math.floor(fy), y1 = Math.min(mk.h - 1, y0 + 1), ay = fy - y0
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      // maske çift doğrusal büyütülür (tam çözünürlükte kenar basamaklanmasın)
      const fx = Math.max(0, Math.min(mk.w - 1, (x + 0.5) / W * mk.w - 0.5)), x0 = Math.floor(fx), x1 = Math.min(mk.w - 1, x0 + 1), ax = fx - x0
      const a = (mk.m[y0 * mk.w + x0] * (1 - ax) + mk.m[y0 * mk.w + x1] * ax) * (1 - ay) + (mk.m[y1 * mk.w + x0] * (1 - ax) + mk.m[y1 * mk.w + x1] * ax) * ay
      for (let ch = 0; ch < 3; ch++) {
        const fg = D[i * 4 + ch] * (1 + (tint[ch] - 1) * hm)
        D[i * 4 + ch] = fg * (1 - a) + L[i * 4 + ch] * a
      }
    }
  }
  ctx.putImageData(id, 0, 0)
  return out
}
