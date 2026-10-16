// Vücut: poz noktalarından bükme işlemleri + elle bölge uzatma/inceltme.
import type { BodyEdit } from '@shared/schema'
import type { Pt } from '@/ai/vision'
import type { WarpOp } from './face'

type V = { x: number; y: number }
const mid = (a: V, b: V, t = 0.5): V => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

export const BODY_PRESETS: Record<string, Record<string, number>> = {
  classic: { waist: 30, legs: 25, head: -10 },
  natural: { waist: 15, legs: 12 },
  slender: { slim: 35, waist: 25, legs: 20, arms: 25 },
  hourglass: { waist: 45, hips: 25, chest: 15 },
  athletic: { shoulders: 30, waist: 20, arms: -15 },
  golden: { legs: 40, head: -15, waist: 20 },
  headShoulder: { head: -20, shoulders: 20 },
  legTorso: { legs: 45 }
}

export function bodyOps(pose: Pt[] | null, shape: Record<string, number>, W: number, H: number): WarpOp[] {
  if (!pose) return []
  const P = pose.map((p) => ({ x: p.x * W, y: p.y * H }))
  const ops: WarpOp[] = []
  const shL = P[11], shR = P[12], hipL = P[23], hipR = P[24]
  const sw = Math.hypot(shL.x - shR.x, shL.y - shR.y) || W * 0.2
  const center = mid(mid(shL, shR), mid(hipL, hipR))
  const torso = Math.hypot(mid(shL, shR).x - mid(hipL, hipR).x, mid(shL, shR).y - mid(hipL, hipR).y) || H * 0.25
  const inward = (c: V, amt: number): V => {
    const dx = center.x - c.x
    return { x: Math.sign(dx) * amt, y: 0 }
  }
  for (const [k, raw] of Object.entries(shape)) {
    const v = raw / 100
    if (!v) continue
    switch (k) {
      case 'waist':
        for (const [s, h] of [[shL, hipL], [shR, hipR]]) {
          const c = mid(s, h, 0.72)
          ops.push({ t: 'move', c, r: sw * 0.45, v: inward(c, sw * 0.08 * v) })
        }
        break
      case 'hips':
        for (const h of [hipL, hipR]) ops.push({ t: 'move', c: h, r: sw * 0.5, v: inward(h, -sw * 0.07 * v) })
        break
      // slim ve legs: applyBodyBands (Ar-Ge 2) — arka planı bükmeyen satır tabanlı alanlar
      case 'chest': ops.push({ t: 'scale', c: mid(mid(shL, shR), center, 0.45), r: sw * 0.55, sx: 0.12 * v, sy: 0.08 * v }); break
      case 'shoulders':
        for (const s of [shL, shR]) ops.push({ t: 'move', c: s, r: sw * 0.4, v: inward(s, -sw * 0.06 * v) })
        break
      case 'head': ops.push({ t: 'scale', c: P[0], r: sw * 0.75, sx: 0.15 * v, sy: 0.15 * v }); break
      case 'neck': ops.push({ t: 'move', c: P[0], r: sw * 0.9, v: { x: 0, y: -sw * 0.08 * v } }); break
      case 'arms':
        for (const [a, b] of [[P[11], P[13]], [P[12], P[14]], [P[13], P[15]], [P[14], P[16]]]) {
          const c = mid(a, b)
          ops.push({ t: 'scale', c, r: sw * 0.3, sx: -0.12 * v, sy: -0.04 * v })
        }
        break
      case 'thighs':
        for (const [a, b] of [[P[23], P[25]], [P[24], P[26]]]) ops.push({ t: 'scale', c: mid(a, b), r: sw * 0.45, sx: -0.12 * v, sy: 0 })
        break
    }
  }
  return ops
}

/** Elle bölge: [y0,y1] bandını uzat (stretch) / incelt (slim). Alanı yerinde günceller. */
export function applyManualBody(field: Float32Array, gw: number, gh: number, m: NonNullable<BodyEdit['manual']>, cx = 0.5) {
  const y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1)
  const band = Math.max(y1 - y0, 0.01)
  const d = (m.stretch / 100) * band * 0.35
  const slim = m.slim / 100
  for (let j = 0; j < gh; j++) {
    const y = (j + 0.5) / gh
    let oy = 0
    if (d !== 0 && y >= y0) {
      if (y < y1 + d) oy = y0 + ((y - y0) * band) / (band + d) - y
      else oy = -d
    }
    const inBand = y >= y0 && y <= y1 ? Math.sin(((y - y0) / band) * Math.PI) : 0
    for (let i = 0; i < gw; i++) {
      const k = (j * gw + i) * 2
      const x = (i + 0.5) / gw
      field[k + 1] += oy
      if (slim) field[k] += (x - cx) * slim * 0.12 * inBand
    }
  }
}

/**
 * Ar-Ge 2 (replica/arge/02-yuz-bukme.md): vücut inceltme ve bacak uzatma.
 * İncelt: her satırda poz merkez çizgisine doğru yatay sıkıştırma; etki gövde yarı genişliğinin
 * 1,7 katında söner, uzaktaki arka plan kıpırdamaz. Bacak: kalça–ayak bileği bandında dikey uzatma
 * (satır tabanlı, yatay çizgiler düz kalır; Peachy "Uzunluğu" davranışı).
 */
export function applyBodyBands(field: Float32Array, gw: number, gh: number, pose: Pt[] | null, shape: Record<string, number>, W: number, H: number, seg?: { w: number; h: number; background: Float32Array } | null, parts: { slim?: boolean; legs?: boolean } = { slim: true, legs: true }) {
  if (!pose) return
  const slim = parts.slim ? (shape.slim ?? 0) / 100 : 0
  const legs = parts.legs ? (shape.legs ?? 0) / 100 : 0
  if (!slim && !legs) return
  const P = pose.map((p) => ({ x: p.x * W, y: p.y * H }))
  const sh = mid(P[11], P[12]), hp = mid(P[23], P[24]), kn = mid(P[25], P[26]), an = mid(P[27], P[28])
  const sw = Math.hypot(P[11].x - P[12].x, P[11].y - P[12].y) || W * 0.2
  const hipW = Math.hypot(P[23].x - P[24].x, P[23].y - P[24].y) || sw * 0.6
  // merkez çizgisi ve yarı genişlik denetim noktaları (y'ye göre sıralı)
  const ctl = [
    { y: sh.y - sw * 0.15, x: sh.x, hw: sw * 0.5 },
    { y: hp.y, x: hp.x, hw: Math.max(hipW * 0.85, sw * 0.42) },
    { y: kn.y, x: kn.x, hw: Math.max(hipW * 0.75, sw * 0.3) },
    { y: an.y, x: an.x, hw: Math.max(hipW * 0.6, sw * 0.22) }
  ].sort((a, b) => a.y - b.y)
  const at = (y: number) => {
    if (y <= ctl[0].y) return ctl[0]
    for (let k = 1; k < ctl.length; k++) if (y <= ctl[k].y) {
      const a = ctl[k - 1], b = ctl[k], t = (y - a.y) / Math.max(b.y - a.y, 1)
      return { y, x: a.x + (b.x - a.x) * t, hw: a.hw + (b.hw - a.hw) * t }
    }
    return ctl[ctl.length - 1]
  }
  const top = ctl[0].y, bot = ctl[ctl.length - 1].y + sw * 0.15
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
  // bacak bandı: kalça → ayak bileği, uzatma oranı en uçta %20 (tuval büyütülemiyorsa alan içinde)
  const y0 = hp.y / H, y1 = an.y / H, band = Math.max(y1 - y0, 0.01), d = legs * band * LEG_STRETCH
  // satır başına merkez ve yarı genişlik: kişi maskesi varsa silüetten, yoksa poz tahmininden
  const rowC = new Float32Array(gh), rowHW = new Float32Array(gh)
  for (let j = 0; j < gh; j++) {
    const y = ((j + 0.5) / gh) * H
    const c = at(y)
    rowC[j] = c.x; rowHW[j] = c.hw
    if (!seg) continue
    const sy = Math.min(seg.h - 1, Math.floor((y / H) * seg.h))
    const person = (x: number) => 1 - seg.background[sy * seg.w + Math.min(seg.w - 1, Math.max(0, Math.floor((x / W) * seg.w)))]
    if (person(c.x) < 0.5) continue
    const step = W / seg.w, lim = c.hw * 2.2
    let L = c.x, R = c.x
    while (c.x - L < lim && person(L - step) >= 0.5) L -= step
    while (R - c.x < lim && person(R + step) >= 0.5) R += step
    if (c.x - L >= lim || R - c.x >= lim) continue // kenar bulunamadı (kollar/arka plan), poz tahminine dön
    rowC[j] = (L + R) / 2
    rowHW[j] = Math.min(c.hw * 1.8, Math.max(c.hw * 0.6, (R - L) / 2))
  }
  // satırlar arası gürültüyü yumuşat (5 satırlık ortalama)
  if (seg) {
    const sm = (a: Float32Array) => { const o = Float32Array.from(a); for (let j = 2; j < gh - 2; j++) o[j] = (a[j - 2] + a[j - 1] + a[j] + a[j + 1] + a[j + 2]) / 5; return o }
    rowC.set(sm(rowC)); rowHW.set(sm(rowHW))
  }
  for (let j = 0; j < gh; j++) {
    const yN = (j + 0.5) / gh
    const y = yN * H
    let oy = 0
    if (d !== 0 && yN >= y0) oy = yN < y1 + d ? y0 + ((yN - y0) * band) / (band + d) - yN : -d
    // inceltme dikey zarfı: omuz üstünde ve ayak altında yumuşak başla/bit
    const env = slim ? ss(top - sw * 0.2, top + sw * 0.3, y) * (1 - ss(bot - sw * 0.3, bot + sw * 0.2, y)) : 0
    const cx = rowC[j], hw = rowHW[j]
    for (let i = 0; i < gw; i++) {
      const k = (j * gw + i) * 2
      field[k + 1] += oy
      if (!env) continue
      const dx = ((i + 0.5) / gw) * W - cx
      const w = 1 - ss(hw, hw * 1.7, Math.abs(dx))
      if (w > 0) field[k] += (dx * slim * 0.1 * w * env) / W
    }
  }
}

/**
 * Arka planı koru: alanı kişi maskesiyle (çıktı konumunda) çarp; arka plan pikselleri yerinde kalır.
 * Ağırlık ızgarada yumuşatılır: keskin geçiş, silüet kenarında örneklemeyi ters çevirip (katlanma)
 * kenarı ikiler. Katlanma denetimi (foldGuard) bunu yakaladı; 3 hücrelik geçişle det > 0 kalıyor.
 */
export function maskField(field: Float32Array, gw: number, gh: number, seg: { w: number; h: number; background: Float32Array }) {
  let w = new Float32Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const u = (i + 0.5) / gw, v = (j + 0.5) / gh
      const sx = Math.min(seg.w - 1, Math.max(0, Math.floor(u * seg.w))), sy = Math.min(seg.h - 1, Math.max(0, Math.floor(v * seg.h)))
      const p = 1 - seg.background[sy * seg.w + sx]
      const t = Math.min(1, Math.max(0, (p - 0.2) / 0.4))
      w[j * gw + i] = t * t * (3 - 2 * t)
    }
  }
  // iki geçişli kutu bulanıklığı (yarıçap 3 hücre)
  const R = 3, RX = R
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(gw * gh)
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      let s = 0, n = 0
      for (let k = -RX; k <= RX; k++) { const x = i + k; if (x >= 0 && x < gw) { s += w[j * gw + x]; n++ } }
      t[j * gw + i] = s / n
    }
    const u = new Float32Array(gw * gh)
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      let s = 0, n = 0
      for (let k = -R; k <= R; k++) { const y = j + k; if (y >= 0 && y < gh) { s += t[y * gw + i]; n++ } }
      u[j * gw + i] = s / n
    }
    w = u
  }
  for (let q = 0; q < gw * gh; q++) {
    field[q * 2] *= w[q]
    field[q * 2 + 1] *= w[q]
  }
}

/**
 * Vücut alanını tam çözünürlükte kaynağa uygula (CPU, çift doğrusal) ve korumalı inceltmede açılan
 * şeridin maskesini çıkar: eski silüetin içinde kalıp artık arka plandan örneklenen pikseller.
 */
export function bakeBodyWarp(src: ImageData, field: Float32Array, gw: number, gh: number, seg: { w: number; h: number; background: Float32Array } | null): { img: ImageData; gap: ImageData; gapCount: number } {
  const W = src.width, H = src.height, s = src.data
  const out = new ImageData(W, H), o = out.data
  const gap = new ImageData(W, H), g = gap.data
  const person = (x: number, y: number) => {
    if (!seg) return 0
    const sx = Math.min(seg.w - 1, Math.max(0, Math.floor((x / W) * seg.w))), sy = Math.min(seg.h - 1, Math.max(0, Math.floor((y / H) * seg.h)))
    return 1 - seg.background[sy * seg.w + sx]
  }
  let gapCount = 0
  for (let y = 0; y < H; y++) {
    const gy = Math.min(gh - 1.001, Math.max(0, ((y + 0.5) / H) * gh - 0.5)), j = Math.floor(gy), ty = gy - j
    for (let x = 0; x < W; x++) {
      const gx = Math.min(gw - 1.001, Math.max(0, ((x + 0.5) / W) * gw - 0.5)), i = Math.floor(gx), tx = gx - i
      const a = (j * gw + i) * 2, b = a + 2, c = a + gw * 2, d = c + 2
      const ox = (field[a] * (1 - tx) + field[b] * tx) * (1 - ty) + (field[c] * (1 - tx) + field[d] * tx) * ty
      const oy = (field[a + 1] * (1 - tx) + field[b + 1] * tx) * (1 - ty) + (field[c + 1] * (1 - tx) + field[d + 1] * tx) * ty
      const sx = Math.min(W - 1.001, Math.max(0, x + ox * W)), sy = Math.min(H - 1.001, Math.max(0, y + oy * H))
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0
      const p00 = (y0 * W + x0) * 4, p10 = p00 + 4, p01 = p00 + W * 4, p11 = p01 + 4
      const q = (y * W + x) * 4
      for (let k = 0; k < 3; k++) o[q + k] = (s[p00 + k] * (1 - fx) + s[p10 + k] * fx) * (1 - fy) + (s[p01 + k] * (1 - fx) + s[p11 + k] * fx) * fy
      o[q + 3] = s[p00 + 3]
      if (seg && (ox || oy) && person(x, y) > 0.5 && person(sx, sy) < 0.5) {
        g[q] = g[q + 1] = g[q + 2] = 255
        gapCount++
      }
      g[q + 3] = 255
    }
  }
  return { img: out, gap, gapCount }
}

export const LEG_STRETCH = 0.2

/** Bacak uzatma bandı (kaynak uv): kalça → ayak bileği; s = bandın göreli uzama oranı. */
export function legBand(pose: Pt[] | null, shape: Record<string, number>): { y0: number; y1: number; s: number } | null {
  const legs = (shape.legs ?? 0) / 100
  if (!pose || !legs) return null
  const y0 = (pose[23].y + pose[24].y) / 2, y1 = (pose[27].y + pose[28].y) / 2
  if (!(y1 > y0 + 0.02)) return null
  return { y0, y1, s: legs * LEG_STRETCH }
}
