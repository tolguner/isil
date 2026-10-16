// Çıkartma yapıcı: konuyu kes, kenar çizgisi ve gölge ekle, kişisel kitaplıkta sakla (IndexedDB, yerel).
import { removeBackground, toCanvas } from './ops'

type Src = CanvasImageSource & { width: number; height: number }
export interface StickerStyle { outline: 0 | 1 | 2; color: string; shadow: boolean }
export interface SavedSticker { id: string; png: Blob; w: number; h: number; at: number }

/** Konu maskesinin alfa kanalı (0..255), kaynak boyutunda. */
async function subjectAlpha(src: Src, detailed: boolean): Promise<{ a: Uint8ClampedArray; W: number; H: number } | null> {
  const m = await removeBackground(src, detailed)
  if (!m) return null
  const W = src.width, H = src.height
  const d = toCanvas(m, W, H).getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  const a = new Uint8ClampedArray(W * H)
  for (let i = 0; i < W * H; i++) a[i] = d[i * 4]
  return { a, W, H }
}

/**
 * Çıkartma görüntüsü (şeffaf PNG için tuval). Konu kırpılır, uzun kenar en çok `max` piksel olur.
 * Kenar çizgisi: alfa maskesinin dairesel genişletmesi (Minkowski toplamı) seçilen renkte boyanır.
 */
export async function makeSticker(src: Src, style: StickerStyle, opts: { detailed?: boolean; max?: number } = {}): Promise<HTMLCanvasElement | null> {
  const sa = await subjectAlpha(src, !!opts.detailed)
  if (!sa) return null
  const { a, W, H } = sa
  // konu kutusu
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (a[y * W + x] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  if (x1 < 0) return null
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  const max = opts.max ?? 1024
  const k = Math.min(1, max / Math.max(bw, bh))
  const ow = [0, 0.025, 0.05][style.outline] * Math.max(bw, bh) * k
  const pad = Math.ceil(ow + (style.shadow ? Math.max(bw, bh) * k * 0.04 : 0) + 4)
  const cw = Math.round(bw * k) + pad * 2, ch = Math.round(bh * k) + pad * 2
  // konu (RGBA, maskeyle)
  const cut = document.createElement('canvas')
  cut.width = W
  cut.height = H
  const cctx = cut.getContext('2d', { willReadFrequently: true })!
  cctx.drawImage(src, 0, 0, W, H)
  const id = cctx.getImageData(0, 0, W, H)
  for (let i = 0; i < W * H; i++) id.data[i * 4 + 3] = Math.min(id.data[i * 4 + 3], a[i])
  cctx.putImageData(id, 0, 0)
  const subj = document.createElement('canvas')
  subj.width = cw
  subj.height = ch
  const sctx = subj.getContext('2d')!
  sctx.imageSmoothingQuality = 'high'
  sctx.drawImage(cut, x0, y0, bw, bh, pad, pad, bw * k, bh * k)
  const out = document.createElement('canvas')
  out.width = cw
  out.height = ch
  const ctx = out.getContext('2d')!
  // kenar çizgisi: siluetin kopyalarını daire üzerinde kaydırarak birleşim, sonra renkle doldur
  if (ow > 0) {
    const sil = document.createElement('canvas')
    sil.width = cw
    sil.height = ch
    const lctx = sil.getContext('2d')!
    const steps = Math.max(16, Math.ceil(ow * 2.5))
    for (let r = ow; r > 0; r -= Math.max(1, ow / 3)) for (let i = 0; i < steps; i++) {
      const t = (i / steps) * Math.PI * 2
      lctx.drawImage(subj, Math.cos(t) * r, Math.sin(t) * r)
    }
    lctx.drawImage(subj, 0, 0)
    lctx.globalCompositeOperation = 'source-in'
    lctx.fillStyle = style.color
    lctx.fillRect(0, 0, cw, ch)
    if (style.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.35)'
      ctx.shadowBlur = Math.max(4, ow * 1.2)
      ctx.shadowOffsetY = Math.max(2, ow * 0.5)
    }
    ctx.drawImage(sil, 0, 0)
    ctx.shadowColor = 'transparent'
  } else if (style.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)'
    ctx.shadowBlur = Math.max(4, Math.max(cw, ch) * 0.02)
    ctx.shadowOffsetY = Math.max(2, Math.max(cw, ch) * 0.01)
  }
  ctx.drawImage(subj, 0, 0)
  return out
}

// ---- kişisel kitaplık (IndexedDB) ----
const DB = 'isil-stickers', STORE = 'stickers'
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
  const d = await db()
  return new Promise<T>((res, rej) => {
    const q = fn(d.transaction(STORE, mode).objectStore(STORE))
    q.onsuccess = () => res(q.result)
    q.onerror = () => rej(q.error)
  })
}
export async function saveSticker(c: HTMLCanvasElement): Promise<SavedSticker> {
  const png = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
  const s: SavedSticker = { id: crypto.randomUUID(), png, w: c.width, h: c.height, at: Date.now() }
  await tx('readwrite', (st) => st.put(s))
  return s
}
export async function listStickers(): Promise<SavedSticker[]> {
  const all = await tx<SavedSticker[]>('readonly', (st) => st.getAll() as IDBRequest<SavedSticker[]>)
  return all.sort((a, b) => b.at - a.at)
}
export async function deleteSticker(id: string) {
  await tx('readwrite', (st) => st.delete(id))
}
export const blobToDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b) })
