// Yüz: landmark → bükme işlemleri, bölge maskeleri, rötuş uniform'ları.
import type { FaceEdit, ProtectStroke } from '@shared/schema'
import type { Pt } from '@/ai/vision'
import { emptyFaceUniforms, type FaceUniforms } from './renderer'

export const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
export const LIPS_OUT = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
export const LIPS_IN = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]
export const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] // görüntüde solda
export const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] // görüntüde sağda
export const BROW_R = [46, 53, 52, 65, 55, 107, 66, 105, 63, 70]
export const BROW_L = [276, 283, 282, 295, 285, 336, 296, 334, 293, 300]
export const LOWER_LID_R = [33, 7, 163, 144, 145, 153, 154, 155, 133]
export const LOWER_LID_L = [263, 249, 390, 373, 374, 380, 381, 382, 362]
export const UPPER_LID_R = [33, 246, 161, 160, 159, 158, 157, 173, 133]
export const UPPER_LID_L = [263, 466, 388, 387, 386, 385, 384, 398, 362]

type V = { x: number; y: number }
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k })
const len = (a: V) => Math.hypot(a.x, a.y)
const mean = (pts: V[]): V => mul(pts.reduce(add, { x: 0, y: 0 }), 1 / pts.length)

/** Piksel uzayında yüz geometrisi. */
export class FaceGeo {
  P: V[]
  /** Derinlik (piksel, MediaPipe ölçeği: x ile aynı birim, küçük = kameraya yakın). */
  Z: number[]
  constructor(lm: Pt[], public W: number, public H: number) {
    this.P = lm.map((p) => ({ x: p.x * W, y: p.y * H }))
    this.Z = lm.map((p) => ((p as Pt & { z?: number }).z ?? 0) * W)
  }
  p(i: number) { return this.P[i] }
  m(idx: number[]) { return mean(idx.map((i) => this.P[i])) }
  get center() { return mean([this.P[10], this.P[152], this.P[234], this.P[454]]) }
  get width() { return len(sub(this.P[234], this.P[454])) }
  get height() { return len(sub(this.P[10], this.P[152])) }
  /** Yüzün aşağı yönü (alından çeneye birim vektör). */
  get down() { const d = sub(this.P[152], this.P[10]); return mul(d, 1 / Math.max(len(d), 1)) }
  get right() { const d = this.down; return { x: -d.y, y: d.x } } // görüntü sağı (yaklaşık)
  bbox(pad = 0.15) {
    const xs = OVAL.map((i) => this.P[i].x)
    const ys = OVAL.map((i) => this.P[i].y)
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const pw = (x1 - x0) * pad, ph = (y1 - y0) * pad
    return { x: x0 - pw, y: y0 - ph, w: x1 - x0 + 2 * pw, h: y1 - y0 + 2 * ph }
  }
}

// ---- Bükme işlemleri ----
export type WarpOp =
  | { t: 'move'; c: V; r: number; v: V }
  | { t: 'scale'; c: V; r: number; sx: number; sy: number; ell?: { ang: number; ry: number } } // ell: eliptik etki alanı (r uzun eksen)

const falloff = (d: number, r: number) => {
  if (d >= r) return 0
  const t = d / r
  const k = 1 - t * t
  return k * k
}

/** Ters eşleme: çıktıdaki p, kaynakta p + offset noktasından örneklenir. */
export function opOffset(op: WarpOp, p: V): V {
  const d = sub(p, op.c)
  let dist = len(d)
  if (op.t === 'scale' && op.ell) {
    const cs = Math.cos(op.ell.ang), sn = Math.sin(op.ell.ang)
    const lx = d.x * cs + d.y * sn, ly = -d.x * sn + d.y * cs
    dist = Math.hypot(lx, (ly * op.r) / op.ell.ry)
  }
  const w = falloff(dist, op.r)
  if (w === 0) return { x: 0, y: 0 }
  if (op.t === 'move') return mul(op.v, -w)
  const sx = 1 + op.sx * w
  const sy = 1 + op.sy * w
  return { x: d.x / sx - d.x, y: d.y / sy - d.y }
}

type Side = FaceEdit['side']
function sideOk(side: Side, c: V, fc: V) {
  if (side === 'both') return true
  return side === 'left' ? c.x <= fc.x : c.x >= fc.x
}

/** Kaydırıcı → bükme işlemleri. v: -1..1. */
export function faceOps(g: FaceGeo, shape: Record<string, number>, side: Side): WarpOp[] {
  const ops: WarpOp[] = []
  const F = g.width
  const Hh = g.height
  const fc = g.center
  const dn = g.down
  const rt = g.right
  const pair = (iR: number, iL: number, f: (c: V, sign: number) => WarpOp | null) => {
    for (const [i, sign] of [[iR, -1], [iL, 1]] as const) {
      const c = g.p(i)
      if (!sideOk(side, c, fc)) continue
      const op = f(c, sign)
      if (op) ops.push(op)
    }
  }
  const inward = (c: V, amt: number) => mul(sub(fc, c), amt / Math.max(len(sub(fc, c)), 1))
  const eyeR = g.m(EYE_R), eyeL = g.m(EYE_L)
  const ew = len(sub(g.p(33), g.p(133)))
  const nw = len(sub(g.p(129), g.p(358)))
  const mouth = g.m([13, 14, 61, 291])
  const mw = len(sub(g.p(61), g.p(291)))
  const browR = g.m(BROW_R), browL = g.m(BROW_L)
  const bw = len(sub(g.p(70), g.p(107)))

  for (const [key, raw] of Object.entries(shape)) {
    const v = raw / 100
    if (!v || CONTOUR_KEYS.has(key)) continue // kontur kaydırıcıları contourField'da
    switch (key) {
      case 'resize': ops.push({ t: 'scale', c: fc, r: Hh * 0.85, sx: 0.12 * v, sy: 0.12 * v }); break
      case 'smallFace': ops.push({ t: 'scale', c: add(fc, mul(dn, Hh * 0.1)), r: Hh * 0.8, sx: -0.12 * v, sy: -0.08 * v }); break
      case 'slim':
        for (const [a, b] of [[132, 361], [58, 288], [172, 397], [136, 365]]) pair(a, b, (c) => ({ t: 'move', c, r: 0.3 * F, v: inward(c, 0.055 * F * v) }))
        break
      case 'width': pair(234, 454, (c) => ({ t: 'move', c, r: 0.38 * F, v: inward(c, -0.05 * F * v) })); break
      case 'temple': pair(127, 356, (c) => ({ t: 'move', c, r: 0.26 * F, v: inward(c, -0.04 * F * v) })); break
      case 'cheekbone': pair(234, 454, (c) => ({ t: 'move', c: add(c, mul(dn, -0.03 * Hh)), r: 0.22 * F, v: inward(c, 0.045 * F * v) })); break
      case 'jaw': pair(58, 288, (c) => ({ t: 'move', c, r: 0.26 * F, v: inward(c, 0.06 * F * v) })); break
      case 'chin': ops.push({ t: 'move', c: g.p(152), r: 0.3 * F, v: mul(dn, 0.06 * Hh * v) }); break
      case 'vshape':
        for (const [a, b] of [[172, 397], [150, 379], [136, 365]]) pair(a, b, (c) => ({ t: 'move', c, r: 0.24 * F, v: add(inward(c, 0.05 * F * v), mul(dn, -0.015 * Hh * v)) }))
        break
      case 'hairline': case 'upperFace': ops.push({ t: 'move', c: g.p(10), r: 0.45 * F, v: mul(dn, -0.05 * Hh * v) }); break
      case 'length': case 'lowerFace':
        ops.push({ t: 'move', c: g.p(152), r: 0.4 * F, v: mul(dn, 0.04 * Hh * v) })
        if (key === 'length') ops.push({ t: 'move', c: g.p(10), r: 0.4 * F, v: mul(dn, -0.03 * Hh * v) })
        break
      case 'midFace': ops.push({ t: 'move', c: g.p(2), r: 0.45 * F, v: mul(dn, 0.035 * Hh * v) }); break
      case 'pointed':
        ops.push({ t: 'move', c: g.p(152), r: 0.25 * F, v: mul(dn, 0.035 * Hh * v) })
        pair(148, 377, (c) => ({ t: 'move', c, r: 0.18 * F, v: inward(c, 0.04 * F * v) }))
        break
      case 'eyeSize':
        // Ar-Ge 2: daire yerine göz çizgisine hizalı elips; merkez dış köşeye hafif kayık
        for (const [c, outer, inner] of [[eyeR, 33, 133], [eyeL, 263, 362]] as const) {
          if (!sideOk(side, c, fc)) continue
          const ax = sub(g.p(outer), g.p(inner))
          const cc = add(c, mul(ax, 0.06))
          ops.push({ t: 'scale', c: cc, r: 1.0 * ew, sx: 0.3 * v, sy: 0.3 * v, ell: { ang: Math.atan2(ax.y, ax.x), ry: 0.66 * ew } })
        }
        break
      case 'eyeHeight': for (const c of [eyeR, eyeL]) if (sideOk(side, c, fc)) ops.push({ t: 'scale', c, r: 1.1 * ew, sx: 0, sy: 0.3 * v }); break
      case 'eyeWidth': for (const c of [eyeR, eyeL]) if (sideOk(side, c, fc)) ops.push({ t: 'scale', c, r: 1.1 * ew, sx: 0.25 * v, sy: 0 }); break
      case 'eyePos': for (const c of [eyeR, eyeL]) if (sideOk(side, c, fc)) ops.push({ t: 'move', c, r: 1.2 * ew, v: mul(dn, -0.12 * ew * v) }); break
      case 'eyeDist': case 'eyeSpacing':
        if (sideOk(side, eyeR, fc)) ops.push({ t: 'move', c: eyeR, r: 1.2 * ew, v: mul(rt, -0.1 * ew * v) })
        if (sideOk(side, eyeL, fc)) ops.push({ t: 'move', c: eyeL, r: 1.2 * ew, v: mul(rt, 0.1 * ew * v) })
        break
      case 'eyeTilt': pair(33, 263, (c) => ({ t: 'move', c, r: 0.55 * ew, v: mul(dn, -0.09 * ew * v) })); break
      case 'eyeLower': pair(145, 374, (c) => ({ t: 'move', c, r: 0.5 * ew, v: mul(dn, 0.07 * ew * v) })); break
      case 'iris': pair(468, 473, (c) => ({ t: 'scale', c, r: 0.38 * ew, sx: 0.18 * v, sy: 0.18 * v })); break
      case 'eyeInner': pair(133, 362, (c) => ({ t: 'move', c, r: 0.45 * ew, v: inward(c, 0.06 * ew * v) })); break
      case 'eyeOuter': pair(33, 263, (c) => ({ t: 'move', c, r: 0.45 * ew, v: inward(c, -0.07 * ew * v) })); break
      case 'noseSize': ops.push({ t: 'scale', c: g.m([1, 4, 5, 195]), r: 1.15 * nw, sx: 0.16 * v, sy: 0.16 * v }); break
      case 'noseWidth':
        for (const [a, b] of [[129, 358], [98, 327]]) pair(a, b, (c) => ({ t: 'move', c, r: 0.45 * nw, v: inward(c, -0.1 * nw * v) }))
        break
      case 'noseBridge': ops.push({ t: 'scale', c: g.m([6, 197, 195]), r: 0.9 * nw, sx: 0.22 * v, sy: 0 }); break
      case 'noseLift': ops.push({ t: 'move', c: g.p(1), r: 0.55 * nw, v: mul(dn, -0.08 * nw * v) }); break
      case 'noseTip': ops.push({ t: 'scale', c: g.p(1), r: 0.5 * nw, sx: 0.2 * v, sy: 0.2 * v }); break
      case 'noseRoot': ops.push({ t: 'scale', c: g.p(168), r: 0.6 * nw, sx: 0.25 * v, sy: 0 }); break
      case 'noseLength': ops.push({ t: 'move', c: g.p(2), r: 0.7 * nw, v: mul(dn, 0.07 * nw * v) }); break
      case 'browPos': for (const c of [browR, browL]) if (sideOk(side, c, fc)) ops.push({ t: 'move', c, r: 0.85 * bw, v: mul(dn, -0.12 * bw * v) }); break
      case 'browTilt': pair(46, 276, (c) => ({ t: 'move', c, r: 0.45 * bw, v: mul(dn, -0.1 * bw * v) })); break
      case 'browDist': pair(107, 336, (c) => ({ t: 'move', c, r: 0.45 * bw, v: inward(c, -0.08 * bw * v) })); break
      case 'browThick': for (const c of [browR, browL]) if (sideOk(side, c, fc)) ops.push({ t: 'scale', c, r: 0.7 * bw, sx: 0, sy: 0.3 * v }); break
      case 'browLength': pair(46, 276, (c) => ({ t: 'move', c, r: 0.4 * bw, v: inward(c, -0.08 * bw * v) })); break
      case 'browHigh': pair(105, 334, (c) => ({ t: 'move', c, r: 0.4 * bw, v: mul(dn, -0.08 * bw * v) })); break
      case 'lipSize': ops.push({ t: 'scale', c: mouth, r: 0.8 * mw, sx: 0.2 * v, sy: 0.2 * v }); break
      case 'lipWidth': ops.push({ t: 'scale', c: mouth, r: 0.85 * mw, sx: 0.2 * v, sy: 0 }); break
      case 'lipPos': ops.push({ t: 'move', c: mouth, r: 0.9 * mw, v: mul(dn, -0.08 * mw * v) }); break
      case 'smile': pair(61, 291, (c) => ({ t: 'move', c, r: 0.28 * mw, v: add(mul(dn, -0.07 * mw * v), inward(c, -0.02 * mw * v)) })); break
      case 'upperLip': ops.push({ t: 'move', c: g.p(0), r: 0.42 * mw, v: mul(dn, -0.06 * mw * v) }); break
      case 'lowerLip': ops.push({ t: 'move', c: g.p(17), r: 0.42 * mw, v: mul(dn, 0.06 * mw * v) }); break
      case 'plump': ops.push({ t: 'scale', c: mouth, r: 0.65 * mw, sx: 0.04 * v, sy: 0.2 * v }); break
      case 'mShape': pair(37, 267, (c) => ({ t: 'move', c, r: 0.2 * mw, v: mul(dn, -0.05 * mw * v) })); break
      // gerdirme (lifting): yer çekimiyle sarkan bölgeleri yukarı ve hafif dışa toplar; yerel ve küçük
      case 'liftContour':
        for (const [a, b] of [[172, 397], [136, 365], [150, 379], [58, 288]]) pair(a, b, (c) => ({ t: 'move', c, r: 0.22 * F, v: add(mul(dn, -0.011 * Hh * v), inward(c, 0.004 * F * v)) }))
        break
      case 'liftForehead': ops.push({ t: 'move', c: add(g.p(151), mul(dn, -0.02 * Hh)), r: 0.42 * F, v: mul(dn, -0.025 * Hh * v) }); break
      case 'liftEyes': pair(130, 359, (c) => ({ t: 'move', c: add(c, mul(sub(c, fc), 0.06)), r: 0.5 * ew, v: add(mul(dn, -0.08 * ew * v), inward(c, -0.02 * ew * v)) })); break
      case 'liftMid': pair(50, 280, (c) => ({ t: 'move', c, r: 0.2 * F, v: add(mul(dn, -0.03 * Hh * v), inward(c, -0.008 * F * v)) })); break
      case 'liftMouth':
        pair(61, 291, (c) => ({ t: 'move', c, r: 0.22 * mw, v: mul(dn, -0.04 * mw * v) }))
        pair(206, 426, (c) => ({ t: 'move', c, r: 0.35 * mw, v: mul(dn, -0.03 * mw * v) }))
        break
      // dolgunluk: bölgesel hafif şişirme (yerel ölçek). Dolgu etkisi: çöküntüyü doldurur, hacim verir
      case 'fillForehead': ops.push({ t: 'scale', c: add(g.p(151), mul(dn, -0.03 * Hh)), r: 0.33 * F, sx: 0.07 * v, sy: 0.1 * v }); break
      case 'fillBrowBone': pair(105, 334, (c) => ({ t: 'scale', c: add(c, mul(dn, -0.015 * Hh)), r: 0.6 * ew, sx: 0.13 * v, sy: 0.208 * v })); break
      case 'fillEyeHollow': pair(159, 386, (c) => ({ t: 'scale', c: add(c, mul(dn, -0.012 * Hh)), r: 0.5 * ew, sx: 0.078 * v, sy: 0.182 * v })); break
      case 'fillTearTrough': pair(230, 450, (c) => ({ t: 'scale', c, r: 0.45 * ew, sx: 0.104 * v, sy: 0.208 * v })); break
      case 'fillAegyo': pair(145, 374, (c) => ({ t: 'scale', c: add(c, mul(dn, 0.012 * Hh)), r: 0.42 * ew, sx: 0.078 * v, sy: 0.234 * v })); break
      case 'fillApple': pair(117, 346, (c) => ({ t: 'scale', c, r: 0.16 * F, sx: 0.156 * v, sy: 0.156 * v })); break
      case 'fillCheek': pair(187, 411, (c) => ({ t: 'scale', c, r: 0.18 * F, sx: 0.156 * v, sy: 0.104 * v })); break
      case 'fillNoseBase': pair(98, 327, (c) => ({ t: 'scale', c: add(c, mul(dn, 0.02 * Hh)), r: 0.6 * nw, sx: 0.13 * v, sy: 0.13 * v })); break
      case 'lipAngle': pair(61, 291, (c, s) => ({ t: 'move', c, r: 0.3 * mw, v: mul(dn, -0.05 * mw * v * s) })); break
    }
  }
  return ops
}

// ---- Kontur kısıtlı bükme (Ar-Ge 2: replica/arge/02-yuz-bukme.md) ----
// Yüz çizgisini (oval) iç normal boyunca taşır; gözler, kaşlar, burun ve ağız sabit çapadır,
// yüzün dışındaki halka da sabittir. Aradaki alan MLS ile (Schaefer 2006, katı) doldurulur:
// yalnız kontur bandı oynar, ağız/burun kaymaz, katlanma olmaz.
export const CONTOUR_KEYS = new Set(['slim', 'width', 'temple', 'cheekbone', 'jaw', 'vshape'])
const ANCHORS = [33, 133, 159, 145, 263, 362, 386, 374, 70, 105, 107, 336, 334, 300, 168, 6, 1, 4, 98, 327, 61, 291, 0, 17, 13, 14]
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
const band = (x: number, a: number, b: number, c: number, d: number) => smooth(a, b, x) * (1 - smooth(c, d, x))

/** Kontur kaydırıcıları → (çıktı konumu, kaynak konumu) çiftleri. Kaydırıcı yoksa null. */
export function contourPairs(g: FaceGeo, shape: Record<string, number>, side: Side): { p: V[]; q: V[] } | null {
  const amt = (k: string) => (shape[k] ?? 0) / 100
  if (![...CONTOUR_KEYS].some((k) => amt(k))) return null
  const F = g.width, Hh = g.height, fc = g.center, dn = g.down
  const nose = g.p(1)
  // yanal eksen: 234 → 454 (görüntüde soldan sağa); g.right görüntüde sola baktığı için kullanılmaz
  const ax = sub(g.p(454), g.p(234))
  const e = mul(ax, 1 / Math.max(len(ax), 1))
  // poz: görünen yarım genişlik büyük olan taraf daha çok oynar (üç çeyrek yüzlerde doğal kalır)
  const halfA = Math.abs((nose.x - g.p(234).x) * e.x + (nose.y - g.p(234).y) * e.y)
  const halfB = Math.abs((g.p(454).x - nose.x) * e.x + (g.p(454).y - nose.y) * e.y)
  const halfM = (halfA + halfB) / 2 || 1
  const p: V[] = [], q: V[] = []
  for (const i of OVAL) {
    const pt = g.p(i)
    const d = sub(pt, fc)
    const u = (d.x * e.x + d.y * e.y) / (F / 2)        // -1 (234 tarafı) … 1 (454 tarafı)
    const t = (d.x * dn.x + d.y * dn.y) / (Hh / 2)     // -1 alın … 1 çene
    const sgn = u < 0 ? -1 : 1
    if (!sideOk(side, pt, fc)) { p.push(pt); q.push(pt); continue }
    const lat = Math.min(1, Math.abs(u) * 1.6)        // çene ucunda yanal itme söner
    const pose = (u < 0 ? halfA : halfB) / halfM
    // yanal (içe +) ve dikey (yukarı +) yer değiştirme, yüz genişliği cinsinden
    let inX = 0, up = 0
    inX += amt('slim') * 0.022 * band(t, -0.15, 0.35, 0.95, 1.2) * lat
    up += amt('slim') * 0.012 * smooth(0.7, 1.0, t)
    inX -= amt('width') * 0.03 * band(t, -0.75, -0.3, 0.45, 0.8) * lat
    inX -= amt('temple') * 0.028 * band(t, -0.95, -0.7, -0.35, -0.1) * lat
    inX += amt('cheekbone') * 0.026 * band(t, -0.25, 0.0, 0.15, 0.4) * lat
    inX += amt('jaw') * 0.034 * band(t, 0.3, 0.55, 0.8, 1.0) * lat
    inX += amt('vshape') * 0.03 * band(t, 0.45, 0.7, 0.92, 1.1) * lat
    up += amt('vshape') * 0.01 * smooth(0.75, 1.0, t)
    const mv = add(mul(e, -sgn * inX * F * pose), mul(dn, -up * Hh))
    p.push(add(pt, mv)) // çıktıda kontur burada
    q.push(pt)          // kaynaktan buradan örneklenir
  }
  for (const i of ANCHORS) { const a = g.p(i); p.push(a); q.push(a) }
  // dış halka: yüzün 1,7 katı elips üzerinde sabit noktalar
  for (let k = 0; k < 20; k++) {
    const a = (k / 20) * Math.PI * 2
    const o = add(fc, add(mul(e, Math.cos(a) * F * 0.95), mul(dn, Math.sin(a) * Hh * 0.95)))
    p.push(o); q.push(o)
  }
  return { p, q }
}

export const ORIENT_KEYS = ['yaw', 'pitch', 'roll', 'symmetry']
/** Denetim noktaları: tüm ağın seyreltilmiş hali + kontur ve özellikler (MLS maliyeti makul kalsın). */
export const ORIENT_PTS = [...new Set([...OVAL, ...EYE_R, ...EYE_L, ...BROW_R, ...BROW_L, ...LIPS_OUT, 1, 4, 5, 6, 168, 197, 195, 2, 98, 327, 129, 358, 50, 280, 205, 425, 101, 330, 118, 347, 36, 266, 152, 175, 199, 200, 18, ...Array.from({ length: 156 }, (_, i) => i * 3)])].filter((i) => i < 468)
type V3 = { x: number; y: number; z: number }
let mirrorCache: { key: string; map: number[] } | null = null

/** Kafa duruşu (radyan): sağa-sola (y ekseni), yukarı-aşağı (x ekseni), eğim (görüntü düzlemi). */
export function headPose(g: FaceGeo) {
  const L = g.p(234), R = g.p(454), T = g.p(10), B = g.p(152)
  const yaw = Math.atan2(g.Z[454] - g.Z[234], Math.hypot(R.x - L.x, R.y - L.y))
  const pitch = Math.atan2(g.Z[152] - g.Z[10], Math.hypot(B.x - T.x, B.y - T.y))
  const roll = Math.atan2(R.y - L.y, R.x - L.x)
  return { yaw, pitch, roll }
}

/** Döndürme: önce eğim geri, sonra yukarı-aşağı, sonra sağa-sola (frontal = önden görünüm). */
function rot(v: V3, yaw: number, pitch: number, roll: number, inverse: boolean): V3 {
  let { x, y, z } = v
  const R = (a: number, b: number, t: number): [number, number] => [a * Math.cos(t) - b * Math.sin(t), a * Math.sin(t) + b * Math.cos(t)]
  if (inverse) {
    ;[x, y] = R(x, y, -roll)
    ;[y, z] = R(y, z, -pitch)
    ;[x, z] = R(x, z, -yaw)
  } else {
    ;[x, z] = R(x, z, yaw)
    ;[y, z] = R(y, z, pitch)
    ;[x, y] = R(x, y, roll)
  }
  return { x, y, z }
}

/** Yüzü önden görünüme çevir (merkez ve dönme noktası çıkarılmış 3B noktalar). */
export function frontalize(g: FaceGeo) {
  const pose = headPose(g)
  const fc = g.center
  const mz = ORIENT_PTS.reduce((s, i) => s + g.Z[i], 0) / ORIENT_PTS.length
  const pz = mz + g.width * 0.55 // dönme merkezi: yüz yüzeyinin arkasında (baş ortası)
  const F = g.P.slice(0, 468).map((p, i) => rot({ x: p.x - fc.x, y: p.y - fc.y, z: g.Z[i] - pz }, pose.yaw, pose.pitch, pose.roll, true))
  return { F, pose, fc, pz }
}

/** Önden görünümde ayna eşleri: orta düzleme göre yansıyan noktaya en yakın nokta. */
function mirrorMap(F: V3[], key: string): number[] {
  if (mirrorCache?.key === key) return mirrorCache.map
  const mx = [1, 4, 6, 168, 152, 10, 0, 17, 199].reduce((s, i) => s + F[i].x, 0) / 9
  const map = F.map((p, i) => {
    const rx = 2 * mx - p.x
    let best = i, bd = Infinity
    for (let j = 0; j < F.length; j++) { const dd = (F[j].x - rx) ** 2 + (F[j].y - p.y) ** 2 + ((F[j].z - p.z) ** 2) * 0.25; if (dd < bd) { bd = dd; best = j } }
    return best
  })
  mirrorCache = { key, map }
  return map
}

/** Önden görünümde asimetri: ayna eşleri arasındaki ortalama sapma, yüz genişliğine oranla. */
export function asymmetry(g: FaceGeo): number {
  const { F } = frontalize(g)
  const map = mirrorMap(F, 'a' + Math.round(g.width))
  const mx = [1, 4, 6, 168, 152, 10, 0, 17, 199].reduce((s, i) => s + F[i].x, 0) / 9
  let s = 0
  for (const i of ORIENT_PTS) { const j = map[i]; s += Math.hypot(F[i].x - (2 * mx - F[j].x), F[i].y - F[j].y) }
  return s / ORIENT_PTS.length / g.width
}

/**
 * 3B yüz yönü (Ar-Ge 4): MediaPipe'ın 3B yüz ağı önden görünüme çevrilir, istenirse ayna eşiyle ortalanarak
 * simetrikleştirilir, sonra kendi duruşuna ek açılarla (sağa-sola, yukarı-aşağı, eğim) geri döndürülüp dik
 * izdüşümle düzleme indirilir. Eski ve yeni konumlar MLS katı bükmesine çift olarak verilir; dış halka sabittir.
 */
export function orientPairs(g: FaceGeo, shape: Record<string, number>): { p: V[]; q: V[] } | null {
  const dyaw = ((shape.yaw ?? 0) / 100) * (14 * Math.PI) / 180
  const dpitch = ((shape.pitch ?? 0) / 100) * (10 * Math.PI) / 180
  const droll = ((shape.roll ?? 0) / 100) * (10 * Math.PI) / 180
  const sym = Math.max(0, Math.min(1, (shape.symmetry ?? 0) / 100))
  if (!dyaw && !dpitch && !droll && !sym) return null
  if (g.P.length < 468) return null
  const { F, pose, fc } = frontalize(g)
  const map = sym ? mirrorMap(F, 'a' + Math.round(g.width)) : null
  const mx = [1, 4, 6, 168, 152, 10, 0, 17, 199].reduce((s, i) => s + F[i].x, 0) / 9
  const p: V[] = [], q: V[] = []
  for (const i of ORIENT_PTS) {
    let f = F[i]
    if (map) {
      const m = F[map[i]]
      const t = { x: (f.x + 2 * mx - m.x) / 2, y: (f.y + m.y) / 2, z: (f.z + m.z) / 2 }
      f = { x: f.x + (t.x - f.x) * sym, y: f.y + (t.y - f.y) * sym, z: f.z + (t.z - f.z) * sym }
    }
    const r = rot(f, pose.yaw + dyaw, pose.pitch + dpitch, pose.roll + droll, false)
    p.push({ x: fc.x + r.x, y: fc.y + r.y })
    q.push(g.p(i))
  }
  // dönme yüzü toptan kaydırmasın: denetim noktalarının ortalama kayması geri alınır (yüz yerinde döner)
  const dx = p.reduce((s, v, k) => s + v.x - q[k].x, 0) / p.length, dy = p.reduce((s, v, k) => s + v.y - q[k].y, 0) / p.length
  for (const v of p) { v.x -= dx; v.y -= dy }
  const Fw = g.width, Hh = g.height, dn = g.down
  const e = mul(sub(g.p(454), g.p(234)), 1 / (len(sub(g.p(454), g.p(234))) || 1))
  for (let k = 0; k < 28; k++) {
    const ang = (k / 28) * Math.PI * 2
    const o = add(fc, add(mul(e, Math.cos(ang) * Fw * 1.5), mul(dn, Math.sin(ang) * Hh * 1.4)))
    p.push(o); q.push(o)
  }
  return { p, q }
}

/** MLS katı deformasyon, ters eşleme: her ızgara noktasının kaynaktaki karşılığına ofset (uv) ekler. */
export function addMlsField(field: Float32Array, gw: number, gh: number, W: number, H: number, pr: { p: V[]; q: V[] }) {
  const { p, q } = pr
  const n = p.length
  // etki kutusu: dış halkanın biraz dışı; ötesi sıfır
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity
  for (const v of p) { bx0 = Math.min(bx0, v.x); by0 = Math.min(by0, v.y); bx1 = Math.max(bx1, v.x); by1 = Math.max(by1, v.y) }
  const i0 = Math.max(0, Math.floor((bx0 / W) * gw)), i1 = Math.min(gw - 1, Math.ceil((bx1 / W) * gw))
  const j0 = Math.max(0, Math.floor((by0 / H) * gh)), j1 = Math.min(gh - 1, Math.ceil((by1 / H) * gh))
  const w = new Float64Array(n)
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const vx = ((i + 0.5) / gw) * W, vy = ((j + 0.5) / gh) * H
      let sw = 0, px = 0, py = 0, qx = 0, qy = 0, hit = -1
      for (let k = 0; k < n; k++) {
        const dx = p[k].x - vx, dy = p[k].y - vy
        const d2 = dx * dx + dy * dy
        if (d2 < 1e-6) { hit = k; break }
        const wk = 1 / (d2 * Math.sqrt(d2)) // α = 1,5: etki konturda kalır
        w[k] = wk; sw += wk; px += wk * p[k].x; py += wk * p[k].y; qx += wk * q[k].x; qy += wk * q[k].y
      }
      let fx: number, fy: number
      if (hit >= 0) { fx = q[hit].x; fy = q[hit].y }
      else {
        px /= sw; py /= sw; qx /= sw; qy /= sw
        const ax = vx - px, ay = vy - py
        let rx = 0, ry = 0
        for (let k = 0; k < n; k++) {
          const hx = p[k].x - px, hy = p[k].y - py
          const gx = q[k].x - qx, gy = q[k].y - qy
          // A_k = w [h; -h⊥][a; -a⊥]^T  (h⊥ = (-hy, hx))
          const a11 = hx * ax + hy * ay, a12 = hx * ay - hy * ax
          rx += w[k] * (gx * a11 - gy * a12)
          ry += w[k] * (gx * a12 + gy * a11)
        }
        const len0 = Math.hypot(ax, ay), lr = Math.hypot(rx, ry) || 1
        fx = (rx / lr) * len0 + qx
        fy = (ry / lr) * len0 + qy
      }
      const ox = fx - vx, oy = fy - vy
      if (Math.abs(ox) + Math.abs(oy) < 1e-4) continue
      const kk = (j * gw + i) * 2
      field[kk] += ox / W
      field[kk + 1] += oy / H
    }
  }
}

/**
 * Katlanma denetimi (Ar-Ge 2): ters eşleme f(p) = p + o(p) her hücrede yönünü korumalı (det J > 0).
 * Aşırı ayar birleşimlerinde det minDet'in altına inerse bütün alan ikili aramayla bulunan α ile
 * küçültülür; normal ayarlarda alana dokunulmaz. Uygulanan α döner (1 = değişmedi).
 */
export function foldGuard(field: Float32Array, gw: number, gh: number, W: number, H: number, minDet = 0.05): number {
  const cw = W / gw, ch = H / gh
  const minJ = (a: number) => {
    let m = Infinity
    for (let j = 0; j < gh - 1; j++) {
      for (let i = 0; i < gw - 1; i++) {
        const k = (j * gw + i) * 2, kx = k + 2, ky = k + gw * 2
        // o piksel cinsinden; J = I + ∇o
        const dxx = ((field[kx] - field[k]) * W * a) / cw, dyx = ((field[kx + 1] - field[k + 1]) * H * a) / cw
        const dxy = ((field[ky] - field[k]) * W * a) / ch, dyy = ((field[ky + 1] - field[k + 1]) * H * a) / ch
        const det = (1 + dxx) * (1 + dyy) - dxy * dyx
        if (det < m) m = det
      }
    }
    return m
  }
  if (minJ(1) >= minDet) return 1
  let lo = 0, hi = 1
  for (let it = 0; it < 10; it++) {
    const mid = (lo + hi) / 2
    if (minJ(mid) >= minDet) lo = mid
    else hi = mid
  }
  for (let k = 0; k < field.length; k++) field[k] *= lo
  return lo
}

/** Bükme alanı: kaynak uv cinsinden örnekleme ofseti, gw×gh ızgara (RG). */
export function buildField(ops: WarpOp[], W: number, H: number, extra?: Float32Array | null, gw = 0, gh = 0): { field: Float32Array; gw: number; gh: number } | null {
  if (!ops.length && !extra) return null
  if (!gw) {
    gw = 192
    gh = Math.max(16, Math.round((192 * H) / W))
  }
  const field = extra ? Float32Array.from(extra) : new Float32Array(gw * gh * 2)
  if (!ops.length) return { field, gw, gh }
  // işlemleri sınırlayıcı kutuya göre hızlıca ele
  for (const op of ops) {
    const x0 = Math.max(0, Math.floor(((op.c.x - op.r) / W) * gw - 1))
    const x1 = Math.min(gw - 1, Math.ceil(((op.c.x + op.r) / W) * gw + 1))
    const y0 = Math.max(0, Math.floor(((op.c.y - op.r) / H) * gh - 1))
    const y1 = Math.min(gh - 1, Math.ceil(((op.c.y + op.r) / H) * gh + 1))
    for (let j = y0; j <= y1; j++) {
      for (let i = x0; i <= x1; i++) {
        const k = (j * gw + i) * 2
        const p = { x: ((i + 0.5) / gw) * W + field[k] * W, y: ((j + 0.5) / gh) * H + field[k + 1] * H }
        const o = opOffset(op, p)
        field[k] += o.x / W
        field[k + 1] += o.y / H
      }
    }
  }
  return { field, gw, gh }
}

// ---- Maskeler ----
function poly(ctx: CanvasRenderingContext2D, g: FaceGeo, idx: number[], s: number) {
  ctx.beginPath()
  idx.forEach((i, n) => {
    const p = g.p(i)
    if (n === 0) ctx.moveTo(p.x * s, p.y * s)
    else ctx.lineTo(p.x * s, p.y * s)
  })
  ctx.closePath()
}
function polyPts(ctx: CanvasRenderingContext2D, pts: V[], s: number) {
  ctx.beginPath()
  pts.forEach((p, n) => (n ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)))
  ctx.closePath()
}

function layer(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  ctx.lineJoin = 'round'
  return { c, ctx }
}

export interface MaskSet { a: HTMLCanvasElement; b: HTMLCanvasElement; c: HTMLCanvasElement }

/**
 * Kaynak uzayında bölge maskeleri. faceSkin/hair: segmentasyon (aynı boyutta float, isteğe bağlı).
 */
export function buildMasks(
  faces: FaceGeo[], W: number, H: number,
  seg: { w: number; h: number; faceSkin: Float32Array; hair: Float32Array } | null,
  needHair: boolean
): MaskSet {
  const s = Math.min(1, 1024 / Math.max(W, H))
  const w = Math.max(1, Math.round(W * s))
  const h = Math.max(1, Math.round(H * s))
  const L = {
    skin: layer(w, h), under: layer(w, h), teeth: layer(w, h), eyes: layer(w, h),
    lips: layer(w, h), cheeks: layer(w, h), lids: layer(w, h), brows: layer(w, h),
    id: layer(w, h), contour: layer(w, h), high: layer(w, h)
  }
  faces.forEach((g, fi) => {
    const F = g.width * s
    const blur = (ctx: CanvasRenderingContext2D, k: number) => (ctx.filter = `blur(${Math.max(1, F * k)}px)`)
    // kimlik haritası (yüz + boyun payı)
    const bb = g.bbox(0.18)
    const v = Math.round(((fi + 1) / 8) * 255)
    L.id.ctx.fillStyle = `rgb(${v},${v},${v})`
    L.id.ctx.fillRect(bb.x * s, bb.y * s, bb.w * s, bb.h * s * 1.15)
    // cilt: oval − gözler, kaşlar, dudaklar
    const sk = L.skin.ctx
    blur(sk, 0.025)
    poly(sk, g, OVAL, s)
    sk.fill()
    sk.globalCompositeOperation = 'destination-out'
    sk.filter = `blur(${Math.max(1, F * 0.012)}px)`
    for (const idx of [EYE_R, EYE_L, LIPS_OUT]) {
      poly(sk, g, idx, s)
      sk.lineWidth = F * 0.035
      sk.fill()
      sk.stroke()
    }
    for (const idx of [BROW_R, BROW_L]) {
      poly(sk, g, idx, s)
      sk.lineWidth = F * 0.02
      sk.fill()
      sk.stroke()
    }
    sk.globalCompositeOperation = 'source-over'
    sk.filter = 'none'
    // göz altı: alt kapak çizgisinin altına kayan şerit
    const ue = L.under.ctx
    blur(ue, 0.03)
    for (const lid of [LOWER_LID_R, LOWER_LID_L]) {
      const top = lid.map((i) => g.p(i))
      const eh = F * 0.075
      const d = g.down
      const bottom = top.map((p) => add(p, mul(d, eh))).reverse()
      polyPts(ue, [...top.map((p) => add(p, mul(d, F * 0.015))), ...bottom], s)
      ue.fill()
    }
    // dişler: iç dudak
    const te = L.teeth.ctx
    blur(te, 0.006)
    poly(te, g, LIPS_IN, s)
    te.fill()
    // gözler
    const ey = L.eyes.ctx
    blur(ey, 0.008)
    poly(ey, g, EYE_R, s)
    ey.fill()
    poly(ey, g, EYE_L, s)
    ey.fill()
    // dudaklar: dış − iç
    const li = L.lips.ctx
    blur(li, 0.008)
    poly(li, g, LIPS_OUT, s)
    li.fill()
    li.globalCompositeOperation = 'destination-out'
    poly(li, g, LIPS_IN, s)
    li.fill()
    li.globalCompositeOperation = 'source-over'
    // yanaklar (allık)
    const ch = L.cheeks.ctx
    for (const i of [50, 280]) {
      const c = g.p(i)
      const r = F * 0.16
      const grd = ch.createRadialGradient(c.x * s, c.y * s, 0, c.x * s, c.y * s, r * s)
      grd.addColorStop(0, 'rgba(255,255,255,0.9)')
      grd.addColorStop(1, 'rgba(255,255,255,0)')
      ch.fillStyle = grd
      ch.fillRect((c.x - r) * s, (c.y - r) * s, 2 * r * s, 2 * r * s)
    }
    // göz kapağı (far): üst kapak ile kaş arası
    const ld = L.lids.ctx
    blur(ld, 0.02)
    for (const [lidIdx, browIdx] of [[UPPER_LID_R, BROW_R], [UPPER_LID_L, BROW_L]] as const) {
      const lid = lidIdx.map((i) => g.p(i))
      const browC = g.m(browIdx)
      const up = lid.map((p) => add(p, mul(sub(browC, p), 0.55))).reverse()
      polyPts(ld, [...lid, ...up], s)
      ld.fill()
    }
    // kaşlar
    const br = L.brows.ctx
    blur(br, 0.006)
    poly(br, g, BROW_R, s)
    br.fill()
    poly(br, g, BROW_L, s)
    br.fill()
    // kontür: çene yanları
    const co = L.contour.ctx
    blur(co, 0.05)
    co.lineWidth = F * 0.09
    co.lineCap = 'round'
    for (const idx of [[127, 234, 93, 132, 58, 172], [356, 454, 323, 361, 288, 397]]) {
      co.beginPath()
      idx.forEach((i, n) => {
        const p = add(g.p(i), mul(sub(g.center, g.p(i)), 0.08))
        if (n) co.lineTo(p.x * s, p.y * s)
        else co.moveTo(p.x * s, p.y * s)
      })
      co.stroke()
    }
    // aydınlatıcı: burun sırtı + elmacık üstü + alın ortası
    const hi = L.high.ctx
    blur(hi, 0.035)
    hi.lineWidth = F * 0.05
    hi.lineCap = 'round'
    hi.beginPath()
    hi.moveTo(g.p(168).x * s, g.p(168).y * s)
    hi.lineTo(g.p(4).x * s, g.p(4).y * s)
    hi.stroke()
    for (const i of [117, 346, 151]) {
      hi.beginPath()
      hi.arc(g.p(i).x * s, g.p(i).y * s, F * 0.06 * s, 0, Math.PI * 2)
      hi.fill()
    }
  })

  // segmentasyonla cilt maskesini sıkılaştır, saç maskesi
  const readA = (l: { ctx: CanvasRenderingContext2D }) => l.ctx.getImageData(0, 0, w, h).data
  const skinD = readA(L.skin)
  let segFace: Float32Array | null = null
  let segHair: Float32Array | null = null
  if (seg) {
    const sample = (arr: Float32Array) => {
      const out = new Float32Array(w * h)
      for (let y = 0; y < h; y++) {
        const sy = Math.min(seg.h - 1, Math.floor((y / h) * seg.h))
        for (let x = 0; x < w; x++) out[y * w + x] = arr[sy * seg.w + Math.min(seg.w - 1, Math.floor((x / w) * seg.w))]
      }
      return out
    }
    segFace = sample(seg.faceSkin)
    if (needHair) segHair = sample(seg.hair)
  }
  const pack = (ch: [Uint8ClampedArray | null, Uint8ClampedArray | null, Uint8ClampedArray | null, Uint8ClampedArray | null], mod?: (i: number, k: number, v: number) => number) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    const id = ctx.createImageData(w, h)
    const d = id.data
    for (let i = 0; i < w * h; i++) {
      for (let k = 0; k < 4; k++) {
        const src = ch[k]
        let v = src ? src[i * 4 + 3] : 0
        if (mod) v = mod(i, k, v)
        d[i * 4 + k] = v
      }
    }
    // tarayıcı alfa=0 iken rgb'yi düşürebilir; A kanalını ayrı tutuyoruz → putImageData ön-çarpımsız kalır
    ctx.putImageData(id, 0, 0)
    return c
  }
  // 2D tuval alfa=0 olan pikselin rengini korumaz; bu yüzden maskeleri ImageData olarak doğrudan WebGL'e yükleriz.
  const toImageData = (ch: (Uint8ClampedArray | null)[], mod?: (i: number, k: number, v: number) => number) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      for (let k = 0; k < 4; k++) {
        const src = ch[k]
        let v = src ? src[i * 4 + 3] : 0
        if (mod) v = mod(i, k, v)
        d[i * 4 + k] = v
      }
    }
    return new ImageData(d, w, h)
  }
  void pack
  const a = toImageData([skinD, readA(L.under), readA(L.teeth), readA(L.eyes)], (i, k, v) => {
    if (k === 0 && segFace) return Math.round(v * Math.min(1, segFace[i] * 1.6))
    return v
  })
  const b = toImageData([readA(L.lips), readA(L.cheeks), readA(L.lids), readA(L.brows)])
  const idD = L.id.ctx.getImageData(0, 0, w, h).data
  const c = toImageData([null, null, readA(L.contour), readA(L.high)], (i, k, v) => {
    if (k === 0) return idD[i * 4]
    if (k === 1) return segHair ? Math.round(Math.min(1, segHair[i]) * 255) : 0
    return v
  })
  return { a: imageDataCanvas(a), b: imageDataCanvas(b), c: imageDataCanvas(c) } as unknown as MaskSet
}

/** ImageData'yı taşıyan sahte kaynak: WebGL texImage2D ImageData'yı ön-çarpımsız alır. */
function imageDataCanvas(d: ImageData) {
  return d as unknown as HTMLCanvasElement
}

// ---- İşaret koruma ----
/** Koruma izlerini 2D bağlama çizer (beyaz = korunur). Arayüz önizlemesi ve motor aynı çizimi kullanır. */
export function drawProtect(ctx: CanvasRenderingContext2D, strokes: ProtectStroke[], w: number, h: number) {
  const short = Math.min(w, h)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.fillStyle = '#fff'
  ctx.strokeStyle = '#fff'
  for (const st of strokes) {
    const r = Math.max(0.5, st.r * short)
    ctx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over'
    // yumuşak kenar: dövme kenarındaki geçiş görünmesin
    ctx.filter = `blur(${Math.max(0.5, r * 0.3)}px)`
    const p = st.pts
    if (p.length < 4) {
      ctx.beginPath()
      ctx.arc(p[0] * w, p[1] * h, r * 0.85, 0, Math.PI * 2)
      ctx.fill()
      continue
    }
    ctx.lineWidth = r * 1.7
    ctx.beginPath()
    ctx.moveTo(p[0] * w, p[1] * h)
    for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * w, p[i + 1] * h)
    ctx.stroke()
  }
  ctx.restore()
}

export function allProtect(edits: FaceEdit[]): ProtectStroke[] {
  return edits.flatMap((e) => e.protect ?? [])
}

/** Kaynak uzayında koruma maskesi (R kanalı); iz yoksa null. Yüz maskeleriyle aynı ölçekte. */
export function buildProtectMask(strokes: ProtectStroke[], W: number, H: number): ImageData | null {
  if (!strokes.some((s) => !s.erase)) return null
  const s = Math.min(1, 1024 / Math.max(W, H))
  const w = Math.max(1, Math.round(W * s))
  const h = Math.max(1, Math.round(H * s))
  const { ctx } = layer(w, h)
  drawProtect(ctx, strokes, w, h)
  const src = ctx.getImageData(0, 0, w, h).data
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    d[i * 4] = src[i * 4 + 3]
    d[i * 4 + 3] = 255
  }
  return new ImageData(d, w, h)
}

// ---- Uniform'lar ----
export function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function faceUniforms(edits: FaceEdit[], count: number): FaceUniforms {
  const u = emptyFaceUniforms()
  for (let i = 0; i < Math.min(count, 8); i++) {
    const e = edits.find((x) => x.index === i)
    if (!e) continue
    const k = (n: string) => (e.skin[n] ?? 0) / 100
    const o = i * 4
    u.skin.set([k('smooth'), k('blemish'), k('whiten'), k('pores')], o)
    u.skin2.set([k('undereye'), k('teeth'), k('eyes'), k('tone')], o)
    const tone = hexRgb((e.makeup.tone?.color as string) || '#d9a88a')
    u.tone.set([...tone, k('detail')], o)
    const mk = (n: string, def: string) => {
      const m = e.makeup[n]
      if (!m || !m.amount) return [0.5, 0.5, 0.5, 0]
      return [...hexRgb(m.color || def), m.amount / 100]
    }
    u.lip.set(mk('lip', '#b8324a'), o)
    u.blush.set(mk('blush', '#f08a8a'), o)
    u.lid.set(mk('lid', '#8a5a6a'), o)
    u.brow.set(mk('brow', '#4a3426'), o)
    u.sculpt.set([k('contour'), k('highlight'), k('plumpLight'), k('wrinkle')], o)
    u.skinX.set([k('texture'), 0, 0, 0], o)
  }
  return u
}

export function faceHasSkinWork(e: FaceEdit) {
  return Object.values(e.skin).some((v) => v) || Object.values(e.makeup).some((m) => m && m.amount)
}

/**
 * Saç hacmi: saç bölgesini baş merkezinden dışa iter (v > 0 kabarık, v < 0 yatık). Ağırlık = yumuşatılmış saç
 * maskesi; yüz derisi sıfır tutulur, böylece yüz kıpırdamaz. Ters eşleme: çıktı p, kaynakta p - itme noktasından.
 */
export function addHairVolume(field: Float32Array, gw: number, gh: number, W: number, H: number, g: FaceGeo, v: number,
  seg: { w: number; h: number; hair: Float32Array; faceSkin: Float32Array }) {
  const c = add(g.center, mul(g.down, -0.15 * g.height))
  const R = g.height * 1.1
  // ızgara çözünürlüğünde saç ağırlığı (kutu bulanıklığı)
  const wgt = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const sx = Math.min(seg.w - 1, Math.floor(((i + 0.5) / gw) * seg.w)), sy = Math.min(seg.h - 1, Math.floor(((j + 0.5) / gh) * seg.h))
    const k = sy * seg.w + sx
    wgt[j * gw + i] = seg.hair[k] > 0.35 && seg.faceSkin[k] < 0.4 ? 1 : 0
  }
  const R2 = 3
  const blur = (a: Float32Array, horiz: boolean) => {
    const o = new Float32Array(a.length)
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      let s2 = 0, n = 0
      for (let d = -R2; d <= R2; d++) { const x = horiz ? i + d : i, y = horiz ? j : j + d; if (x >= 0 && x < gw && y >= 0 && y < gh) { s2 += a[y * gw + x]; n++ } }
      o[j * gw + i] = s2 / n
    }
    return o
  }
  const w2 = blur(blur(wgt, true), false)
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const w = w2[j * gw + i]
    if (w < 0.01) continue
    const px = ((i + 0.5) / gw) * W, py = ((j + 0.5) / gh) * H
    const dx = px - c.x, dy = py - c.y, d = Math.hypot(dx, dy) || 1
    // yüz ovalinin içi hiç oynamaz; ovalden dışarı doğru artan, R'de sönen itme. Saçın iç kenarı yerinde kalır
    // (yoksa yüz derisi saç bölgesine çekiliyordu), dış kenar kabarır
    const ex = (dx * g.right.x + dy * g.right.y) / (g.width * 0.55), ey = (dx * g.down.x + dy * g.down.y) / (g.height * 0.62)
    const inner = Math.hypot(ex, ey)
    if (inner < 1) continue
    const t = Math.min(1, (d - g.width * 0.5) / (R - g.width * 0.5))
    const ramp = Math.min(1, (inner - 1) / 0.35)
    const amt = v * 0.07 * g.width * w * ramp * ramp * Math.sin(Math.max(0, t) * Math.PI * 0.9 + 0.3)
    const k = (j * gw + i) * 2
    field[k] -= ((dx / d) * amt) / W
    field[k + 1] -= ((dy / d) * amt) / H
  }
}
