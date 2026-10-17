// Dövme: bir çizimi ya da görseli mürekkebe çevirir (beyaz/açık zemin saydam, koyu çizgi mürekkep rengi).
// Katmanda "çarp" (multiply) karıştırmayla ve hafif yumuşatmayla çizilir: cildin dokusu ve ışığı içinden görünür.

/** Kendi çizimlerimiz (SVG, 200×200): basit çizgi dövmeler. */
export const TATTOO_DESIGNS: { id: string; label: [string, string]; svg: string }[] = [
  { id: 'heart', label: ['Kalp', 'Heart'], svg: '<path d="M100 170 C40 125 20 95 20 65 C20 40 40 25 62 25 C80 25 92 36 100 50 C108 36 120 25 138 25 C160 25 180 40 180 65 C180 95 160 125 100 170Z" fill="none" stroke="#000" stroke-width="7" stroke-linejoin="round"/>' },
  { id: 'star', label: ['Yıldız', 'Star'], svg: '<path d="M100 18 L121 76 L182 78 L134 116 L151 176 L100 141 L49 176 L66 116 L18 78 L79 76Z" fill="none" stroke="#000" stroke-width="7" stroke-linejoin="round"/>' },
  { id: 'moon', label: ['Ay', 'Moon'], svg: '<path d="M128 22 A80 80 0 1 0 172 150 A64 64 0 1 1 128 22Z" fill="none" stroke="#000" stroke-width="7" stroke-linejoin="round"/><circle cx="150" cy="60" r="5"/><circle cx="168" cy="95" r="3.5"/>' },
  { id: 'wave', label: ['Dalga', 'Wave'], svg: '<path d="M15 120 C45 60 75 60 95 100 C110 130 140 135 160 105 C172 88 185 92 188 104" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round"/><path d="M15 150 L188 150" stroke="#000" stroke-width="5" stroke-linecap="round"/>' },
  { id: 'arrow', label: ['Ok', 'Arrow'], svg: '<path d="M20 100 L170 100" stroke="#000" stroke-width="6" stroke-linecap="round"/><path d="M150 78 L178 100 L150 122" fill="none" stroke="#000" stroke-width="6" stroke-linejoin="round"/><path d="M20 100 L42 80 M20 100 L42 120 M36 100 L58 80 M36 100 L58 120" stroke="#000" stroke-width="5" stroke-linecap="round"/>' },
  { id: 'flower', label: ['Çiçek', 'Flower'], svg: '<g fill="none" stroke="#000" stroke-width="6"><circle cx="100" cy="80" r="14"/><ellipse cx="100" cy="46" rx="16" ry="22"/><ellipse cx="100" cy="114" rx="16" ry="22"/><ellipse cx="66" cy="80" rx="22" ry="16"/><ellipse cx="134" cy="80" rx="22" ry="16"/><path d="M100 136 C98 160 92 175 80 188 M98 160 C112 152 124 154 132 146"/></g>' }
]

export function designDataUrl(svg: string) {
  return 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="400" height="400">${svg}</svg>`)
}

/** Görseli mürekkep PNG'sine çevir: koyuluk → saydamlık, renk sabit mürekkep. */
export async function toInk(src: string, ink: string, max = 800): Promise<string> {
  const im = new Image()
  im.src = src
  await im.decode()
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight))
  const W = Math.round(im.naturalWidth * k), H = Math.round(im.naturalHeight * k)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(im, 0, 0, W, H)
  const d = ctx.getImageData(0, 0, W, H)
  const n = parseInt(ink.replace('#', ''), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  for (let i = 0; i < W * H; i++) {
    const L = 0.299 * d.data[i * 4] + 0.587 * d.data[i * 4 + 1] + 0.114 * d.data[i * 4 + 2]
    const a = Math.max(0, Math.min(255, (235 - L) * 1.4))
    d.data[i * 4] = r; d.data[i * 4 + 1] = g; d.data[i * 4 + 2] = b; d.data[i * 4 + 3] = a
  }
  ctx.putImageData(d, 0, 0)
  return c.toDataURL('image/png')
}
