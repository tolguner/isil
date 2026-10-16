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
export function applyBodyBands(field: Float32Array, gw: number, gh: number, pose: Pt[] | null, shape: Record<string, number>, W: number, H: number) {
  if (!pose) return
  const slim = (shape.slim ?? 0) / 100
  const legs = (shape.legs ?? 0) / 100
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
  // bacak bandı: kalça → ayak bileği, uzatma oranı en uçta %20
  const y0 = hp.y / H, y1 = an.y / H, band = Math.max(y1 - y0, 0.01), d = legs * band * 0.2
  for (let j = 0; j < gh; j++) {
    const yN = (j + 0.5) / gh
    const y = yN * H
    let oy = 0
    if (d > 0 && yN >= y0) oy = yN < y1 + d ? y0 + ((yN - y0) * band) / (band + d) - yN : -d
    // inceltme dikey zarfı: omuz üstünde ve ayak altında yumuşak başla/bit
    const env = slim ? ss(top - sw * 0.2, top + sw * 0.3, y) * (1 - ss(bot - sw * 0.3, bot + sw * 0.2, y)) : 0
    const c = at(y)
    for (let i = 0; i < gw; i++) {
      const k = (j * gw + i) * 2
      field[k + 1] += oy
      if (!env) continue
      const dx = ((i + 0.5) / gw) * W - c.x
      const w = 1 - ss(c.hw, c.hw * 1.7, Math.abs(dx))
      if (w > 0) field[k] += (dx * slim * 0.1 * w * env) / W
    }
  }
}
