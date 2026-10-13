// Yerel AI işlemleri (ONNX). Girdi/çıktılar tuval/ImageData.
import { ensureModel, runModel, ort } from './models'

type Src = CanvasImageSource & { width: number; height: number }

export function toCanvas(src: Src, w = src.width, h = src.height): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

function tensorFrom(c: HTMLCanvasElement, norm: (v: number, ch: number) => number) {
  const { width: w, height: h } = c
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, w, h).data
  const out = new Float32Array(3 * w * h)
  const plane = w * h
  for (let i = 0; i < plane; i++) {
    out[i] = norm(d[i * 4] / 255, 0)
    out[plane + i] = norm(d[i * 4 + 1] / 255, 1)
    out[2 * plane + i] = norm(d[i * 4 + 2] / 255, 2)
  }
  return new ort.Tensor('float32', out, [1, 3, h, w])
}

function canvasFromCHW(data: Float32Array, w: number, h: number, denorm: (v: number) => number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const id = ctx.createImageData(w, h)
  const plane = w * h
  for (let i = 0; i < plane; i++) {
    id.data[i * 4] = denorm(data[i])
    id.data[i * 4 + 1] = denorm(data[plane + i])
    id.data[i * 4 + 2] = denorm(data[2 * plane + i])
    id.data[i * 4 + 3] = 255
  }
  ctx.putImageData(id, 0, 0)
  return c
}

const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]
const imagenet = (v: number, ch: number) => (v - MEAN[ch]) / STD[ch]
const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))

function grayCanvas(values: Float32Array, n: number, map: (v: number) => number) {
  const m = document.createElement('canvas')
  m.width = n
  m.height = n
  const ctx = m.getContext('2d')!
  const id = ctx.createImageData(n, n)
  for (let i = 0; i < n * n; i++) {
    const v = clamp255(map(values[i]) * 255)
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v
    id.data[i * 4 + 3] = 255
  }
  ctx.putImageData(id, 0, 0)
  return m
}

/** Konu maskesi (0..1), kaynak boyutunda gri tuval. detailed: BiRefNet (saç teli), olmazsa ISNet. */
export async function removeBackground(src: Src, detailed = false): Promise<HTMLCanvasElement | null> {
  if (detailed) {
    if (!(await ensureModel('birefnet'))) return null
    try {
      const { out, sess } = await runModel('birefnet', { input_image: tensorFrom(toCanvas(src, 1024, 1024), imagenet) })
      const m = grayCanvas(out[sess.outputNames[0]].data as Float32Array, 1024, (v) => 1 / (1 + Math.exp(-v)))
      return toCanvas(m, src.width, src.height)
    } catch (e) {
      console.warn('BiRefNet çalışmadı, ISNet ile devam', e)
    }
  }
  if (!(await ensureModel('isnet'))) return null
  const { out, sess } = await runModel('isnet', { input: tensorFrom(toCanvas(src, 1024, 1024), (v) => (v * 255 - 128) / 256) })
  const m = grayCanvas(out[sess.outputNames[0]].data as Float32Array, 1024, (v) => v)
  return toCanvas(m, src.width, src.height)
}

/**
 * Nesne silme. mask: kaynakla aynı boyutta, beyaz = sil.
 * Maskenin sınırlayıcı kutusu etrafında kare bir bölge 512'ye ölçeklenir, sonuç yumuşak maskeyle geri yapıştırılır.
 */
export async function inpaint(src: Src, mask: HTMLCanvasElement): Promise<HTMLCanvasElement | null> {
  if (!(await ensureModel('lama'))) return null
  const W = src.width, H = src.height
  const md = mask.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  let x0 = W, y0 = H, x1 = 0, y1 = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (md[(y * W + x) * 4] > 20) {
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < x0) return null
  const bw = x1 - x0, bh = y1 - y0
  let side = Math.max(bw, bh) * 2.2 + 64
  side = Math.min(Math.max(side, 256), Math.max(W, H))
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  let rx = Math.round(cx - side / 2), ry = Math.round(cy - side / 2)
  let rw = Math.round(Math.min(side, W)), rh = Math.round(Math.min(side, H))
  rx = Math.max(0, Math.min(W - rw, rx))
  ry = Math.max(0, Math.min(H - rh, ry))
  const crop = document.createElement('canvas')
  crop.width = 512
  crop.height = 512
  const cctx = crop.getContext('2d', { willReadFrequently: true })!
  cctx.drawImage(src, rx, ry, rw, rh, 0, 0, 512, 512)
  const mcrop = document.createElement('canvas')
  mcrop.width = 512
  mcrop.height = 512
  const mctx = mcrop.getContext('2d', { willReadFrequently: true })!
  mctx.filter = 'blur(1px)'
  mctx.drawImage(mask, rx, ry, rw, rh, 0, 0, 512, 512)
  // maskeyi biraz genişlet (kenar artıkları kalmasın)
  const mdata = mctx.getImageData(0, 0, 512, 512).data
  const mt = new Float32Array(512 * 512)
  for (let i = 0; i < mt.length; i++) mt[i] = mdata[i * 4] > 8 ? 1 : 0
  const dil = new Float32Array(mt)
  for (let it = 0; it < 4; it++) {
    const src2 = Float32Array.from(dil)
    for (let y = 1; y < 511; y++) for (let x = 1; x < 511; x++) {
      const i = y * 512 + x
      if (src2[i]) continue
      if (src2[i - 1] || src2[i + 1] || src2[i - 512] || src2[i + 512]) dil[i] = 1
    }
  }
  const img = tensorFrom(crop, (v) => v)
  const { out, sess } = await runModel('lama', { image: img, mask: new ort.Tensor('float32', dil, [1, 1, 512, 512]) })
  const o = out[sess.outputNames[0]]
  const od = o.data as Float32Array
  let mx = 0
  for (let i = 0; i < od.length; i += 997) mx = Math.max(mx, od[i])
  const scale = mx > 2 ? 1 : 255
  const ow = o.dims[3], oh = o.dims[2]
  const result = canvasFromCHW(od, ow, oh, (v) => clamp255(v * scale))
  // geri yapıştır: tam boyut kopya + yumuşak maske ile karıştır
  const full = toCanvas(src)
  const fctx = full.getContext('2d')!
  const patch = document.createElement('canvas')
  patch.width = rw
  patch.height = rh
  const pctx = patch.getContext('2d')!
  pctx.drawImage(result, 0, 0, rw, rh)
  // yumuşak maske
  const soft = document.createElement('canvas')
  soft.width = rw
  soft.height = rh
  const sctx = soft.getContext('2d')!
  const dilC = document.createElement('canvas')
  dilC.width = 512
  dilC.height = 512
  const dctx = dilC.getContext('2d')!
  const did = dctx.createImageData(512, 512)
  for (let i = 0; i < dil.length; i++) {
    did.data[i * 4 + 3] = dil[i] ? 255 : 0
  }
  dctx.putImageData(did, 0, 0)
  sctx.filter = `blur(${Math.max(1.5, rw / 512 * 2)}px)`
  sctx.drawImage(dilC, 0, 0, rw, rh)
  pctx.globalCompositeOperation = 'destination-in'
  pctx.drawImage(soft, 0, 0)
  fctx.drawImage(patch, rx, ry)
  return full
}

/** Süper çözünürlük (4×, 128 px karolar, kenar örtüşmeli). */
export async function upscale(src: Src, onProgress?: (p: number) => void, signal?: { cancelled: boolean }): Promise<HTMLCanvasElement | null> {
  if (!(await ensureModel('esrgan'))) return null
  const W = src.width, H = src.height
  const T = 128, PAD = 8, S = 4
  const step = T - PAD * 2
  const srcC = toCanvas(src)
  const sctx = srcC.getContext('2d', { willReadFrequently: true })!
  const out = document.createElement('canvas')
  out.width = W * S
  out.height = H * S
  const octx = out.getContext('2d')!
  const tile = document.createElement('canvas')
  tile.width = T
  tile.height = T
  const tctx = tile.getContext('2d', { willReadFrequently: true })!
  const nx = Math.ceil(W / step), ny = Math.ceil(H / step)
  let done = 0
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      if (signal?.cancelled) return null
      const x = tx * step - PAD, y = ty * step - PAD
      tctx.fillStyle = '#000'
      tctx.fillRect(0, 0, T, T)
      // kenarda ayna yerine kenar uzatma: kırpılmış bölgeyi çiz
      const sx = Math.max(0, x), sy = Math.max(0, y)
      const sw = Math.min(W, x + T) - sx, sh = Math.min(H, y + T) - sy
      tctx.putImageData(sctx.getImageData(sx, sy, sw, sh), sx - x, sy - y)
      const t = tensorFrom(tile, (v) => v)
      const { out: r, sess } = await runModel('esrgan', { image: t })
      const o = r[sess.outputNames[0]]
      const res = canvasFromCHW(o.data as Float32Array, T * S, T * S, (v) => clamp255(v * 255))
      // iç kısmı yapıştır
      const ix = Math.max(0, tx * step), iy = Math.max(0, ty * step)
      const iw = Math.min(step, W - ix), ih = Math.min(step, H - iy)
      octx.drawImage(res, (ix - x) * S, (iy - y) * S, iw * S, ih * S, ix * S, iy * S, iw * S, ih * S)
      done++
      onProgress?.(done / (nx * ny))
      if (done % 4 === 0) await new Promise((r2) => setTimeout(r2, 0))
    }
  }
  return out
}

/** Göreli derinlik (yakın = 1). Küçük çözünürlükte gri tuval. */
export async function depthMap(src: Src): Promise<HTMLCanvasElement | null> {
  if (!(await ensureModel('depth'))) return null
  const s = 518 / Math.max(src.width, src.height)
  const w = Math.max(14, Math.round((src.width * s) / 14) * 14)
  const h = Math.max(14, Math.round((src.height * s) / 14) * 14)
  const { out: r, sess } = await runModel('depth', { pixel_values: tensorFrom(toCanvas(src, w, h), imagenet) })
  const o = r[sess.outputNames[0]]
  const d = o.data as Float32Array
  const oh = o.dims[o.dims.length - 2], ow = o.dims[o.dims.length - 1]
  let mn = Infinity, mx = -Infinity
  for (const v of d) {
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  const c = document.createElement('canvas')
  c.width = ow
  c.height = oh
  const ctx = c.getContext('2d')!
  const id = ctx.createImageData(ow, oh)
  for (let i = 0; i < ow * oh; i++) {
    const v = clamp255(((d[i] - mn) / Math.max(mx - mn, 1e-6)) * 255)
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v
    id.data[i * 4 + 3] = 255
  }
  ctx.putImageData(id, 0, 0)
  return c
}

/** Anime/çizim stili (512'de çalışır, kaynak boyutuna ölçeklenir). */
export async function animeStyle(src: Src): Promise<HTMLCanvasElement | null> {
  if (!(await ensureModel('anime'))) return null
  const { out: r, sess } = await runModel('anime', { input_image: tensorFrom(toCanvas(src, 512, 512), (v) => v * 2 - 1) })
  const o = r[sess.outputNames[0]]
  const res = canvasFromCHW(o.data as Float32Array, o.dims[3], o.dims[2], (v) => clamp255((v + 1) * 127.5))
  return toCanvas(res, src.width, src.height)
}
