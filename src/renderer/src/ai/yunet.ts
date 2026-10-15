// YuNet yüz dedektörü (OpenCV Zoo, MIT, ≈230 KB; uygulamayla gelir: public/models).
// MediaPipe'ın kısa mesafe dedektörü küçük ve loş yüzleri kaçırıyor (grup, tüm vücut fotoğrafları);
// YuNet 10 px'e kadar yüz bulur. Burada yalnız kutu + 5 nokta bulunur; 478 nokta MediaPipe ile kırpımda çıkarılır.
import { ort, configureOrt } from './models'

export interface FaceBox { x: number; y: number; w: number; h: number; score: number } // kaynak pikseli

const SIZE = 640
const STRIDES = [8, 16, 32]
let sess: Promise<ort.InferenceSession> | null = null

function session() {
  configureOrt()
  sess ??= (async () => {
    const buf = new Uint8Array(await (await fetch(new URL('models/face_detection_yunet_2023mar.onnx', document.baseURI).href)).arrayBuffer())
    // küçük model: WASM yeterli ve GPU'yu YZ motoruyla paylaşmaz
    return ort.InferenceSession.create(buf, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
  })()
  sess.catch(() => (sess = null))
  return sess
}

/** 640×640 tek geçiş: kaynaktaki (sx, sy, sw, sh) bölgesini oranı koruyarak sığdırır. */
async function pass(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, thr: number): Promise<FaceBox[]> {
  const k = SIZE / Math.max(sw, sh)
  const c = document.createElement('canvas')
  c.width = c.height = SIZE
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw * k, sh * k)
  const d = ctx.getImageData(0, 0, SIZE, SIZE).data
  const plane = SIZE * SIZE
  const input = new Float32Array(3 * plane)
  for (let i = 0; i < plane; i++) {
    // OpenCV düzeni: BGR, 0..255
    input[i] = d[i * 4 + 2]
    input[plane + i] = d[i * 4 + 1]
    input[2 * plane + i] = d[i * 4]
  }
  const s = await session()
  const out = await s.run({ input: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) })
  const boxes: FaceBox[] = []
  for (const st of STRIDES) {
    const cls = out['cls_' + st].data as Float32Array
    const obj = out['obj_' + st].data as Float32Array
    const bb = out['bbox_' + st].data as Float32Array
    const cols = SIZE / st
    for (let i = 0; i < cls.length; i++) {
      const score = Math.sqrt(Math.min(Math.max(cls[i], 0), 1) * Math.min(Math.max(obj[i], 0), 1))
      if (score < thr) continue
      const r = Math.floor(i / cols), col = i % cols
      const cx = (col + bb[i * 4]) * st, cy = (r + bb[i * 4 + 1]) * st
      const w = Math.exp(bb[i * 4 + 2]) * st, h = Math.exp(bb[i * 4 + 3]) * st
      boxes.push({ x: sx + (cx - w / 2) / k, y: sy + (cy - h / 2) / k, w: w / k, h: h / k, score })
    }
  }
  return boxes
}

const iou = (a: FaceBox, b: FaceBox) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y)
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  return inter / (a.w * a.h + b.w * b.h - inter || 1)
}

function nms(boxes: FaceBox[], thr = 0.3) {
  const keep: FaceBox[] = []
  for (const b of boxes.sort((p, q) => q.score - p.score)) if (keep.every((k) => iou(k, b) < thr)) keep.push(b)
  return keep
}

/**
 * Görüntüdeki yüz kutuları (kaynak pikseli). Bütün görüntü + büyük görsellerde örtüşen döşemeler
 * (küçük yüzler 640'a sığdırınca kayboluyor).
 */
export async function detectFaceBoxes(src: CanvasImageSource & { width: number; height: number }, thr = 0.6): Promise<FaceBox[]> {
  const W = src.width, H = src.height
  let all = await pass(src, 0, 0, W, H, thr)
  const long = Math.max(W, H)
  if (long > SIZE * 1.4) {
    // döşeme kenarı ≈ 960 px kaynak (yüzler ~1,5 kat büyür), %25 örtüşme
    const T = Math.min(long, Math.max(SIZE, Math.round(long / 2)))
    const step = Math.round(T * 0.75)
    for (let y = 0; y < H; y += step) {
      for (let x = 0; x < W; x += step) {
        const sw = Math.min(T, W - x), sh = Math.min(T, H - y)
        if (sw < T * 0.4 || sh < T * 0.4) continue
        all = all.concat(await pass(src, x, y, sw, sh, thr))
        if (x + T >= W) break
      }
      if (y + T >= H) break
    }
  }
  return nms(all).filter((b) => b.w >= 8 && b.h >= 8)
}

export { iou as boxIoU }
