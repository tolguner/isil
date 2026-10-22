// Kimlik ölçümü: üretken düzenlemeden sonra kişi hâlâ aynı kişi mi? AuraFace (glintr100, Apache-2.0) yüz gömmesi,
// önce ve sonra arasında kosinüs benzerliği. Yüz, MediaPipe noktalarından 5 noktayla (göz bebekleri, burun ucu,
// ağız köşeleri) ArcFace şablonuna hizalanır. Model YZ motoru içinde çalışır; kurulu değilse ölçüm atlanır.
// Uyarı eşiği 0,40: aynı kişinin farklı fotoğrafları bu modelde tipik olarak 0,5 üstü, farklı kişiler 0,2 altı.
import { modelReady, runModel, ort } from './models'

type Src = CanvasImageSource & { width: number; height: number }
type Pt = { x: number; y: number }
export const IDENTITY_WARN = 0.4

// ArcFace 112×112 hizalama şablonu: sol göz, sağ göz, burun, ağız sol, ağız sağ (görüntüde soldan sağa)
const TEMPLATE: [number, number][] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]]

/** MediaPipe 478 noktasından (normalize) 5 hizalama noktası, piksel cinsinden. */
export function fivePoints(lm: Pt[], W: number, H: number): [number, number][] {
  const P = (i: number): [number, number] => [lm[i].x * W, lm[i].y * H]
  const irisA = P(468), irisB = P(473)
  const [eyeL, eyeR] = irisA[0] < irisB[0] ? [irisA, irisB] : [irisB, irisA]
  const mA = P(61), mB = P(291)
  const [mL, mR] = mA[0] < mB[0] ? [mA, mB] : [mB, mA]
  return [eyeL, eyeR, P(1), mL, mR]
}

/** Benzerlik dönüşümü (ölçek + dönme + öteleme), en küçük kareler: src → dst. [a, b, c, d, e, f] (canvas setTransform). */
export function similarity(src: [number, number][], dst: [number, number][]) {
  const n = src.length
  let sx = 0, sy = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) { sx += src[i][0]; sy += src[i][1]; dx += dst[i][0]; dy += dst[i][1] }
  sx /= n; sy /= n; dx /= n; dy /= n
  let num1 = 0, num2 = 0, den = 0
  for (let i = 0; i < n; i++) {
    const ax = src[i][0] - sx, ay = src[i][1] - sy, bx = dst[i][0] - dx, by = dst[i][1] - dy
    num1 += ax * bx + ay * by
    num2 += ax * by - ay * bx
    den += ax * ax + ay * ay
  }
  const a = num1 / den, b = num2 / den
  // x' = a·x − b·y + tx ; y' = b·x + a·y + ty
  const tx = dx - (a * sx - b * sy), ty = dy - (b * sx + a * sy)
  return [a, b, -b, a, tx, ty] as const
}

async function embed(img: Src, five: [number, number][]): Promise<Float32Array> {
  const S = 112
  const c = document.createElement('canvas')
  c.width = c.height = S
  const x = c.getContext('2d', { willReadFrequently: true })!
  const m = similarity(five, TEMPLATE)
  x.setTransform(m[0], m[1], m[2], m[3], m[4], m[5])
  x.drawImage(img as CanvasImageSource, 0, 0)
  const d = x.getImageData(0, 0, S, S).data
  const t = new Float32Array(3 * S * S)
  for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) t[k * S * S + i] = (d[i * 4 + k] - 127.5) / 127.5
  const { out, sess } = await runModel('identity', { data: new ort.Tensor('float32', t, [1, 3, S, S]) })
  return out[sess.outputNames[0]].data as Float32Array
}

const cos = (a: Float32Array, b: Float32Array) => {
  let ab = 0, aa = 0, bb = 0
  for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i] }
  return ab / Math.sqrt(aa * bb)
}

/**
 * Önce/sonra benzerliği (yüz başına). Düzenleme kompozisyonu koruduğu için aynı yüz noktaları iki görselde de
 * kullanılır. Model kurulu değilse null.
 */
export async function identityScores(before: Src, after: Src, faces: Pt[][]): Promise<number[] | null> {
  if (!faces.length || !(await modelReady('identity'))) return null
  const out: number[] = []
  for (const f of faces) {
    const five = fivePoints(f, before.width, before.height)
    const fiveAfter = five.map(([x, y]) => [(x / before.width) * after.width, (y / before.height) * after.height] as [number, number])
    out.push(cos(await embed(before, five), await embed(after, fiveAfter)))
  }
  return out
}

/** Orijinal yüzleri sonucun üstüne yumuşak kenarla geri koy (yüz çevresi elips, kenarı bulanık). */
export function restoreFaces(before: Src, after: HTMLCanvasElement, faces: Pt[][]): HTMLCanvasElement {
  const W = after.width, H = after.height
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const o = out.getContext('2d')!
  o.drawImage(after, 0, 0)
  const mask = document.createElement('canvas')
  mask.width = W
  mask.height = H
  const m = mask.getContext('2d')!
  for (const f of faces) {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0
    for (const p of f) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
    const cx = ((x0 + x1) / 2) * W, cy = ((y0 + y1) / 2) * H, rx = ((x1 - x0) / 2) * W, ry = ((y1 - y0) / 2) * H
    m.filter = `blur(${Math.max(4, rx * 0.12)}px)`
    m.fillStyle = '#fff'
    m.beginPath()
    m.ellipse(cx, cy, rx * 1.08, ry * 1.1, 0, 0, Math.PI * 2)
    m.fill()
  }
  const face = document.createElement('canvas')
  face.width = W
  face.height = H
  const fc = face.getContext('2d')!
  fc.drawImage(before as CanvasImageSource, 0, 0, W, H)
  fc.globalCompositeOperation = 'destination-in'
  fc.drawImage(mask, 0, 0)
  o.drawImage(face, 0, 0)
  return out
}
