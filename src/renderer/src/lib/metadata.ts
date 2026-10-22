// Dışa aktarma meta verisi.
// - Kaynak fotoğrafın EXIF'i (çekim tarihi, kamera, objektif, pozlama) istenirse korunur; konum (GPS) her zaman
//   silinir, yön 1'e çekilir (pikseller zaten döndürülmüş), eski küçük resim atılır.
// - Üretken yapay zekâ (FLUX) kullanıldıysa IPTC "DigitalSourceType" XMP kaydı yazılır: AB Yapay Zekâ Yasası
//   madde 50'nin istediği makinece okunabilir işaret. Her dışa aktarmada CreatorTool olarak Işıl yazılır.
// JPEG'de EXIF ve XMP APP1 bölümleri, PNG'de XMP iTXt parçası eklenir; WebP'ye dokunulmaz.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: türsüz paket
import piexif from 'piexifjs'
import type { EditDoc } from '@shared/schema'

const IPTC_COMPOSITE_AI = 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia'

/** Belgede üretken yapay zekâyla yapılmış bir adım var mı? (yeni adımlar params.ai taşır; eskiler için tahmin) */
export function usedGenerativeAI(doc: EditDoc) {
  return doc.rasterOps.some((op) => {
    const p = op.params as Record<string, unknown>
    if (p.ai === true) return true
    if (p.ai === false) return false
    return (op.type === 'gen' && (!!p.prompt || p.method === 'flux' || p.tool === 'ageface')) || (op.type === 'style' && !!p.style)
  })
}

const bin = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return s }
const unbin = (s: string) => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u }

function xmpPacket(ai: boolean, version: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmp:CreatorTool="${esc('Işıl ' + version)}"${ai ? ` Iptc4xmpExt:DigitalSourceType="${IPTC_COMPOSITE_AI}"` : ''}/>
</rdf:RDF></x:xmpmeta>
<?xpacket end="w"?>`
}

/** Kaynak JPEG'in EXIF'ini güvenli hale getir (GPS yok, yön 1, küçük resim yok). Kaynak JPEG değilse null. */
function cleanExif(source: Uint8Array, version: string): string | null {
  if (source[0] !== 0xff || source[1] !== 0xd8) return null
  try {
    const ex = piexif.load(bin(source))
    ex.GPS = {}
    ex['1st'] = {}
    ex.thumbnail = null
    if (ex['0th']) {
      ex['0th'][piexif.ImageIFD.Orientation] = 1
      ex['0th'][piexif.ImageIFD.Software] = 'Isil ' + version // EXIF metni ASCII
      delete ex['0th'][piexif.ImageIFD.GPSTag]
    }
    if (ex.Exif) {
      // boyut alanları dışa aktarılan görüntüye uymaz; yanlış bilgi yerine kaldır
      delete ex.Exif[piexif.ExifIFD.PixelXDimension]
      delete ex.Exif[piexif.ExifIFD.PixelYDimension]
      delete ex.Exif[piexif.ExifIFD.MakerNote] // üreticiye özel ve bazen konum içerir
    }
    return piexif.dump(ex)
  } catch {
    return null
  }
}

function app1(payload: Uint8Array) {
  const n = payload.length + 2
  const seg = new Uint8Array(4 + payload.length)
  seg.set([0xff, 0xe1, n >> 8, n & 255])
  seg.set(payload, 4)
  return seg
}

/**
 * Kaynak JPEG'in ICC renk profili (APP2 "ICC_PROFILE" bölümleri, sırasıyla). sRGB ise null: o zaman profil
 * yazmaya gerek yok. Geniş renk aralıklı (Display P3, Adobe RGB) profiller dışa aktarmaya aynen taşınır.
 */
export function wideIcc(source: Uint8Array | null | undefined): Uint8Array[] | null {
  if (!source || source[0] !== 0xff || source[1] !== 0xd8) return null
  const segs: Uint8Array[] = []
  let i = 2
  while (i + 4 < source.length && source[i] === 0xff) {
    const m = source[i + 1]
    if (m === 0xda || m === 0xd9) break
    const len = (source[i + 2] << 8) | source[i + 3]
    if (m === 0xe2 && String.fromCharCode(...source.subarray(i + 4, i + 15)) === 'ICC_PROFILE') segs.push(source.subarray(i, i + 2 + len))
    i += 2 + len
  }
  if (!segs.length) return null
  // profil açıklamasında (desc) sRGB geçiyorsa standart profil sayılır
  const head = Array.from(segs[0].subarray(0, Math.min(segs[0].length, 4096)), (c) => (c ? String.fromCharCode(c) : '')).join('')
  if (/sRGB/i.test(head) && !/P3|Adobe|ProPhoto|2020/i.test(head)) return null
  return segs
}

/** SOI'siz JPEG gövdesinden APP2 ICC bölümlerini çıkar (parçalar halinde döner). */
function withoutIcc(body: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = []
  let i = 0, start = 0
  while (i + 4 < body.length && body[i] === 0xff) {
    const m = body[i + 1]
    if (m === 0xda) break
    const len = (body[i + 2] << 8) | body[i + 3]
    if (m === 0xe2 && String.fromCharCode(...body.subarray(i + 4, i + 15)) === 'ICC_PROFILE') {
      out.push(body.subarray(start, i))
      start = i + 2 + len
    }
    i += 2 + len
  }
  out.push(body.subarray(start))
  return out
}

function jpegWith(out: Uint8Array, exif: string | null, xmp: string, icc: Uint8Array[] | null = null) {
  const parts: Uint8Array[] = [out.subarray(0, 2)]
  // piexif.dump "Exif\0\0" ile başlayan TIFF verisini verir
  if (exif) parts.push(app1(unbin(exif)))
  parts.push(app1(new Uint8Array([...new TextEncoder().encode('http://ns.adobe.com/xap/1.0/\0'), ...new TextEncoder().encode(xmp)])))
  if (icc) {
    parts.push(...icc)
    // tarayıcının kodlayıcısı kendi sRGB profilini yazar; iki profil çakışmasın diye onu çıkar
    parts.push(...withoutIcc(out.subarray(2)))
  } else parts.push(out.subarray(2))
  const total = parts.reduce((a, p) => a + p.length, 0)
  const r = new Uint8Array(total)
  let o = 0
  for (const p of parts) { r.set(p, o); o += p.length }
  return r
}

let crcTable: Uint32Array | null = null
function crc32(u: Uint8Array) {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0 }
  }
  let c = 0xffffffff
  for (let i = 0; i < u.length; i++) c = crcTable[(c ^ u[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngWith(out: Uint8Array, xmp: string) {
  // iTXt: anahtar "XML:com.adobe.xmp", sıkıştırmasız
  const key = new TextEncoder().encode('XML:com.adobe.xmp')
  const text = new TextEncoder().encode(xmp)
  const data = new Uint8Array(key.length + 5 + text.length)
  data.set(key, 0)
  data.set([0, 0, 0, 0, 0], key.length)
  data.set(text, key.length + 5)
  const type = new TextEncoder().encode('iTXt')
  const chunk = new Uint8Array(12 + data.length)
  const dv = new DataView(chunk.buffer)
  dv.setUint32(0, data.length)
  chunk.set(type, 4)
  chunk.set(data, 8)
  dv.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))
  // IHDR'den hemen sonra (8 imza + 25 IHDR)
  const at = 33
  const r = new Uint8Array(out.length + chunk.length)
  r.set(out.subarray(0, at), 0)
  r.set(chunk, at)
  r.set(out.subarray(at), at + chunk.length)
  return r
}

/** Dışa aktarılan dosyaya meta veriyi ekle. */
export function withMetadata(out: Uint8Array, opts: { source?: Uint8Array | null; keepExif: boolean; ai: boolean; version: string; icc?: Uint8Array[] | null }): Uint8Array {
  const xmp = xmpPacket(opts.ai, opts.version)
  if (out[0] === 0xff && out[1] === 0xd8) {
    const exif = opts.keepExif && opts.source ? cleanExif(opts.source, opts.version) : null
    return jpegWith(out, exif, xmp, opts.icc ?? null)
  }
  if (out[0] === 0x89 && out[1] === 0x50) return pngWith(out, xmp)
  return out
}
