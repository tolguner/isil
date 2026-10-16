// Saç ve kıyafet değiştirme: yalnız saç (ya da kıyafet) bölgesi FLUX ile yeniden çizilir, yüz ve arka plan
// piksel piksel korunur. Rakiplerde bu iş bulutta ve tüm görüntüyü yeniden üretiyor (kimlik kayabiliyor).
import { segmentPerson } from './vision'
import { localMaskedEdit } from './generative'
import { toCanvas } from './ops'

type Src = HTMLCanvasElement

export type RestyleKind = 'hair' | 'outfit'

/**
 * Düzenleme maskesi (kaynak boyutunda gri tuval, beyaz = yeniden çiz).
 * Saç: saç maskesi, saçın büyüyebileceği kadar dışa genişletilir (kıvırcık/uzun saç için yer); yüz derisi
 * genişletmeden önce çıkarılır, böylece yüz hiç değişmez. Kıyafet: kıyafet maskesi biraz genişletilir;
 * yüz ve saç dışarıda kalır.
 */
export async function restyleMask(src: Src, kind: RestyleKind, grow = 1): Promise<{ mask: HTMLCanvasElement; area: number } | null> {
  const p = await segmentPerson(src)
  const W = src.width, H = src.height
  const small = document.createElement('canvas')
  small.width = p.w
  small.height = p.h
  const sctx = small.getContext('2d')!
  const id = sctx.createImageData(p.w, p.h)
  const keep = new Float32Array(p.w * p.h) // korunacak: yüz derisi (+ kıyafette saç)
  for (let i = 0; i < p.w * p.h; i++) {
    const v = kind === 'hair' ? p.hair[i] : p.clothes[i]
    const g = v > 0.45 ? 255 : 0
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = g
    id.data[i * 4 + 3] = 255
    keep[i] = Math.max(p.faceSkin[i], kind === 'outfit' ? p.hair[i] : 0)
  }
  sctx.putImageData(id, 0, 0)
  const m = document.createElement('canvas')
  m.width = W
  m.height = H
  const ctx = m.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  ctx.imageSmoothingQuality = 'high'
  // genişletme: bulanıklaştır + eşik (saçta geniş, kıyafette dar)
  const r = Math.round(Math.max(W, H) * (kind === 'hair' ? 0.035 : 0.012) * grow)
  ctx.filter = `blur(${r}px)`
  ctx.drawImage(small, 0, 0, W, H)
  ctx.drawImage(small, 0, 0, W, H)
  ctx.filter = 'none'
  const d = ctx.getImageData(0, 0, W, H)
  let area = 0
  for (let y = 0; y < H; y++) {
    const sy = Math.min(p.h - 1, Math.floor((y / H) * p.h))
    for (let x = 0; x < W; x++) {
      const sx = Math.min(p.w - 1, Math.floor((x / W) * p.w))
      const i = (y * W + x) * 4
      const on = d.data[i] > 25 && keep[sy * p.w + sx] < 0.3
      const v = on ? 255 : 0
      if (on) area++
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v
    }
  }
  ctx.putImageData(d, 0, 0)
  if (area < W * H * 0.005) return null
  return { mask: m, area: area / (W * H) }
}

/** Saç ya da kıyafeti tarif edilen stile çevir; maskenin dışı (yüz, arka plan) birebir korunur. */
export async function restyle(src: Src, kind: RestyleKind, what: string): Promise<HTMLCanvasElement | null> {
  const mk = await restyleMask(src, kind)
  if (!mk) throw new Error(kind === 'hair' ? 'no-hair' : 'no-outfit')
  const prompt = kind === 'hair'
    ? `Change only the hair: ${what}. Keep the face, skin, expression, clothes and background exactly the same. Photorealistic.`
    : `Change only the clothes: ${what}. Keep the face, hair, body pose, hands and background exactly the same. Photorealistic, natural fabric folds and lighting.`
  return localMaskedEdit(toCanvas(src), mk.mask, prompt)
}
