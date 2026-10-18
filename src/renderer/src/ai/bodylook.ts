// Vücut görünümü: kas belirginliği ışık-gölgeyle (kontür makyajı gibi) çizilir. Poz noktalarından anatomik bir
// kabartma haritası (gölge −, ışık +) çıkarılır, yalnız açık ciltte ve öndeki kol/el hariç uygulanır; kıl, doku,
// ten rengi ve ışık kalır, anlık çalışır. Uygula'da sonuç isteğe bağlı olarak FLUX'a başlangıç görüntüsü olarak
// verilip düşük güçte gerçekçileştirilir. Ar-Ge 5 (replica/arge/05-vucut-gorunumu.md): yalnız FLUX karında yapay
// kıvrım üretti; göğüs, kol ve köprücük için iki yöntem de yetersiz kaldı. Arayüzde şimdilik yalnız karın var,
// diğer haritalar ölçüm için duruyor.
import type { PersonParts, Pt } from './vision'
import { grayToAlpha, localMaskedEdit } from './generative'
import { matchTone } from './ageface'

export type BodyLook = 'abs' | 'chest' | 'arms' | 'collar'
export const BODY_LOOKS: { id: BodyLook; label: [string, string] }[] = [
  { id: 'abs', label: ['Karın kası', 'Abs'] },
  { id: 'chest', label: ['Göğüs kası', 'Chest'] },
  { id: 'arms', label: ['Kol kası', 'Arms'] },
  { id: 'collar', label: ['Köprücük kemiği', 'Collarbones'] }
]
export type LookAmounts = Partial<Record<BodyLook, number>> // 0..100

type V = { x: number; y: number }
const add = (a: V, b: V): V => ({ x: a.x + b.x, y: a.y + b.y })
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y })
const mul = (a: V, k: number): V => ({ x: a.x * k, y: a.y * k })
const len = (a: V) => Math.hypot(a.x, a.y)

/** Görünür mü: omuzlar ve kalçalar yeterince güvenilir mi (MediaPipe görünürlük yoksa konumdan). */
export function torsoOk(pose: Pt[] | null): boolean {
  if (!pose || pose.length < 25) return false
  const inside = (p: Pt) => p.x > -0.05 && p.x < 1.05 && p.y > -0.05 && p.y < 1.05
  return [11, 12, 23, 24].every((i) => inside(pose[i])) && Math.abs(pose[11].x - pose[12].x) > 0.04
}

/**
 * Kabartma haritası: iki kanallı tuval (R = gölge, G = ışık), W×H çıktı uzayında. P: piksel konumu verir.
 * Gövde ekseni omuz ortasından kalça ortasına; e yanal birim vektör (görüntüde 12 → 11 yönü).
 */
export function relief(W: number, H: number, P: (i: number) => V, a: LookAmounts) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  g.globalCompositeOperation = 'lighter'
  const S = mul(add(P(11), P(12)), 0.5), Hp = mul(add(P(23), P(24)), 0.5)
  const ax = sub(Hp, S), tl = len(ax) || 1, d = mul(ax, 1 / tl)
  const lat = sub(P(11), P(12)), sw = len(lat) || 1, e = mul(lat, 1 / sw)
  const at = (t: number, l: number): V => add(add(S, mul(d, t * tl)), mul(e, l * sw)) // t gövde boyu, l omuz genişliği oranı
  const shade = (k: number) => `rgba(${Math.round(255 * k)},0,0,1)`
  const light = (k: number) => `rgba(0,${Math.round(255 * k)},0,1)`
  const line = (pts: V[], w: number, col: string) => {
    g.strokeStyle = col
    g.lineWidth = w
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
    g.stroke()
  }
  const blob = (c0: V, rx: number, ry: number, col: string, ang = Math.atan2(d.y, d.x) - Math.PI / 2) => {
    g.fillStyle = col
    g.beginPath()
    g.ellipse(c0.x, c0.y, rx, ry, ang, 0, Math.PI * 2)
    g.fill()
  }
  const curve = (f: (s: number) => V, n = 12) => Array.from({ length: n + 1 }, (_, i) => f(i / n))
  const k = (id: BodyLook) => Math.max(0, Math.min(1, (a[id] ?? 0) / 100))

  if (k('abs')) {
    const s = k('abs')
    line(curve((u) => at(0.42 + u * 0.5, 0)), sw * 0.03, shade(0.55 * s)) // orta çizgi
    for (const t of [0.53, 0.65, 0.77]) line(curve((u) => at(t - 0.02 * Math.cos((u - 0.5) * Math.PI), (u - 0.5) * 0.4)), sw * 0.022, shade(0.45 * s)) // ara çizgiler
    for (const t of [0.475, 0.59, 0.71, 0.83]) for (const l of [-0.1, 0.1]) blob(at(t, l), sw * 0.075, tl * 0.045, light(0.35 * s)) // bloklar
    for (const sg of [-1, 1]) line(curve((u) => at(0.44 + u * 0.48, sg * (0.24 - 0.04 * u))), sw * 0.04, shade(0.4 * s)) // yan hat
  }
  if (k('chest')) {
    const s = k('chest')
    for (const sg of [-1, 1]) {
      line(curve((u) => at(0.08 + 0.22 * Math.sin(u * Math.PI * 0.5), sg * (0.04 + 0.38 * u))), sw * 0.05, shade(0.5 * s)) // göğüs alt kenarı
      blob(at(0.17, sg * 0.2), sw * 0.16, tl * 0.08, light(0.3 * s))
    }
    line(curve((u) => at(0.04 + u * 0.24, 0)), sw * 0.03, shade(0.4 * s))
  }
  if (k('collar')) {
    const s = k('collar')
    const notch = at(-0.02, 0)
    for (const sh of [P(11), P(12)]) {
      const end = add(notch, mul(sub(sh, notch), 0.85))
      const bow = (u: number) => add(add(notch, mul(sub(end, notch), u)), mul(d, -Math.sin(u * Math.PI) * sw * 0.025))
      line(curve(bow), sw * 0.022, light(0.55 * s))
      line(curve((u) => add(bow(u), mul(d, sw * 0.035))), sw * 0.03, shade(0.5 * s))
    }
    blob(add(notch, mul(d, -sw * 0.01)), sw * 0.035, sw * 0.03, shade(0.45 * s))
  }
  if (k('arms')) {
    const s = k('arms')
    for (const [sh, el] of [[11, 13], [12, 14]]) {
      const A = P(sh), B = P(el), ua = sub(B, A), L = len(ua) || 1, ud = mul(ua, 1 / L)
      const side = { x: -ud.y, y: ud.x }
      const along = (t: number, o: number) => add(add(A, mul(ua, t)), mul(side, o * sw))
      blob(along(0.12, 0), sw * 0.13, sw * 0.12, light(0.3 * s)) // omuz yuvarlağı
      line(curve((u) => along(0.28 + u * 0.12, (u - 0.5) * 0.12)), sw * 0.03, shade(0.45 * s)) // omuz kası alt sınırı
      blob(along(0.58, 0), L * 0.2, sw * 0.07, light(0.35 * s), Math.atan2(ud.y, ud.x)) // pazı
      for (const sg of [-1, 1]) line(curve((u) => along(0.42 + u * 0.4, sg * 0.1)), sw * 0.035, shade(0.3 * s)) // kenar gölgeleri
    }
  }
  g.globalCompositeOperation = 'source-over'
  // yumuşat: kas kabartması keskin çizgi değil, geniş geçiş
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const o = out.getContext('2d')!
  o.filter = `blur(${Math.max(1.5, sw * 0.03)}px)`
  o.drawImage(c, 0, 0)
  return { map: out, sw }
}

/** Öndeki kollar ve eller: gövde görünümleri bunların üstüne işlenmez. */
function occluders(W: number, H: number, P: (i: number) => V, sw: number) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.strokeStyle = '#fff'
  g.lineCap = 'round'
  g.lineWidth = sw * 0.26
  for (const [a, b, h] of [[13, 15, 19], [14, 16, 20]]) {
    g.beginPath()
    g.moveTo(P(a).x, P(a).y)
    g.lineTo(P(b).x, P(b).y)
    g.lineTo(P(h).x, P(h).y)
    g.stroke()
  }
  return c
}

/**
 * Görünümü uygula: img (önizleme ya da tam çözünürlük), pose normalize noktalar, seg tüm görüntünün kişi
 * bölütlemesi (normalize ızgara). Döner: yeni tuval ve kas bölgesinde açık cilt payı (0..1).
 */
export function applyBodyLook(img: CanvasImageSource & { width: number; height: number }, pose: Pt[], seg: PersonParts, a: LookAmounts): { canvas: HTMLCanvasElement; skin: number; mask: HTMLCanvasElement; box: { x: number; y: number; w: number; h: number } } {
  const W = img.width, H = img.height
  const P = (i: number): V => ({ x: pose[i].x * W, y: pose[i].y * H })
  const { map, sw } = relief(W, H, P, a)
  const occ = torsoArms(a) ? occluders(W, H, P, sw).getContext('2d')!.getImageData(0, 0, W, H).data : null
  const out = document.createElement('canvas')
  out.width = W
  out.height = H
  const ctx = out.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)
  const id = ctx.getImageData(0, 0, W, H)
  const px = id.data
  const m = map.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  // YZ ile işlemek için bölge maskesi: kabartmanın kapladığı açık cilt (öndeki kollar hariç)
  const mk = new ImageData(W, H)
  let bx0 = W, by0 = H, bx1 = 0, by1 = 0
  let area = 0, skinA = 0
  for (let y = 0; y < H; y++) {
    const sy = Math.min(seg.h - 1, Math.floor((y / H) * seg.h))
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const sh = m[i * 4] / 255, li = m[i * 4 + 1] / 255
      if (sh < 0.004 && li < 0.004) continue
      area++
      const sx = Math.min(seg.w - 1, Math.floor((x / W) * seg.w))
      let w = Math.min(1, Math.max(0, (seg.bodySkin[sy * seg.w + sx] - 0.35) / 0.3))
      if (w > 0.5) skinA++
      if (occ) w *= 1 - occ[i * 4] / 255
      if (w <= 0) continue
      mk.data[i * 4] = mk.data[i * 4 + 1] = mk.data[i * 4 + 2] = Math.round(255 * w)
      if (x < bx0) bx0 = x
      if (x > bx1) bx1 = x
      if (y < by0) by0 = y
      if (y > by1) by1 = y
      // gölge: çarp (koyulaştır), ışık: perde (aç); ten rengi ve doku korunur
      for (let ch = 0; ch < 3; ch++) {
        const v = px[i * 4 + ch] / 255
        const s1 = v * (1 - 0.85 * sh * w)
        px[i * 4 + ch] = Math.round(255 * (1 - (1 - s1) * (1 - 0.6 * li * w)))
      }
    }
  }
  ctx.putImageData(id, 0, 0)
  for (let i = 0; i < W * H; i++) mk.data[i * 4 + 3] = 255
  const mask = document.createElement('canvas')
  mask.width = W
  mask.height = H
  mask.getContext('2d')!.putImageData(mk, 0, 0)
  return { canvas: out, skin: area ? skinA / area : 0, mask, box: { x: bx0, y: by0, w: Math.max(0, bx1 - bx0), h: Math.max(0, by1 - by0) } }
}

/** Gövde görünümlerinden biri açıksa öndeki kollar maskelenir (kol kası kendi alanında maskelenmez). */
function torsoArms(a: LookAmounts) {
  return !!(a.abs || a.chest || a.collar)
}

/**
 * YZ ile gerçekçileştir: ışık-gölge sonucu FLUX'a başlangıç görüntüsü olarak verilir ve düşük güçte yeniden
 * işlenir (yapı korunur, doku ve geçişler gerçekçi olur). Bölge kırpılıp ~1024 px'e büyütülür.
 */
export async function refineBodyLook(full: HTMLCanvasElement, shaded: HTMLCanvasElement, mask: HTMLCanvasElement, box: { x: number; y: number; w: number; h: number }, looks: BodyLook[], strength = 0.5): Promise<HTMLCanvasElement | null> {
  const W0 = full.width, H0 = full.height
  const side = Math.max(box.w, box.h) * 1.3
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2
  const bx = Math.round(Math.max(0, Math.min(W0 - Math.min(side, W0), cx - side / 2)))
  const by = Math.round(Math.max(0, Math.min(H0 - Math.min(side, H0), cy - side / 2)))
  const cw = Math.round(Math.min(side, W0)), ch = Math.round(Math.min(side, H0))
  const k = Math.min(4, 1024 / Math.max(cw, ch))
  const W = Math.round(cw * k), H = Math.round(ch * k)
  const cut = (src: CanvasImageSource) => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d')!.drawImage(src, bx, by, cw, ch, 0, 0, W, H); return c }
  const orig = cut(full), pre = cut(shaded), m = cut(mask)
  const what: Record<BodyLook, string> = { abs: 'defined abdominal muscles', chest: 'defined pectoral muscles', arms: 'toned arm and shoulder muscles', collar: 'visible collarbones' }
  const prompt = `The same person with ${looks.map((l) => what[l]).join(', ')}, natural realistic skin with the same body hair, texture, skin tone and lighting. Photorealistic photo.`
  const edited = await localMaskedEdit(orig, m, prompt, { prefill: pre, strength })
  if (!edited) return null
  matchTone(orig, edited, m)
  const ec = edited.getContext('2d')!
  ec.globalCompositeOperation = 'destination-in'
  ec.drawImage(grayToAlpha(m, W, H), 0, 0)
  const out = document.createElement('canvas')
  out.width = W0
  out.height = H0
  const o = out.getContext('2d')!
  o.drawImage(full, 0, 0)
  o.drawImage(edited, 0, 0, W, H, bx, by, cw, ch)
  return out
}
