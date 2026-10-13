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
      case 'slim': ops.push({ t: 'scale', c: center, r: torso * 1.8, sx: -0.1 * v, sy: 0 }); break
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
      case 'legs': {
        const hipY = Math.max(hipL.y, hipR.y)
        const knee = mid(P[25], P[26])
        const ankle = mid(P[27], P[28])
        const L = Math.max(ankle.y - hipY, H * 0.2)
        ops.push({ t: 'move', c: knee, r: L * 0.9, v: { x: 0, y: L * 0.05 * v } })
        ops.push({ t: 'move', c: ankle, r: L * 0.9, v: { x: 0, y: L * 0.1 * v } })
        break
      }
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
