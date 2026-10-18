// Göz makyajı: göz kalemi, kirpik, çift göz kapağı, göz ışıltısı (katman) ve göz rengi (iris maskesi).
// Hepsi yüz noktalarından kaynak uzayında çizilir; rötuş gölgelendiricisi katmanı normal karıştırmayla,
// iris rengini parlaklığı koruyarak uygular. Kalıplar ve şekiller bizim; çizim yordamsaldır.
import type { FaceEdit } from '@shared/schema'
import { EYE_L, EYE_R, UPPER_LID_L, UPPER_LID_R, type FaceGeo } from './face'

export const EYE_KEYS = ['liner', 'lash', 'crease', 'iris', 'catch'] as const
export type EyeKey = (typeof EYE_KEYS)[number]

type V = { x: number; y: number }
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y })
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y })
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k })
const len = (a: V) => Math.hypot(a.x, a.y)
const norm = (a: V) => mul(a, 1 / (len(a) || 1))

/** Göz başına geometri: üst kapak (dış köşeden iç köşeye), göz konturu, iris merkezi ve yarıçapı. */
function eyeGeo(g: FaceGeo, side: 0 | 1) {
  const lidIdx = side === 0 ? UPPER_LID_R : UPPER_LID_L
  const ring = (side === 0 ? EYE_R : EYE_L).map((i) => g.p(i))
  const lid = lidIdx.map((i) => g.p(i))
  const c = mul(ring.reduce(add, { x: 0, y: 0 }), 1 / ring.length)
  // MediaPipe iris noktaları (478 noktalı ağ): 468–472 ve 473–477; göz merkezine yakın olan bu gözündür
  let iris: { c: V; r: number } | null = null
  if (g.P.length >= 478) {
    const cand = [468, 473].map((k) => ({ c: g.p(k), r: (len(sub(g.p(k + 1), g.p(k + 3))) + len(sub(g.p(k + 2), g.p(k + 4)))) / 4 }))
    iris = cand.sort((a, b) => len(sub(a.c, c)) - len(sub(b.c, c)))[0]
  }
  const outer = lid[0], inner = lid[lid.length - 1]
  const w = len(sub(outer, inner))
  // yukarı yön: göz merkezinden kapak ortasına
  const up = norm(sub(lid[Math.floor(lid.length / 2)], c))
  return { lid, ring, c, iris, outer, inner, w, up }
}

const clipEye = (ctx: CanvasRenderingContext2D, ring: V[], s: number) => {
  ctx.beginPath()
  ring.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)))
  ctx.closePath()
  ctx.clip()
}

/** Kapak eğrisi üzerinde t (0 dış köşe … 1 iç köşe) noktası ve dışa normal. */
function along(lid: V[], t: number, up: V) {
  const f = t * (lid.length - 1), i = Math.min(lid.length - 2, Math.floor(f)), u = f - i
  const p = add(lid[i], mul(sub(lid[i + 1], lid[i]), u))
  const tg = norm(sub(lid[i + 1], lid[i]))
  let n = { x: -tg.y, y: tg.x }
  if (n.x * up.x + n.y * up.y < 0) n = mul(n, -1)
  return { p, n, tg }
}

export interface EyeFx { fx: HTMLCanvasElement; iris: HTMLCanvasElement }

/** Belgedeki göz makyajı ayarları (anahtar) — değişmedikçe katman yeniden çizilmez. */
export function eyeFxKey(edits: FaceEdit[]) {
  return JSON.stringify(edits.map((e) => [e.index, ...EYE_KEYS.map((k) => e.makeup[k] ? [e.makeup[k].amount, e.makeup[k].color ?? '', e.makeup[k].preset ?? ''] : 0)]))
}

export function hasEyeFx(edits: FaceEdit[]) {
  return edits.some((e) => EYE_KEYS.some((k) => e.makeup[k]?.amount))
}

/**
 * Katmanları çiz. fx: RGBA (düz alfa) normal karıştırılır; iris: rgb hedef renk, a ağırlık.
 * Çözünürlük kaynağın en çok 2048 px'i (kirpik gibi ince çizgiler için yüz maskelerinden yüksek).
 */
export function buildEyeFx(geos: FaceGeo[], edits: FaceEdit[], W: number, H: number, maxRes = 2048): EyeFx | null {
  if (!hasEyeFx(edits)) return null
  const s = Math.min(1, maxRes / Math.max(W, H))
  const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s))
  const mk = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
  const fx = mk(), iris = mk()
  const f = fx.getContext('2d')!, ir = iris.getContext('2d')!
  for (const e of edits) {
    const g = geos[e.index]
    if (!g) continue
    const m = (k: EyeKey) => { const v = e.makeup[k]; return v && v.amount ? { a: v.amount / 100, color: v.color, preset: v.preset } : null }
    for (const side of [0, 1] as const) {
      const E = eyeGeo(g, side)
      const crease = m('crease')
      if (crease) {
        // çift göz kapağı: kapağın üstünde ince, yumuşak gölge çizgisi ve altında hafif ışık
        const off = E.w * 0.16
        f.save()
        f.filter = `blur(${Math.max(1, E.w * 0.035 * s)}px)`
        f.lineCap = 'round'
        f.strokeStyle = `rgba(70,40,35,${0.55 * crease.a})`
        f.lineWidth = E.w * 0.045 * s
        f.beginPath()
        for (let i = 0; i <= 20; i++) {
          const t = 0.08 + (i / 20) * 0.8
          const { p, n } = along(E.lid, t, E.up)
          const q = add(p, mul(n, off * Math.sin(Math.PI * (0.15 + t * 0.7))))
          if (i) f.lineTo(q.x * s, q.y * s); else f.moveTo(q.x * s, q.y * s)
        }
        f.stroke()
        f.restore()
      }
      const liner = m('liner')
      if (liner) {
        // göz kalemi: kapak çizgisi boyunca dışa doğru kalınlaşan şerit; "kanat" dış köşeden yukarı uzanır
        const wing = liner.preset === 'wing' ? 1 : liner.preset === 'thin' ? 0 : 0.45
        const thick = E.w * (liner.preset === 'thin' ? 0.03 : 0.05)
        const top: V[] = [], bot: V[] = []
        for (let i = 0; i <= 24; i++) {
          const t = i / 24
          const { p, n } = along(E.lid, t, E.up)
          const k = (1 - t) * 0.85 + 0.15 // dış köşede kalın
          top.push(add(p, mul(n, thick * k)))
          bot.push(add(p, mul(n, -thick * 0.15)))
        }
        if (wing > 0) {
          const tipDir = norm(add(sub(E.outer, E.c), mul(E.up, 0.9)))
          const tip = add(E.outer, mul(tipDir, E.w * 0.32 * wing))
          top.unshift(tip)
        }
        f.save()
        f.filter = `blur(${Math.max(0.6, E.w * 0.008 * s)}px)`
        f.fillStyle = hexA(liner.color ?? '#141012', 0.92 * liner.a)
        f.beginPath()
        ;[...top, ...bot.reverse()].forEach((p, i) => (i ? f.lineTo(p.x * s, p.y * s) : f.moveTo(p.x * s, p.y * s)))
        f.closePath()
        f.fill()
        f.restore()
      }
      const lash = m('lash')
      if (lash) {
        // kirpik: kapak boyunca dışa kıvrılan ince çizgiler; dış üçte birde uzun, hacimlide daha sık ve kalın
        const dense = lash.preset === 'volume'
        const n = dense ? 40 : 28
        const baseLen = E.w * (dense ? 0.17 : 0.13) * (0.6 + 0.4 * lash.a)
        f.save()
        f.lineCap = 'round'
        f.strokeStyle = hexA(lash.color ?? '#120e0c', 0.85)
        f.globalAlpha = Math.min(1, lash.a * 1.2)
        for (let i = 0; i < n; i++) {
          const t = 0.05 + (i / (n - 1)) * 0.85
          const { p, tg } = along(E.lid, t, E.up)
          // yelpaze: göz merkezinden dışa doğrultu ile yukarı yönün karışımı (köşelerde ters dönmesin)
          let dir = norm(add(mul(E.up, 0.6), mul(norm(sub(p, E.c)), 0.4)))
          if (dir.x * E.up.x + dir.y * E.up.y < 0.2) dir = E.up
          const L = baseLen * (0.5 + 0.7 * Math.pow(1 - t, 0.9)) * (0.88 + ((i * 53) % 11) / 45)
          const outward = mul(tg, -(0.15 + 0.35 * (1 - t))) // dış köşeye doğru kıvrım
          const ctl = add(p, mul(dir, L * 0.6))
          const tip = add(ctl, add(mul(dir, L * 0.25), mul(outward, L * 0.55)))
          f.lineWidth = Math.max(0.5, E.w * (dense ? 0.009 : 0.006) * s)
          f.beginPath()
          f.moveTo(p.x * s, p.y * s)
          f.quadraticCurveTo(ctl.x * s, ctl.y * s, tip.x * s, tip.y * s)
          f.stroke()
        }
        f.restore()
      }
      if (!E.iris) continue
      const { c: ic, r } = E.iris
      const col = m('iris')
      if (col) {
        // iris: göz açıklığıyla kırpılmış halka; gözbebeği ve kenarı hariç, kenara doğru yumuşar
        ir.save()
        clipEye(ir, E.ring, s)
        const grd = ir.createRadialGradient(ic.x * s, ic.y * s, r * 0.32 * s, ic.x * s, ic.y * s, r * 1.02 * s)
        const [cr, cg, cb] = hexRgb(col.color ?? '#3a7bd5')
        grd.addColorStop(0, `rgba(${cr},${cg},${cb},0)`)
        grd.addColorStop(0.12, `rgba(${cr},${cg},${cb},${col.a})`)
        grd.addColorStop(0.85, `rgba(${cr},${cg},${cb},${col.a})`)
        grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
        ir.fillStyle = grd
        ir.beginPath()
        ir.arc(ic.x * s, ic.y * s, r * 1.02 * s, 0, Math.PI * 2)
        ir.fill()
        ir.restore()
      }
      const cat = m('catch')
      if (cat) {
        // göz ışıltısı: üst-sol (ışık yönü) iris kenarına yakın parlak yansıma
        f.save()
        clipEye(f, E.ring, s)
        const lx = ic.x - r * 0.34, ly = ic.y - r * 0.36
        f.filter = `blur(${Math.max(0.5, r * 0.06 * s)}px)`
        f.fillStyle = `rgba(255,255,255,${0.8 * cat.a})`
        f.beginPath()
        if (cat.preset === 'window') f.roundRect((lx - r * 0.2) * s, (ly - r * 0.2) * s, r * 0.4 * s, r * 0.36 * s, r * 0.06 * s)
        else if (cat.preset === 'ring') { f.ellipse(ic.x * s, ic.y * s, r * 0.72 * s, r * 0.66 * s, 0, Math.PI * 1.05, Math.PI * 1.6); f.lineWidth = r * 0.12 * s; f.strokeStyle = `rgba(255,255,255,${0.8 * cat.a})`; f.stroke(); f.beginPath() }
        else f.ellipse(lx * s, ly * s, r * 0.13 * s, r * 0.11 * s, 0, 0, Math.PI * 2)
        f.fill()
        if (cat.preset === 'double') {
          f.beginPath()
          f.ellipse((ic.x + r * 0.35) * s, (ic.y + r * 0.32) * s, r * 0.08 * s, r * 0.07 * s, 0, 0, Math.PI * 2)
          f.fill()
        }
        f.restore()
      }
    }
  }
  return { fx, iris }
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function hexA(hex: string, a: number) {
  const [r, g, b] = hexRgb(hex)
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`
}
