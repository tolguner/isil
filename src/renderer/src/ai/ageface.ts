// Yaş ve ifade dönüşümü: yüzün çevresi kırpılıp FLUX.2 klein ile maskeli yeniden çizilir, sonra yumuşak kenarla
// yerine konur. Maske dönüşüme göre dar tutulur (ifade: ağız ve yanaklar; gözler: göz çevresi; yaş: tüm yüz).
// Kimliğin korunması Ar-Ge'de yüz benzerliğiyle (ArcFace, yalnız ölçüm düzeneğinde) ölçülerek güç ayarlandı.
import { EYE_L, EYE_R, LIPS_OUT, OVAL, type FaceGeo } from '@/engine/face'
import { grayToAlpha, localMaskedEdit } from './generative'
import { toCanvas } from './ops'

type Src = CanvasImageSource & { width: number; height: number }

export type FaceChange = 'smile' | 'grin' | 'neutral' | 'eyes' | 'younger' | 'older' | 'elderly'
type Region = 'mouth' | 'eyes' | 'face'

export const FACE_CHANGES: { id: FaceChange; group: 'expr' | 'age'; label: [string, string]; region: Region; strength: number; prompt: string }[] = [
  { id: 'smile', group: 'expr', label: ['Hafif gülümse', 'Soft smile'], region: 'mouth', strength: 0.8,
    prompt: 'The same person with a natural gentle closed-mouth smile, relaxed cheeks, identical face shape, skin tone and lighting. Photorealistic portrait.' },
  { id: 'grin', group: 'expr', label: ['Geniş gülümse', 'Big smile'], region: 'mouth', strength: 0.85,
    prompt: 'The same person with a big genuine happy smile showing natural white teeth, raised cheeks, identical face shape, skin tone and lighting. Photorealistic portrait.' },
  { id: 'neutral', group: 'expr', label: ['Ciddi', 'Neutral'], region: 'mouth', strength: 0.8,
    prompt: 'The same person with a calm neutral expression, relaxed closed lips, no smile, identical face shape, skin tone and lighting. Photorealistic portrait.' },
  { id: 'eyes', group: 'expr', label: ['Gözleri aç', 'Open eyes'], region: 'eyes', strength: 0.85,
    prompt: 'The same person with both eyes fully open looking at the camera, natural irises and eyelashes, identical eye color, skin tone and lighting. Photorealistic portrait.' },
  { id: 'younger', group: 'age', label: ['Daha genç', 'Younger'], region: 'face', strength: 0.7,
    prompt: 'The same person about ten years younger, smoother firmer skin, fewer lines, identical identity, face shape, eye color, hairstyle and lighting. Photorealistic portrait.' },
  { id: 'older', group: 'age', label: ['Daha yaşlı', 'Older'], region: 'face', strength: 0.6,
    prompt: 'The same person about fifteen years older, subtle natural fine lines around the eyes and mouth, identical identity, face shape, skin tone, eye color and lighting. Photorealistic portrait.' },
  { id: 'elderly', group: 'age', label: ['Çok yaşlı', 'Elderly'], region: 'face', strength: 0.68,
    prompt: 'The same person about thirty years older, natural wrinkles around the eyes, forehead and mouth, slightly thinner lips, identical identity, face shape, skin tone, eye color and lighting. Photorealistic portrait.' }
]

/** Bölge maskesi (kırpma uzayında, beyaz = yeniden çiz). P: piksel uzayında nokta okuyucu. */
function regionMask(g: FaceGeo, region: Region, ox: number, oy: number, k: number, w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#fff'
  const P = (i: number) => ({ x: (g.p(i).x - ox) * k, y: (g.p(i).y - oy) * k })
  const fw = g.width * k
  const poly = (idx: number[], grow: number) => {
    const pts = idx.map(P)
    const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length
    ctx.beginPath()
    pts.forEach((p, i) => { const x = cx + (p.x - cx) * grow, y = cy + (p.y - cy) * grow; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y) })
    ctx.closePath()
    ctx.fill()
  }
  if (region === 'face') {
    poly(OVAL, 1.06)
    // boyun: yaş yüzle birlikte değişsin, çene altında genç/yaşlı sınırı kalmasın
    const ch = P(152), d = g.down
    const nw = fw * 0.38, nh = g.height * k * 0.55
    ctx.beginPath()
    ctx.ellipse(ch.x + d.x * nh * 0.5, ch.y + d.y * nh * 0.5, nw, nh * 0.6, Math.atan2(d.y, d.x) - Math.PI / 2, 0, Math.PI * 2)
    ctx.fill()
  } else if (region === 'eyes') {
    poly(EYE_R, 1.9)
    poly(EYE_L, 1.9)
  } else {
    // ağız, yanaklar ve nazolabial çizgiler: ağzın çevresi + burun kanatlarından çeneye kadar
    poly(LIPS_OUT, 1.9)
    const pts = [205, 425, 436, 434, 430, 152, 210, 214, 216].map(P)
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.closePath()
    ctx.fill()
  }
  // yumuşak kenar
  const s = document.createElement('canvas')
  s.width = w
  s.height = h
  const sc = s.getContext('2d')!
  sc.filter = `blur(${Math.max(2, fw * 0.025)}px)`
  sc.drawImage(c, 0, 0)
  return s
}

/**
 * Ten rengini koru: FLUX yaşlandırırken teni soldurup griye çekebiliyor; maskeli alanın ortalama rengi asıl
 * görselinkine kanal kazancıyla (en çok ±%15) yaklaştırılır. Kırışık ve doku kalır, yalnız genel ton düzelir.
 */
export function matchTone(orig: HTMLCanvasElement, edited: HTMLCanvasElement, mask: HTMLCanvasElement) {
  const W = orig.width, H = orig.height
  const o = orig.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  const ectx = edited.getContext('2d', { willReadFrequently: true })!
  const eid = ectx.getImageData(0, 0, W, H)
  const e = eid.data
  const m = mask.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  const so = [0, 0, 0], se = [0, 0, 0]
  for (let i = 0; i < W * H; i += 3) if (m[i * 4] > 200) for (let c = 0; c < 3; c++) { so[c] += o[i * 4 + c]; se[c] += e[i * 4 + c] }
  const gain = so.map((v, c) => Math.max(0.85, Math.min(1.15, v / Math.max(se[c], 1))))
  for (let i = 0; i < W * H; i++) {
    const a = m[i * 4] / 255
    if (a < 0.01) continue
    for (let c = 0; c < 3; c++) e[i * 4 + c] = e[i * 4 + c] * (1 + (gain[c] - 1) * a)
  }
  ectx.putImageData(eid, 0, 0)
}

/**
 * Bir yüzü dönüştür. full: tam çözünürlüklü görsel, g: tam çözünürlük piksel uzayında yüz geometrisi.
 * Yüzün çevresi (yüz genişliğinin ~2,2 katı kare) kırpılıp ~1024 px'e büyütülür: küçük yüzlerde de ayrıntı kalır.
 */
export async function changeFace(full: Src, g: FaceGeo, change: FaceChange, strength?: number): Promise<HTMLCanvasElement | null> {
  const def = FACE_CHANGES.find((x) => x.id === change)!
  const c = g.center
  const side = Math.min(Math.max(g.width, g.height) * 2.2, Math.max(full.width, full.height))
  const x0 = Math.round(Math.max(0, Math.min(full.width - Math.min(side, full.width), c.x - side / 2)))
  const y0 = Math.round(Math.max(0, Math.min(full.height - Math.min(side, full.height), c.y - side / 2)))
  const cw = Math.round(Math.min(side, full.width)), ch = Math.round(Math.min(side, full.height))
  const k = Math.min(4, 1024 / Math.max(cw, ch))
  const W = Math.round(cw * k), H = Math.round(ch * k)
  const crop = document.createElement('canvas')
  crop.width = W
  crop.height = H
  crop.getContext('2d')!.drawImage(full as CanvasImageSource, x0, y0, cw, ch, 0, 0, W, H)
  const mask = regionMask(g, def.region, x0, y0, k, W, H)
  const edited = await localMaskedEdit(crop, mask, def.prompt, { strength: strength ?? def.strength })
  if (!edited) return null
  if (def.region === 'face') matchTone(crop, edited, mask)
  // yalnız maskeli alanı geri koy: kırpmanın geri kalanı büyütme/küçültmeyle yumuşamasın
  const pc = edited.getContext('2d')!
  pc.globalCompositeOperation = 'destination-in'
  pc.drawImage(grayToAlpha(mask, W, H), 0, 0)
  pc.globalCompositeOperation = 'source-over'
  const out = toCanvas(full)
  out.getContext('2d')!.drawImage(edited, 0, 0, W, H, x0, y0, cw, ch)
  return out
}
