// HEIC/HEIF (iPhone fotoğrafları) çözücü. Chromium HEIC açamıyor; libheif'in WebAssembly derlemesi (libheif-js, LGPL-3.0)
// ilk kullanımda yüklenir. Yerel DLL olmadığı için Windows Akıllı Uygulama Denetimi'ne takılmaz.
import type { PickedFile } from './platform'

const HEIF_BRANDS = /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/

/** Dosya başındaki ftyp kutusuna bakarak HEIC/HEIF mi? (uzantıya güvenilmez) */
export function isHeic(b: Uint8Array): boolean {
  if (b.length < 12) return false
  const box = String.fromCharCode(b[4], b[5], b[6], b[7])
  const brand = String.fromCharCode(b[8], b[9], b[10], b[11])
  return box === 'ftyp' && HEIF_BRANDS.test(brand)
}

type Lib = { HeifDecoder: new () => { decode(b: Uint8Array): HeifImage[] } }
type HeifImage = { get_width(): number; get_height(): number; display(d: ImageData, cb: (r: ImageData | null) => void): void; free?: () => void }
let lib: Promise<Lib> | null = null

function load(): Promise<Lib> {
  lib ??= import('libheif-js/libheif-wasm/libheif-bundle.mjs').then(async (m) => {
    const made = await (m.default as () => Lib | Promise<Lib>)()
    const ready = (made as unknown as { ready?: Promise<unknown> }).ready
    if (ready) await ready
    return made
  })
  lib.catch(() => (lib = null))
  return lib
}

/** HEIC'i yüksek kaliteli JPEG'e çevirir (ilk görüntü; yön bilgisi libheif tarafından uygulanır). */
export async function heicToJpeg(b: Uint8Array): Promise<Uint8Array> {
  const L = await load()
  const imgs = new L.HeifDecoder().decode(b)
  if (!imgs?.length) throw new Error('HEIC içinde görüntü yok')
  const im = imgs[0]
  const w = im.get_width(), h = im.get_height()
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const data = ctx.createImageData(w, h)
  const out = await new Promise<ImageData>((res, rej) => im.display(data, (r) => (r ? res(r) : rej(new Error('HEIC çözülemedi')))))
  ctx.putImageData(out, 0, 0)
  for (const i of imgs) i.free?.()
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('JPEG kodlanamadı'))), 'image/jpeg', 0.95))
  return new Uint8Array(await blob.arrayBuffer())
}

/** Açılan dosya HEIC ise JPEG'e çevir (ad .jpg olur); değilse aynen döndür. */
export async function normalizePicked(f: PickedFile): Promise<PickedFile> {
  if (!isHeic(f.bytes)) return f
  return { name: f.name.replace(/\.(heic|heif)$/i, '') + '.jpg', bytes: await heicToJpeg(f.bytes) }
}
