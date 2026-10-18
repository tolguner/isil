// Göz makyajı ve yüz ayrıntıları: göz kalemi, kirpik, çift göz kapağı, göz ışıltısı, çil, ben, gamze, ruj stilleri
// ve kaş stilleri (katman); göz rengi (iris maskesi).
// Hepsi yüz noktalarından kaynak uzayında çizilir; rötuş gölgelendiricisi katmanı normal karıştırmayla,
// iris rengini parlaklığı koruyarak uygular. Kalıplar ve şekiller bizim; çizim yordamsaldır.
import type { FaceEdit } from '@shared/schema'
import { BROW_L, BROW_R, EYE_L, EYE_R, LIPS_IN, LIPS_OUT, UPPER_LID_L, UPPER_LID_R, type FaceGeo } from './face'

export const EYE_KEYS = ['liner', 'lash', 'crease', 'iris', 'catch', 'freckle', 'mole', 'dimple'] as const
/** Katmanla çizilen ruj ve kaş stilleri (saten ve dolgu gölgelendiricide). */
const LIP_FX = ['matte', 'gloss', 'glass', 'ombre'], BROW_FX = ['powder', 'micro']
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
  return JSON.stringify(edits.map((e) => [e.index, ...[...EYE_KEYS, 'lip', 'brow'].map((k) => e.makeup[k] ? [e.makeup[k].amount, e.makeup[k].color ?? '', e.makeup[k].preset ?? ''] : 0)]))
}

const lipFx = (e: FaceEdit) => !!e.makeup.lip?.amount && LIP_FX.includes(e.makeup.lip.preset ?? '')
export const browFx = (e: FaceEdit) => !!e.makeup.brow?.amount && BROW_FX.includes(e.makeup.brow.preset ?? '')

export function hasEyeFx(edits: FaceEdit[]) {
  return edits.some((e) => EYE_KEYS.some((k) => e.makeup[k]?.amount) || lipFx(e) || browFx(e))
}

/** Yüz başına sabit tohumlu sözde rastgele (çiller her çizimde aynı yerde kalsın). */
function rng(seed: number) {
  let x = seed >>> 0 || 1
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000 }
}

/** Çil, ben, gamze, ruj ve kaş stilleri. */
function drawDetails(f: CanvasRenderingContext2D, g: FaceGeo, e: FaceEdit, s: number) {
  const F = g.width
  const m = (k: string) => { const v = e.makeup[k]; return v && v.amount ? { a: v.amount / 100, color: v.color, preset: v.preset } : null }
  const P = (i: number) => g.p(i)
  const fr = m('freckle')
  if (fr) {
    // burun sırtı ve yanak üstünde, kenara doğru seyrelen küçük lekeler
    const rand = rng(Math.round(P(1).x * 7 + P(1).y * 13))
    const zones: [V, number, number][] = [[P(195), F * 0.1, F * 0.05], [P(118), F * 0.15, F * 0.08], [P(347), F * 0.15, F * 0.08]]
    const [cr, cg, cb] = hexRgb(fr.color ?? '#7a4a2e')
    f.save()
    f.filter = `blur(${Math.max(0.4, F * 0.0015 * s)}px)`
    const n = Math.round(60 + 160 * fr.a)
    for (const [c, rx, ry] of zones) {
      for (let i = 0; i < n / 3; i++) {
        const ang = rand() * Math.PI * 2, rr = Math.sqrt(rand())
        const x = c.x + Math.cos(ang) * rx * rr, y = c.y + Math.sin(ang) * ry * rr
        const r = F * (0.0025 + rand() * 0.005)
        f.fillStyle = `rgba(${cr},${cg},${cb},${(0.18 + rand() * 0.3) * fr.a * (1 - rr * 0.6)})`
        f.beginPath()
        f.ellipse(x * s, y * s, r * s, r * (0.75 + rand() * 0.4) * s, rand() * 3, 0, Math.PI * 2)
        f.fill()
      }
    }
    f.restore()
  }
  const mo = m('mole')
  if (mo) {
    // ben: seçilen konumda küçük, kenarı yumuşak koyu leke
    const spots: Record<string, V> = {
      cheek: add(P(425), mul(sub(P(425), P(1)), 0.25)),
      lip: add(add(P(291), mul(sub(P(358), P(291)), 0.45)), mul(norm(sub(P(291), P(1))), F * 0.03)),
      chin: add(P(199), mul(sub(P(424), P(199)), 0.6)),
      eye: add(P(450), mul(sub(P(450), P(1)), 0.15))
    }
    const c = spots[mo.preset ?? 'cheek'] ?? spots.cheek
    const r = F * 0.013
    const grd = f.createRadialGradient(c.x * s, c.y * s, 0, c.x * s, c.y * s, r * s)
    grd.addColorStop(0, `rgba(48,28,20,${0.95 * mo.a})`)
    grd.addColorStop(0.7, `rgba(70,42,30,${0.75 * mo.a})`)
    grd.addColorStop(1, 'rgba(70,42,30,0)')
    f.fillStyle = grd
    f.beginPath()
    f.arc(c.x * s, c.y * s, r * s, 0, Math.PI * 2)
    f.fill()
  }
  const di = m('dimple')
  if (di) {
    // gamze: ağız köşelerinin dışında küçük hilal gölge
    f.save()
    f.filter = `blur(${Math.max(0.8, F * 0.006 * s)}px)`
    f.strokeStyle = `rgba(80,42,32,${0.6 * di.a})`
    f.lineWidth = F * 0.016 * s
    f.lineCap = 'round'
    for (const [corner, other] of [[61, 291], [291, 61]]) {
      const out = norm(sub(P(corner), P(other)))
      const c = add(add(P(corner), mul(out, F * 0.055)), mul(g.down, F * 0.01))
      const a0 = Math.atan2(out.y, out.x)
      f.beginPath()
      f.arc(c.x * s, c.y * s, F * 0.024 * s, a0 - 0.9, a0 + 0.9)
      f.stroke()
    }
    f.restore()
  }
  if (lipFx(e)) {
    const lip = e.makeup.lip
    const a = lip.amount / 100
    const [cr, cg, cb] = hexRgb(lip.color ?? '#b8324a')
    const mw = len(sub(P(291), P(61)))
    const across = norm(sub(P(291), P(61)))
    f.save()
    // dudak alanına kırp (dış − iç)
    f.beginPath()
    LIPS_OUT.map(P).forEach((p, i) => (i ? f.lineTo(p.x * s, p.y * s) : f.moveTo(p.x * s, p.y * s)))
    f.closePath()
    LIPS_IN.map(P).reverse().forEach((p, i) => (i ? f.lineTo(p.x * s, p.y * s) : f.moveTo(p.x * s, p.y * s)))
    f.closePath()
    f.clip('evenodd')
    const lower = add(P(14), mul(sub(P(17), P(14)), 0.4)), upper = add(P(13), mul(sub(P(0), P(13)), 0.45))
    const st = lip.preset
    if (st === 'matte') {
      // mat: ruj renginde ince örtü parlamayı bastırır
      f.fillStyle = `rgba(${cr},${cg},${cb},${0.3 * a})`
      f.fillRect(0, 0, f.canvas.width, f.canvas.height)
    } else if (st === 'ombre') {
      // ombre: ortada koyu, kenara doğru açılan renk
      const mid = mul(add(P(13), P(14)), 0.5)
      const grd = f.createRadialGradient(mid.x * s, mid.y * s, 0, mid.x * s, mid.y * s, mw * 0.55 * s)
      grd.addColorStop(0, `rgba(${Math.round(cr * 0.55)},${Math.round(cg * 0.45)},${Math.round(cb * 0.5)},${0.7 * a})`)
      grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`)
      f.fillStyle = grd
      f.fillRect(0, 0, f.canvas.width, f.canvas.height)
    } else {
      // parlak / cam: alt dudak ortasında ve üst dudakta yumuşak beyaz vurgu
      const k = st === 'glass' ? 0.75 : 0.6
      f.filter = `blur(${Math.max(0.8, mw * (st === 'glass' ? 0.016 : 0.022) * s)}px)`
      f.fillStyle = `rgba(255,255,255,${0.55 * k * a})`
      f.beginPath()
      f.ellipse(lower.x * s, lower.y * s, mw * 0.16 * s, mw * 0.045 * s, Math.atan2(across.y, across.x), 0, Math.PI * 2)
      f.fill()
      f.fillStyle = `rgba(255,255,255,${0.35 * k * a})`
      for (const side of [-1, 1]) {
        const u = add(upper, mul(across, side * mw * 0.12))
        f.beginPath()
        f.ellipse(u.x * s, u.y * s, mw * 0.06 * s, mw * 0.02 * s, 0, 0, Math.PI * 2)
        f.fill()
      }
      if (st === 'glass') {
        f.fillStyle = `rgba(255,255,255,${0.08 * a})`
        f.fillRect(0, 0, f.canvas.width, f.canvas.height)
      }
    }
    f.restore()
  }
  if (browFx(e)) {
    const br = e.makeup.brow
    const a = br.amount / 100
    const [cr, cg, cb] = hexRgb(br.color ?? '#4a3426')
    for (const idx of [BROW_R, BROW_L]) {
      const pts = idx.map(P)
      const inner = pts.reduce((b, p) => (len(sub(p, P(168))) < len(sub(b, P(168))) ? p : b))
      const outer = pts.reduce((b, p) => (len(sub(p, P(168))) > len(sub(b, P(168))) ? p : b))
      if (br.preset === 'powder') {
        // pudra: iç uçta açık, kuyruğa doğru koyulaşan yumuşak dolgu
        f.save()
        f.filter = `blur(${Math.max(1, F * 0.008 * s)}px)`
        const grd = f.createLinearGradient(inner.x * s, inner.y * s, outer.x * s, outer.y * s)
        grd.addColorStop(0, `rgba(${cr},${cg},${cb},${0.15 * a})`)
        grd.addColorStop(0.4, `rgba(${cr},${cg},${cb},${0.5 * a})`)
        grd.addColorStop(1, `rgba(${cr},${cg},${cb},${0.6 * a})`)
        f.fillStyle = grd
        f.beginPath()
        pts.forEach((p, i) => (i ? f.lineTo(p.x * s, p.y * s) : f.moveTo(p.x * s, p.y * s)))
        f.closePath()
        f.fill()
        f.restore()
      } else {
        // mikro: kaş içinde, dışa ve yukarı yatık ince kıl çizgileri
        const path = new Path2D()
        pts.forEach((p, i) => (i ? path.lineTo(p.x * s, p.y * s) : path.moveTo(p.x * s, p.y * s)))
        path.closePath()
        const dir = norm(sub(outer, inner))
        const rand = rng(Math.round(inner.x * 3 + inner.y * 5))
        f.save()
        f.clip(path)
        f.strokeStyle = `rgba(${cr},${cg},${cb},${0.75 * a})`
        f.lineWidth = Math.max(0.5, F * 0.0022 * s)
        f.lineCap = 'round'
        const x0 = Math.min(...pts.map((p) => p.x)), x1 = Math.max(...pts.map((p) => p.x))
        const y0 = Math.min(...pts.map((p) => p.y)), y1 = Math.max(...pts.map((p) => p.y))
        for (let i = 0; i < 70; i++) {
          const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0)
          const t = len(sub({ x, y }, inner)) / (len(sub(outer, inner)) || 1)
          // iç uçta dik, kuyrukta kaşa paralel
          const d = norm(add(mul(dir, 0.35 + 0.6 * t), mul(g.down, -(1 - t) * 0.9 - 0.25)))
          const L = F * (0.02 + rand() * 0.012)
          f.beginPath()
          f.moveTo(x * s, y * s)
          f.lineTo((x + d.x * L) * s, (y + d.y * L) * s)
          f.stroke()
        }
        f.restore()
      }
    }
  }
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
    drawDetails(f, g, e, s)
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
