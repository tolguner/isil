// Şablonlar: gönderi, hikâye ve afiş yerleşimleri. Bir şablon tuval oranını, zemini, fotoğrafın kutusunu ve
// düzenlenebilir metin/şekil katmanlarını birlikte kurar; hepsi sonra kendi araçlarıyla değiştirilebilir.
import { useMemo, useState, type CSSProperties } from 'react'
import { LayoutTemplate } from 'lucide-react'
import type { EditDoc, Fill, Layer } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Tabs } from '@/components/ui'
import { session } from '@/engine/session'
import { layerSize, type ShapeProps, type TextProps } from '@/engine/layers'
import { ratioValue } from '@/engine/renderer'
import type { ToolDef } from './types'

type Cat = 'post' | 'story' | 'poster'
interface TplText {
  text: [string, string]; x?: number; y: number; size: number; font: string; weight?: number; color: string
  italic?: boolean; spacing?: number; stroke?: TextProps['stroke']; shadow?: TextProps['shadow']; bg?: TextProps['bg']; gradient?: [string, string]
}
interface TplShape { x: number; y: number; w: number; h: number; fill: string; opacity?: number; kind?: ShapeProps['kind'] }
export interface Template {
  id: string; cat: Cat; name: [string, string]
  ratio: string
  fill: Fill
  /** fotoğraf kutusu [x, y, w, h], tuvale oranla */
  box: [number, number, number, number]
  shapes?: TplShape[]
  texts: TplText[]
}

const year = String(new Date().getFullYear())

export const TEMPLATES: Template[] = [
  // ---- gönderi ----
  {
    id: 'polaroid', cat: 'post', name: ['Anlık', 'Instant'], ratio: '4:5', fill: { type: 'color', color: '#f5f1ea' }, box: [0.07, 0.055, 0.86, 0.74],
    texts: [{ text: ['bugün', 'today'], y: 0.89, size: 0.06, font: 'Caveat', color: '#33302c' }]
  },
  {
    id: 'gallery', cat: 'post', name: ['Galeri', 'Gallery'], ratio: '4:5', fill: { type: 'color', color: '#121214' }, box: [0.09, 0.08, 0.82, 0.68],
    texts: [
      { text: ['Anı', 'Memory'], y: 0.84, size: 0.065, font: 'Playfair Display', color: '#f3eee6', italic: true },
      { text: [year, year], y: 0.92, size: 0.022, font: 'Montserrat', weight: 800, color: '#a59f95', spacing: 0.5 }
    ]
  },
  {
    id: 'minimal', cat: 'post', name: ['Sade çerçeve', 'Clean frame'], ratio: '1:1', fill: { type: 'color', color: '#ffffff' }, box: [0.06, 0.06, 0.88, 0.82],
    texts: [{ text: ['hafta sonu notları', 'weekend notes'], y: 0.94, size: 0.03, font: 'Montserrat', weight: 400, color: '#55524d', spacing: 0.15 }]
  },
  {
    id: 'cover', cat: 'post', name: ['Dergi kapağı', 'Magazine cover'], ratio: '4:5', fill: { type: 'color', color: '#000000' }, box: [0, 0, 1, 1],
    texts: [
      { text: ['IŞIL', 'IŞIL'], y: 0.1, size: 0.15, font: 'Abril Fatface', color: '#ffffff', shadow: { color: 'rgba(0,0,0,.35)', blur: 0.15, x: 0, y: 0.02 } },
      { text: ['YENİ SEZON\nSTİL REHBERİ', 'NEW SEASON\nSTYLE GUIDE'], x: 0.22, y: 0.86, size: 0.035, font: 'Montserrat', weight: 800, color: '#ffffff', spacing: 0.08, shadow: { color: 'rgba(0,0,0,.4)', blur: 0.3, x: 0, y: 0 } }
    ]
  },
  // ---- hikâye ----
  {
    id: 'story-blur', cat: 'story', name: ['Bulanık zemin', 'Blurred'], ratio: '9:16', fill: { type: 'blur', amount: 60 }, box: [0, 0.2, 1, 0.6],
    texts: [
      { text: ['bugün', 'today'], y: 0.1, size: 0.05, font: 'Pacifico', color: '#ffffff', shadow: { color: 'rgba(0,0,0,.3)', blur: 0.2, x: 0, y: 0.02 } },
      { text: ['@kullaniciadi', '@username'], y: 0.9, size: 0.02, font: 'Montserrat', weight: 800, color: '#ffffff', spacing: 0.12 }
    ]
  },
  {
    id: 'story-pastel', cat: 'story', name: ['Pastel', 'Pastel'], ratio: '9:16', fill: { type: 'gradient', from: '#ffd9e2', to: '#c9def7', angle: 160 }, box: [0.08, 0.14, 0.84, 0.58],
    texts: [
      { text: ['tatlı bir gün', 'a sweet day'], y: 0.8, size: 0.055, font: 'Great Vibes', color: '#5b4253' },
      { text: ['kaydır ve gör', 'swipe to see'], y: 0.88, size: 0.018, font: 'Montserrat', weight: 800, color: '#7d6a76', spacing: 0.2 }
    ]
  },
  {
    id: 'story-night', cat: 'story', name: ['Gece', 'Night'], ratio: '9:16', fill: { type: 'color', color: '#0b0b14' }, box: [0.06, 0.2, 0.88, 0.56],
    texts: [
      { text: ['GECE MODU', 'NIGHT MODE'], y: 0.11, size: 0.045, font: 'Righteous', color: '#ffffff', shadow: { color: '#ff3fbf', blur: 0.5, x: 0, y: 0 } },
      { text: ['şehir ışıkları', 'city lights'], y: 0.84, size: 0.03, font: 'Caveat', color: '#c9c3ff' }
    ]
  },
  {
    id: 'story-full', cat: 'story', name: ['Tam ekran', 'Full screen'], ratio: '9:16', fill: { type: 'blur', amount: 60 }, box: [0, 0, 1, 1],
    texts: [{ text: ['yeni sezon', 'new season'], y: 0.86, size: 0.03, font: 'Montserrat', weight: 800, color: '#ffffff', spacing: 0.1, bg: { color: '#000000', opacity: 0.75, radius: 0.15 } }]
  },
  // ---- afiş ----
  {
    id: 'event', cat: 'poster', name: ['Etkinlik', 'Event'], ratio: '2:3', fill: { type: 'color', color: '#ffd166' }, box: [0.08, 0.2, 0.84, 0.52],
    texts: [
      { text: ['KONSER', 'CONCERT'], y: 0.1, size: 0.1, font: 'Bebas Neue', color: '#1a1a1a', spacing: 0.06 },
      { text: ['12 KASIM · 21:00', 'NOV 12 · 9 PM'], y: 0.8, size: 0.035, font: 'Montserrat', weight: 800, color: '#1a1a1a', spacing: 0.06 },
      { text: ['Kadıköy Sahnesi', 'Main Stage'], y: 0.87, size: 0.028, font: 'Montserrat', weight: 400, color: '#3b3324' }
    ]
  },
  {
    id: 'film', cat: 'poster', name: ['Film afişi', 'Movie poster'], ratio: '2:3', fill: { type: 'color', color: '#000000' }, box: [0, 0, 1, 1],
    shapes: [{ x: 0.5, y: 0.87, w: 1, h: 0.42, fill: '#000000', opacity: 0.55 }],
    texts: [
      { text: ['Son Yaz', 'Last Summer'], y: 0.81, size: 0.07, font: 'Playfair Display', color: '#ffffff' },
      { text: ['YAKINDA', 'COMING SOON'], y: 0.9, size: 0.022, font: 'Montserrat', weight: 800, color: '#d9d4cc', spacing: 0.4 }
    ]
  },
  {
    id: 'invite', cat: 'poster', name: ['Davetiye', 'Invitation'], ratio: '3:4', fill: { type: 'color', color: '#f6efe6' }, box: [0.15, 0.1, 0.7, 0.52],
    texts: [
      { text: ['Davetlisiniz', 'You are invited'], y: 0.71, size: 0.065, font: 'Great Vibes', color: '#8a5a44' },
      { text: ['12 EKİM · 19:00', 'OCT 12 · 7 PM'], y: 0.81, size: 0.028, font: 'Montserrat', weight: 800, color: '#5c4a3f', spacing: 0.12 },
      { text: ['Bahçe Salonu', 'Garden Hall'], y: 0.87, size: 0.024, font: 'Montserrat', weight: 400, color: '#7a6658' }
    ]
  },
  {
    id: 'sale', cat: 'poster', name: ['İndirim', 'Sale'], ratio: '1:1', fill: { type: 'gradient', from: '#ff5f6d', to: '#ffc371', angle: 135 }, box: [0.08, 0.07, 0.84, 0.6],
    texts: [
      { text: ['%50 İNDİRİM', '50% OFF'], y: 0.8, size: 0.1, font: 'Bebas Neue', color: '#ffffff', spacing: 0.04, shadow: { color: 'rgba(0,0,0,.25)', blur: 0, x: 0.03, y: 0.04 } },
      { text: ['yalnız bu hafta sonu', 'this weekend only'], y: 0.91, size: 0.035, font: 'Caveat', color: '#ffffff' }
    ]
  }
]

/** Şablonun kullandığı yazı tiplerini yükle (ölçüm doğru olsun). */
async function loadFonts(t: Template) {
  await Promise.all(t.texts.map((x) => document.fonts.load(`${x.italic ? 'italic ' : ''}${x.weight ?? 400} 40px "${x.font}"`, x.text[0] + x.text[1]).catch(() => null)))
}

function textLayer(t: Template, x: TplText, en: boolean, W: number, H: number): Layer {
  const props: TextProps & { template: string } = {
    template: t.id, text: en ? x.text[1] : x.text[0], font: x.font, weight: x.weight ?? 400, size: x.size,
    color: x.color, opacity: 1, align: 'center', stroke: x.stroke ?? null, shadow: x.shadow ?? null, bg: x.bg ?? null,
    italic: x.italic, spacing: x.spacing ?? 0, lineHeight: 1.25, gradient: x.gradient ?? null
  }
  const l: Layer = { id: crypto.randomUUID(), type: 'text', x: x.x ?? 0.5, y: x.y, scale: 1, rotation: 0, opacity: 1, props: props as unknown as Record<string, unknown> }
  // uzun çeviriler tuvalden taşmasın
  const { w } = layerSize(l, W, H)
  if (w > W * 0.9) l.scale = (W * 0.9) / w
  if (x.x != null && x.x < 0.5) l.x = Math.max(x.x, (w * l.scale) / 2 / W + 0.06)
  return l
}

/** Şablonu belgeye uygula: kırpma kutunun oranına ortalanır, önceki şablon katmanları değiştirilir. */
export function applyTemplate(d: EditDoc, t: Template, srcW: number, srcH: number, en = false) {
  const r = ratioValue(t.ratio) ?? 1
  const [, , bw, bh] = t.box
  const a = (bw * r) / bh // kutunun en/boy oranı
  const rot = d.crop.quarter % 2 === 1
  const rw = rot ? srcH : srcW, rh = rot ? srcW : srcH
  const c = { ...d.crop, ratio: null }
  if (rw / rh > a) { c.h = 1; c.w = (a * rh) / rw; c.y = 0; c.x = (1 - c.w) / 2 } else { c.w = 1; c.h = rw / (a * rh); c.x = 0; c.y = (1 - c.h) / 2 }
  d.crop = c
  d.background = { ...d.background, ratio: t.ratio, fill: t.fill, box: [...t.box] }
  d.layers = d.layers.filter((l) => !(l.props as Record<string, unknown>).template)
  const W = 1000, H = W / r
  for (const s of t.shapes ?? []) {
    const m = Math.min(W, H)
    const props: ShapeProps & { template: string } = { template: t.id, kind: s.kind ?? 'rect', fill: s.fill, stroke: null, strokeW: 0, w: (s.w * W) / m, h: (s.h * H) / m }
    d.layers.push({ id: crypto.randomUUID(), type: 'shape', x: s.x, y: s.y, scale: 1, rotation: 0, opacity: s.opacity ?? 1, props: props as unknown as Record<string, unknown> })
  }
  for (const x of t.texts) d.layers.push(textLayer(t, x, en, W, H))
}

export async function applyTemplateById(id: string) {
  const t = TEMPLATES.find((x) => x.id === id)
  const st = useEditor.getState()
  if (!t) return
  // ana sayfadan gelindiyse fotoğrafın yüklenmesini bekle
  for (let i = 0; i < 100 && !session.W; i++) await new Promise((r) => setTimeout(r, 100))
  if (!session.W) return
  await loadFonts(t)
  st.update((d) => applyTemplate(d, t, session.W, session.H, st.settings.language === 'en'))
}

function fillCss(f: Fill, photo?: string | null): CSSProperties {
  if (f.type === 'color') return { background: f.color }
  if (f.type === 'gradient') return { background: `linear-gradient(${f.angle}deg, ${f.from}, ${f.to})` }
  if (f.type === 'blur') return photo ? { backgroundImage: `url("${photo}")`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(6px) brightness(.85)', transform: 'scale(1.15)' } : { background: 'linear-gradient(160deg,#6f6a8f,#2c2a3a)' }
  return { background: '#222' }
}

/** Şablon önizlemesi (CSS ile): zemin, fotoğraf kutusu ve metinler gerçek oranlarında. */
export function TemplateCard({ t, photo, en }: { t: Template; photo?: string | null; en?: boolean }) {
  const r = ratioValue(t.ratio) ?? 1
  const [bx, by, bw, bh] = t.box
  return (
    <span className="tpl-card" style={{ aspectRatio: String(r) }}>
      <span className="tpl-bg" style={fillCss(t.fill, photo)} />
      <span className="tpl-photo" style={{ left: `${bx * 100}%`, top: `${by * 100}%`, width: `${bw * 100}%`, height: `${bh * 100}%`, ...(photo ? { backgroundImage: `url("${photo}")` } : {}) }} />
      {(t.shapes ?? []).map((s, i) => (
        <span key={i} className="tpl-shape" style={{ left: `${(s.x - s.w / 2) * 100}%`, top: `${(s.y - s.h / 2) * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%`, background: s.fill, opacity: s.opacity ?? 1 }} />
      ))}
      {t.texts.map((x, i) => (
        <span key={i} className="tpl-text" style={{
          left: `${(x.x ?? 0.5) * 100}%`, top: `${x.y * 100}%`, fontFamily: `"${x.font}"`, fontWeight: x.weight ?? 400, fontStyle: x.italic ? 'italic' : undefined,
          fontSize: `${x.size * 100}cqh`, color: x.color, letterSpacing: `${(x.spacing ?? 0)}em`,
          textShadow: x.shadow ? `${x.shadow.x}em ${x.shadow.y}em ${x.shadow.blur}em ${x.shadow.color}` : undefined,
          background: x.bg ? x.bg.color : undefined, padding: x.bg ? '0.2em 0.35em' : undefined, borderRadius: x.bg ? `${x.bg.radius}em` : undefined
        }}>{en ? x.text[1] : x.text[0]}</span>
      ))}
    </span>
  )
}

export const TEMPLATE_CATS: { id: Cat; label: [string, string] }[] = [
  { id: 'post', label: ['Gönderi', 'Post'] }, { id: 'story', label: ['Hikâye', 'Story'] }, { id: 'poster', label: ['Afiş', 'Poster'] }
]

function TemplatesPanel() {
  const tr = useT()
  const en = useEditor((s) => s.settings.language === 'en')
  const rev = useEditor((s) => s.revision)
  // önizlemede kullanıcının kendi fotoğrafı (küçük kopya)
  const photo = useMemo(() => {
    const b = session.preview
    if (!b) return null
    const k = 360 / Math.max(b.width, b.height)
    const c = document.createElement('canvas')
    c.width = Math.round(b.width * k)
    c.height = Math.round(b.height * k)
    c.getContext('2d')!.drawImage(b, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', 0.8)
  }, [rev])
  const cur = useEditor((s) => (s.doc.layers.find((l) => (l.props as Record<string, unknown>).template)?.props as Record<string, unknown> | undefined)?.template as string | undefined)
  const [cat, setCat] = useState<Cat>(() => TEMPLATES.find((t) => t.id === cur)?.cat ?? 'post')
  return (
    <>
      <p className="note">{tr('Gönderi, hikâye ve afiş yerleşimleri. Metinlere tuvalde dokunup değiştirebilir, zemini Arka plan sekmesinden düzenleyebilirsin.', 'Post, story and poster layouts. Tap a text on the canvas to change it; edit the backdrop in the Backdrop tab.')}</p>
      <Tabs items={TEMPLATE_CATS.map((c) => ({ id: c.id, label: tr(c.label[0], c.label[1]) }))} value={cat} onChange={setCat} />
      <div className="tpl-grid">
        {TEMPLATES.filter((t) => t.cat === cat).map((t) => (
          <button key={t.id} className={'tpl' + (cur === t.id ? ' on' : '')} aria-pressed={cur === t.id} onClick={() => void applyTemplateById(t.id)}>
            <TemplateCard t={t} photo={photo} en={en} />
            <span className="tpl-name">{tr(t.name[0], t.name[1])}</span>
          </button>
        ))}
      </div>
    </>
  )
}

export const TEMPLATE_TOOLS: ToolDef[] = [{ id: 'templates', label: ['Şablonlar', 'Templates'], icon: LayoutTemplate, Panel: TemplatesPanel, applied: (d) => d.layers.some((l) => !!(l.props as Record<string, unknown>).template) }]
