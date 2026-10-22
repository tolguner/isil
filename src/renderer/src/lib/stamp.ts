// Görünür damga: Fransa (2017) ve Norveç (2022) reklam ve tanıtım fotoğraflarında rötuşun belirtilmesini zorunlu
// tutuyor; Işıl isteyen kullanıcıya hazır ibareyi sağ alt köşeye koyar. YZ ibaresi üretken düzenlemeler için.
import type { Settings } from '@shared/schema'

export const STAMPS: Record<Exclude<NonNullable<Settings['exportStamp']>, 'none'>, { text: string; label: [string, string] }> = {
  tr: { text: 'Rötuşlu fotoğraf', label: ['Türkçe: Rötuşlu fotoğraf', 'Turkish: Rötuşlu fotoğraf'] },
  fr: { text: 'Photographie retouchée', label: ['Fransızca (Fransa reklam kuralı)', 'French (France ad rule)'] },
  no: { text: 'Retusjert person', label: ['Norveççe (Norveç reklam kuralı)', 'Norwegian (Norway ad rule)'] },
  en: { text: 'Retouched photo', label: ['İngilizce: Retouched photo', 'English: Retouched photo'] },
  ai: { text: 'YZ ile düzenlendi · AI-edited', label: ['YZ ile düzenlendi', 'AI-edited'] }
}

/** Sağ alt köşeye yarı saydam zeminli küçük etiket. */
export function drawStamp(ctx: CanvasRenderingContext2D, W: number, H: number, kind: keyof typeof STAMPS) {
  const t = STAMPS[kind]?.text
  if (!t) return
  const fs = Math.max(12, Math.round(Math.min(W, H) * 0.022))
  ctx.save()
  ctx.font = `600 ${fs}px Inter, "Segoe UI", sans-serif`
  const pad = fs * 0.5, m = fs * 0.8
  const w = ctx.measureText(t).width + pad * 2, h = fs + pad * 1.4
  const x = W - w - m, y = H - h - m
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, h * 0.3)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.fillText(t, x + pad, y + h / 2)
  ctx.restore()
}
