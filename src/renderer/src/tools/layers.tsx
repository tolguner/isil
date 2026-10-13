import { useEffect, useRef, useState } from 'react'
import { Type, Sticker, Shapes, Brush, Trash2, Copy, RotateCw, Plus, ImagePlus, ArrowUp, ArrowDown, AlignLeft, AlignCenter, AlignRight } from 'lucide-react'
import '@fontsource/playfair-display/index.css'
import '@fontsource/pacifico/index.css'
import '@fontsource/bebas-neue/index.css'
import '@fontsource/caveat/index.css'
import '@fontsource/montserrat/index.css'
import '@fontsource/montserrat/800.css'
import '@fontsource/oswald/index.css'
import '@fontsource/lobster/index.css'
import '@fontsource/dancing-script/index.css'
import '@fontsource/permanent-marker/index.css'
import '@fontsource/anton/index.css'
import '@fontsource/righteous/index.css'
import '@fontsource/abril-fatface/index.css'
import '@fontsource/kanit/index.css'
import '@fontsource/kanit/700.css'
import '@fontsource/space-grotesk/index.css'
import '@fontsource/poppins/index.css'
import '@fontsource/poppins/700.css'
import '@fontsource/great-vibes/index.css'
import type { Layer } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { ColorRow, Slider, Tabs, Segmented, Switch } from '@/components/ui'
import { layerSize, type DrawingProps, type ShapeProps, type StickerProps, type Stroke, type TextProps } from '@/engine/layers'
import { platform } from '@/lib/platform'
import type { ToolDef, View } from './types'

// ---------- seçim ----------
const sel = { id: null as string | null }
const SL = new Set<() => void>()
const selEmit = () => SL.forEach((f) => f())
function useSel() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    SL.add(h)
    return () => void SL.delete(h)
  }, [])
  return sel.id
}
export function selectLayer(id: string | null) {
  sel.id = id
  selEmit()
}
function useLayer<T>(): [Layer | undefined, T | undefined] {
  const id = useSel()
  const l = useEditor((s) => s.doc.layers.find((x) => x.id === id))
  return [l, l?.props as T | undefined]
}
function updLayer(id: string, fn: (l: Layer) => void) {
  useEditor.getState().update((d) => {
    const l = d.layers.find((x) => x.id === id)
    if (l) fn(l)
  })
}
function addLayer(l: Omit<Layer, 'id'>) {
  const id = crypto.randomUUID()
  useEditor.getState().update((d) => void d.layers.push({ ...l, id }))
  selectLayer(id)
  return id
}

// ---------- tuval üstü katman düzenleme ----------
function LayerOverlay({ view, types }: { view: View; types: Layer['type'][] }) {
  const layers = useEditor((s) => s.doc.layers)
  const id = useSel()
  const drag = useRef<{ mode: 'move' | 'rot'; id: string; sx: number; sy: number; l: Layer } | null>(null)
  const W = view.outW, H = view.outH
  const editable = layers.filter((l) => types.includes(l.type) && l.type !== 'drawing')
  return (
    <div
      style={{ position: 'absolute', inset: 0 }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        // en üstteki katmana isabet
        const n = view.toNorm(e.clientX, e.clientY)
        const hit = [...editable].reverse().find((l) => {
          const { w, h } = layerSize(l, W, H)
          const dx = (n.x - l.x) * W, dy = (n.y - l.y) * H
          const a = (-l.rotation * Math.PI) / 180
          const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a)
          return Math.abs(rx) <= (w * l.scale) / 2 && Math.abs(ry) <= (h * l.scale) / 2
        })
        if (!hit) {
          selectLayer(null)
          return
        }
        e.stopPropagation()
        selectLayer(hit.id)
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { mode: 'move', id: hit.id, sx: n.x, sy: n.y, l: structuredClone(hit) }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const n = view.toNorm(e.clientX, e.clientY)
        if (d.mode === 'move') updLayer(d.id, (l) => { l.x = d.l.x + n.x - d.sx; l.y = d.l.y + n.y - d.sy })
        else {
          const cx = d.l.x * W, cy = d.l.y * H
          const a0 = Math.atan2(d.sy * H - cy, d.sx * W - cx), a1 = Math.atan2(n.y * H - cy, n.x * W - cx)
          const r0 = Math.hypot(d.sx * W - cx, d.sy * H - cy), r1 = Math.hypot(n.x * W - cx, n.y * H - cy)
          let rot = d.l.rotation + ((a1 - a0) * 180) / Math.PI
          if (Math.abs(rot % 90) < 3) rot = Math.round(rot / 90) * 90
          updLayer(d.id, (l) => { l.rotation = rot; l.scale = Math.max(0.05, d.l.scale * (r1 / Math.max(r0, 1))) })
        }
      }}
      onPointerUp={() => (drag.current = null)}
    >
      {editable.filter((l) => l.id === id).map((l) => {
        const { w, h } = layerSize(l, W, H)
        const c = view.toScreen(l.x, l.y)
        const sw = w * l.scale * view.scale, sh = h * l.scale * view.scale
        return (
          <div key={l.id} className="layer-sel" style={{ left: c.x - sw / 2, top: c.y - sh / 2, width: sw, height: sh, transform: `rotate(${l.rotation}deg)` }}>
            <button className="h del" title="Sil" onPointerDown={(e) => e.stopPropagation()} onClick={() => { useEditor.getState().update((d) => void (d.layers = d.layers.filter((x) => x.id !== l.id))); selectLayer(null) }}><Trash2 size={12} /></button>
            <button className="h dup" title="Çoğalt" onPointerDown={(e) => e.stopPropagation()} onClick={() => addLayer({ ...structuredClone(l), x: l.x + 0.03, y: l.y + 0.03 })}><Copy size={12} /></button>
            <button className="h rot" title="Döndür / ölçekle" onPointerDown={(e) => {
              e.stopPropagation()
              const n = view.toNorm(e.clientX, e.clientY)
              drag.current = { mode: 'rot', id: l.id, sx: n.x, sy: n.y, l: structuredClone(l) }
              ;((e.currentTarget.parentElement!.parentElement) as HTMLElement).setPointerCapture(e.pointerId)
            }}><RotateCw size={12} /></button>
          </div>
        )
      })}
    </div>
  )
}

function LayerCommon({ l }: { l: Layer }) {
  const tr = useT()
  return (
    <>
      <Slider label={tr('Opaklık', 'Opacity')} value={Math.round(l.opacity * 100)} onChange={(v) => updLayer(l.id, (x) => void (x.opacity = v / 100))} />
      <div className="row">
        <button className="btn sm" onClick={() => useEditor.getState().update((d) => { const i = d.layers.findIndex((x) => x.id === l.id); if (i < d.layers.length - 1) [d.layers[i], d.layers[i + 1]] = [d.layers[i + 1], d.layers[i]] })} title={tr('Öne getir', 'Bring forward')}><ArrowUp size={14} /></button>
        <button className="btn sm" onClick={() => useEditor.getState().update((d) => { const i = d.layers.findIndex((x) => x.id === l.id); if (i > 0) [d.layers[i], d.layers[i - 1]] = [d.layers[i - 1], d.layers[i]] })} title={tr('Geriye gönder', 'Send backward')}><ArrowDown size={14} /></button>
        <button className="btn sm danger" onClick={() => { useEditor.getState().update((d) => void (d.layers = d.layers.filter((x) => x.id !== l.id))); selectLayer(null) }}><Trash2 size={14} /> {tr('Sil', 'Delete')}</button>
      </div>
    </>
  )
}

// ---------- Metin ----------
export const FONTS: [string, string, number][] = [
  ['Inter', 'Inter', 700], ['Poppins', 'Poppins', 700], ['Montserrat', 'Montserrat', 800], ['Kanit', 'Kanit', 700], ['Space Grotesk', 'Space Grotesk', 400],
  ['Bebas Neue', 'Bebas Neue', 400], ['Anton', 'Anton', 400], ['Oswald', 'Oswald', 400], ['Righteous', 'Righteous', 400], ['Abril Fatface', 'Abril Fatface', 400],
  ['Playfair Display', 'Playfair Display', 400], ['Lobster', 'Lobster', 400], ['Pacifico', 'Pacifico', 400], ['Dancing Script', 'Dancing Script', 400],
  ['Great Vibes', 'Great Vibes', 400], ['Caveat', 'Caveat', 400], ['Permanent Marker', 'Permanent Marker', 400]
]

const TEXT_STYLES: { id: string; label: string; p: Partial<TextProps> }[] = [
  { id: 'plain', label: 'Aa', p: { color: '#ffffff', stroke: null, shadow: { color: 'rgba(0,0,0,.45)', blur: 0.12, x: 0, y: 0.03 }, bg: null, gradient: null } },
  { id: 'outline', label: 'Aa', p: { color: '#ffffff', stroke: { color: '#111111', width: 0.12 }, shadow: null, bg: null, gradient: null } },
  { id: 'label', label: 'Aa', p: { color: '#111111', stroke: null, shadow: null, bg: { color: '#ffffff', opacity: 1, radius: 0.25 }, gradient: null } },
  { id: 'neon', label: 'Aa', p: { color: '#ffffff', stroke: null, shadow: { color: '#ff3fbf', blur: 0.5, x: 0, y: 0 }, bg: null, gradient: null } },
  { id: 'sunset', label: 'Aa', p: { gradient: ['#ffd166', '#ff5f6d'], stroke: null, shadow: { color: 'rgba(0,0,0,.35)', blur: 0.1, x: 0, y: 0.03 }, bg: null } },
  { id: 'mint', label: 'Aa', p: { gradient: ['#c8ffe0', '#3fc1c9'], stroke: { color: '#0e3b43', width: 0.08 }, shadow: null, bg: null } },
  { id: 'black', label: 'Aa', p: { color: '#ffffff', stroke: null, shadow: null, bg: { color: '#000000', opacity: 0.75, radius: 0.15 }, gradient: null } },
  { id: 'pop', label: 'Aa', p: { color: '#ffd166', stroke: { color: '#1a1a1a', width: 0.16 }, shadow: { color: '#ff5a5f', blur: 0, x: 0.06, y: 0.06 }, bg: null, gradient: null } },
  { id: 'soft', label: 'Aa', p: { color: '#f7c4cf', stroke: null, shadow: { color: 'rgba(255,255,255,.9)', blur: 0.3, x: 0, y: 0 }, bg: null, gradient: null } }
]
const TEXT_TEMPLATES: { id: string; text: string; font: string; weight: number; style: string; size: number; italic?: boolean; spacing?: number }[] = [
  { id: 't1', text: 'iyi ki varsın', font: 'Great Vibes', weight: 400, style: 'plain', size: 0.09 },
  { id: 't2', text: 'HAFTA SONU', font: 'Bebas Neue', weight: 400, style: 'pop', size: 0.1, spacing: 0.06 },
  { id: 't3', text: 'günaydın ☀', font: 'Pacifico', weight: 400, style: 'sunset', size: 0.07 },
  { id: 't4', text: 'şu an', font: 'Caveat', weight: 400, style: 'label', size: 0.06 },
  { id: 't5', text: 'GECE MODU', font: 'Righteous', weight: 400, style: 'neon', size: 0.07 },
  { id: 't6', text: 'Anı', font: 'Playfair Display', weight: 400, style: 'plain', size: 0.1, italic: true },
  { id: 't7', text: 'yeni sezon', font: 'Montserrat', weight: 800, style: 'black', size: 0.05, spacing: 0.1 },
  { id: 't8', text: 'tatlı tatlı', font: 'Lobster', weight: 400, style: 'soft', size: 0.08 }
]

function defaultText(tpl?: (typeof TEXT_TEMPLATES)[number]): TextProps {
  const style = TEXT_STYLES.find((s) => s.id === (tpl?.style ?? 'plain'))!.p
  return {
    text: tpl?.text ?? 'Metin', font: tpl?.font ?? 'Inter', weight: tpl?.weight ?? 700, size: tpl?.size ?? 0.07,
    color: '#ffffff', opacity: 1, align: 'center', stroke: null, shadow: null, bg: null, italic: tpl?.italic, spacing: tpl?.spacing ?? 0, lineHeight: 1.2, gradient: null,
    ...style
  }
}

function TextPanel() {
  const tr = useT()
  const [l, p] = useLayer<TextProps>()
  const [tab, setTab] = useState<'tpl' | 'font' | 'style'>('tpl')
  const isText = l?.type === 'text'
  const set = (fn: (p: TextProps) => void) => l && updLayer(l.id, (x) => fn(x.props as unknown as TextProps))
  return (
    <>
      <button className="btn primary block" onClick={() => addLayer({ type: 'text', x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, props: defaultText() as unknown as Record<string, unknown> })}><Plus size={16} /> {tr('Metin ekle', 'Add text')}</button>
      {isText && p && (
        <label className="field">
          <span>{tr('Metin', 'Text')}</span>
          <textarea className="textarea" value={p.text} onChange={(e) => set((x) => void (x.text = e.target.value))} autoFocus />
        </label>
      )}
      <Tabs items={[{ id: 'tpl', label: tr('Şablonlar', 'Templates') }, { id: 'font', label: tr('Yazı tipi', 'Font') }, { id: 'style', label: tr('Stil', 'Style') }]} value={tab} onChange={setTab} />
      {tab === 'tpl' && (
        <div className="presets">
          {TEXT_TEMPLATES.map((t) => (
            <button key={t.id} className="preset" onClick={() => {
              const props = defaultText(t)
              if (isText && l) updLayer(l.id, (x) => void (x.props = { ...(x.props as object), ...props, text: (x.props as unknown as TextProps).text } as unknown as Record<string, unknown>))
              else addLayer({ type: 'text', x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, props: props as unknown as Record<string, unknown> })
            }}>
              <span className="pv" style={{ fontFamily: t.font, fontWeight: t.weight, fontSize: 14, color: '#fff', background: 'var(--c-surface-2)', fontStyle: t.italic ? 'italic' : undefined, textAlign: 'center', padding: 4 }}>{t.text}</span>
            </button>
          ))}
        </div>
      )}
      {tab === 'font' && (
        <div className="stack">
          {FONTS.map(([name, fam, w]) => (
            <button key={name} className={'btn' + (p?.font === fam ? ' primary' : '')} style={{ fontFamily: fam, fontWeight: w, justifyContent: 'flex-start', fontSize: 16 }} disabled={!isText} onClick={() => set((x) => { x.font = fam; x.weight = w })}>{name} — Işıl çğüş</button>
          ))}
        </div>
      )}
      {tab === 'style' && (isText && p ? (
        <>
          <div className="colors">
            {TEXT_STYLES.map((s) => (
              <button key={s.id} className="swatch" style={{ width: 40, height: 40, borderRadius: 8, background: s.p.bg ? s.p.bg.color : s.p.gradient ? `linear-gradient(${s.p.gradient[0]}, ${s.p.gradient[1]})` : '#333', color: s.p.color, fontWeight: 800, WebkitTextStroke: s.p.stroke ? `1px ${s.p.stroke.color}` : undefined, textShadow: s.p.shadow ? `0 0 6px ${s.p.shadow.color}` : undefined }} onClick={() => set((x) => Object.assign(x, s.p))}>{s.label}</button>
            ))}
          </div>
          <div className="group-label">{tr('Renk', 'Color')}</div>
          <ColorRow value={p.color} onChange={(c) => set((x) => { x.color = c; x.gradient = null })} />
          <Slider label={tr('Boyut', 'Size')} min={2} max={30} value={Math.round(p.size * 100)} onChange={(v) => set((x) => void (x.size = v / 100))} />
          <Segmented items={[{ id: 'left', label: '⟸' }, { id: 'center', label: '≡' }, { id: 'right', label: '⟹' }]} value={p.align} onChange={(v) => set((x) => void (x.align = v))} />
          <Slider label={tr('Harf aralığı', 'Letter spacing')} min={-5} max={40} value={Math.round((p.spacing ?? 0) * 100)} onChange={(v) => set((x) => void (x.spacing = v / 100))} />
          <Slider label={tr('Eğim', 'Slant')} bipolar min={-40} max={40} value={Math.round((p.skew ?? 0) * 100)} onChange={(v) => set((x) => void (x.skew = v / 100))} />
          <div className="group-label">{tr('Kontur', 'Outline')}</div>
          <ColorRow value={p.stroke?.color ?? null} colors={['#000000', '#ffffff', '#ff5a5f', '#ffb547', '#4a90e2', '#b56cf0']} onChange={(c) => set((x) => void (x.stroke = { color: c, width: x.stroke?.width || 0.08 }))} />
          <Slider label={tr('Kalınlık', 'Width')} max={40} value={Math.round((p.stroke?.width ?? 0) * 100)} onChange={(v) => set((x) => void (x.stroke = { color: x.stroke?.color ?? '#000000', width: v / 100 }))} />
          <div className="group-label">{tr('Gölge', 'Shadow')}</div>
          <Slider label={tr('Gölge', 'Shadow')} max={100} value={Math.round((p.shadow?.blur ?? 0) * 100)} onChange={(v) => set((x) => void (x.shadow = v ? { color: x.shadow?.color ?? 'rgba(0,0,0,.6)', blur: v / 100, x: 0, y: 0.04 } : null))} />
          <div className="group-label">{tr('Arka plan', 'Background')}</div>
          <ColorRow value={p.bg?.color ?? null} transparent onTransparent={() => set((x) => void (x.bg = null))} colors={['#000000', '#ffffff', '#ffb547', '#ff7ab6', '#4fd18b', '#4a90e2']} onChange={(c) => set((x) => void (x.bg = { color: c, opacity: x.bg?.opacity ?? 0.9, radius: x.bg?.radius ?? 0.2 }))} />
          {p.bg && <Slider label={tr('Arka plan opaklığı', 'Background opacity')} value={Math.round(p.bg.opacity * 100)} onChange={(v) => set((x) => void (x.bg = { ...x.bg!, opacity: v / 100 }))} />}
          <div className="setting"><div><b>{tr('İtalik', 'Italic')}</b></div><Switch label="italic" on={!!p.italic} onChange={(v) => set((x) => void (x.italic = v))} /></div>
          <LayerCommon l={l!} />
        </>
      ) : <p className="muted">{tr('Önce bir metin seç ya da ekle.', 'Select or add a text first.')}</p>)}
      <p className="note">{tr('Tuvalde metne tıklayıp sürükle; köşedeki tutamaçla döndür ve büyüt. Metinler her zaman düzenlenebilir kalır.', 'Click and drag text on the canvas; use the corner handle to rotate and scale. Text always stays editable.')}</p>
    </>
  )
}
void AlignLeft; void AlignCenter; void AlignRight

// ---------- Çıkartmalar ----------
const STICKER_CATS: { id: string; label: [string, string]; items: string[] }[] = [
  { id: 'love', label: ['Sevgi', 'Love'], items: ['❤️', '🩷', '💖', '💕', '💘', '💌', '🫶', '😍', '🥰', '😘', '🌹', '💐'] },
  { id: 'fun', label: ['Eğlence', 'Fun'], items: ['😂', '🤣', '😎', '🥳', '🤪', '😜', '🙃', '🤩', '👻', '🤡', '💀', '👀'] },
  { id: 'cute', label: ['Tatlı', 'Cute'], items: ['🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐥', '🦄', '🐸', '🐨', '🍓', '🧸'] },
  { id: 'deco', label: ['Süs', 'Deco'], items: ['✨', '⭐', '🌟', '💫', '🌈', '☁️', '🌸', '🌼', '🍀', '🦋', '🎀', '👑'] },
  { id: 'travel', label: ['Gezi', 'Travel'], items: ['✈️', '🏖️', '🌴', '🗺️', '📸', '🎒', '🌍', '⛰️', '🚗', '🛳️', '🏝️', '🎡'] },
  { id: 'food', label: ['Yemek', 'Food'], items: ['☕', '🍕', '🍔', '🍩', '🍰', '🍦', '🍣', '🥐', '🍹', '🍓', '🥑', '🍿'] },
  { id: 'party', label: ['Kutlama', 'Party'], items: ['🎉', '🎊', '🎂', '🎁', '🥂', '🍾', '🎈', '🪩', '🎶', '🔥', '💯', '🏆'] }
]
function StickerPanel() {
  const tr = useT()
  const [cat, setCat] = useState('love')
  const [l] = useLayer<StickerProps>()
  const items = STICKER_CATS.find((c) => c.id === cat)!.items
  const add = (props: StickerProps) => addLayer({ type: 'sticker', x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, props: props as unknown as Record<string, unknown> })
  return (
    <>
      <Tabs items={STICKER_CATS.map((c) => ({ id: c.id, label: tr(c.label[0], c.label[1]) }))} value={cat} onChange={setCat} />
      <div className="presets" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <button className="preset" onClick={async () => {
          const f = await platform.openFiles(false)
          if (!f[0]) return
          const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(new Blob([f[0].bytes as BlobPart])) })
          add({ kind: 'image', value: url, size: 0.35 })
        }}><span className="pv"><ImagePlus size={20} /></span>{tr('Görsel', 'Image')}</button>
        {items.map((e) => (
          <button key={e} className="preset" onClick={() => add({ kind: 'emoji', value: e, size: 0.22 })}><span className="pv" style={{ fontSize: 30 }}>{e}</span></button>
        ))}
      </div>
      {l?.type === 'sticker' && <LayerCommon l={l} />}
      <p className="note">{tr('Görsel çıktartma için PNG (şeffaf) dosya seçebilirsin.', 'You can pick a (transparent) PNG as an image sticker.')}</p>
    </>
  )
}

// ---------- Şekiller ----------
const SHAPES: ShapeProps['kind'][] = ['rect', 'round', 'circle', 'triangle', 'star', 'heart', 'arrow', 'line']
const SHAPE_ICONS: Record<string, string> = { rect: '■', round: '▢', circle: '●', triangle: '▲', star: '★', heart: '♥', arrow: '➜', line: '━' }
function ShapePanel() {
  const tr = useT()
  const [l, p] = useLayer<ShapeProps>()
  const isShape = l?.type === 'shape'
  const set = (fn: (p: ShapeProps) => void) => l && updLayer(l.id, (x) => fn(x.props as unknown as ShapeProps))
  return (
    <>
      <div className="presets" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {SHAPES.map((k) => (
          <button key={k} className="preset" onClick={() => addLayer({ type: 'shape', x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, props: { kind: k, fill: k === 'line' ? null : '#ffb547', stroke: k === 'line' ? '#ffffff' : null, strokeW: 0.01, w: 0.3, h: k === 'line' ? 0.02 : 0.3 } as unknown as Record<string, unknown> })}>
            <span className="pv" style={{ fontSize: 28, color: 'var(--c-accent)' }}>{SHAPE_ICONS[k]}</span>
          </button>
        ))}
      </div>
      {isShape && p && (
        <>
          <div className="group-label">{tr('Dolgu', 'Fill')}</div>
          <ColorRow value={p.fill} transparent onTransparent={() => set((x) => void (x.fill = null))} onChange={(c) => set((x) => void (x.fill = c))} />
          <div className="group-label">{tr('Çizgi', 'Stroke')}</div>
          <ColorRow value={p.stroke} transparent onTransparent={() => set((x) => void (x.stroke = null))} onChange={(c) => set((x) => void (x.stroke = c))} />
          <Slider label={tr('Çizgi kalınlığı', 'Stroke width')} min={0} max={10} value={Math.round(p.strokeW * 100 * 2)} onChange={(v) => set((x) => void (x.strokeW = v / 200))} />
          <Slider label={tr('Genişlik', 'Width')} min={2} max={100} value={Math.round(p.w * 100)} onChange={(v) => set((x) => void (x.w = v / 100))} />
          <Slider label={tr('Yükseklik', 'Height')} min={1} max={100} value={Math.round(p.h * 100)} onChange={(v) => set((x) => void (x.h = v / 100))} />
          <LayerCommon l={l!} />
        </>
      )}
    </>
  )
}

// ---------- Çizim ----------
const draw = { kind: 'pen' as Stroke['kind'], color: '#ffffff', size: 0.012, stamp: '❤️' }
function DrawPanel() {
  const tr = useT()
  const [, f] = useState(0)
  const r = () => f((x) => x + 1)
  const hasDrawing = useEditor((s) => s.doc.layers.some((l) => l.type === 'drawing'))
  return (
    <>
      <div className="presets" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {([['pen', 'Kalem', 'Pen'], ['marker', 'Fosforlu', 'Marker'], ['neon', 'Neon', 'Neon'], ['dash', 'Kesikli', 'Dashed'], ['stamp', 'Damga', 'Stamp'], ['eraser', 'Silgi', 'Eraser']] as const).map(([k, a, b]) => (
          <button key={k} className={'btn sm' + (draw.kind === k ? ' primary' : '')} onClick={() => { draw.kind = k; r() }}>{tr(a, b)}</button>
        ))}
      </div>
      {draw.kind === 'stamp' ? (
        <div className="colors">
          {['❤️', '⭐', '✨', '🌸', '🦋', '🍀', '🎀', '☁️', '🔥', '💧'].map((e) => (
            <button key={e} className={'swatch' + (draw.stamp === e ? ' on' : '')} style={{ background: 'var(--c-surface-2)', fontSize: 14 }} onClick={() => { draw.stamp = e; r() }}>{e}</button>
          ))}
        </div>
      ) : draw.kind !== 'eraser' && <ColorRow value={draw.color} onChange={(c) => { draw.color = c; r() }} />}
      <Slider label={tr('Boyut', 'Size')} min={1} max={60} value={Math.round(draw.size * 1000 / 2)} onChange={(v) => { draw.size = (v * 2) / 1000; r() }} />
      {hasDrawing && <button className="btn ghost block" onClick={() => useEditor.getState().update((d) => void (d.layers = d.layers.filter((l) => l.type !== 'drawing')))}>{tr('Çizimi temizle', 'Clear drawing')}</button>}
      <p className="note">{tr('Tuvale doğrudan çiz. Silgi yalnızca çizimi siler, fotoğrafı değil.', 'Draw directly on the canvas. The eraser only erases the drawing, not the photo.')}</p>
    </>
  )
}
function DrawOverlay({ view }: { view: View }) {
  const cur = useRef<Stroke | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const r = (draw.size * Math.min(view.size.w, view.size.h)) / 2
  return (
    <div
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair', touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        const n = view.toNorm(e.clientX, e.clientY)
        cur.current = { pts: [n.x, n.y, n.x + 0.0001, n.y], color: draw.color, size: draw.size, kind: draw.kind, stamp: draw.stamp }
        useEditor.getState().update((d) => {
          let l = d.layers.find((x) => x.type === 'drawing')
          if (!l) {
            l = { id: crypto.randomUUID(), type: 'drawing', x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1, props: { strokes: [] } }
            d.layers.push(l)
          }
          ;(l.props as unknown as DrawingProps).strokes.push(structuredClone(cur.current!))
        })
      }}
      onPointerMove={(e) => {
        const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setPos({ x: e.clientX - b.left, y: e.clientY - b.top })
        if (!cur.current || !(e.buttons & 1)) return
        const n = view.toNorm(e.clientX, e.clientY)
        cur.current.pts.push(n.x, n.y)
        useEditor.getState().update((d) => {
          const l = d.layers.find((x) => x.type === 'drawing')
          const s = (l?.props as unknown as DrawingProps | undefined)?.strokes
          if (s) s[s.length - 1].pts = [...cur.current!.pts]
        })
      }}
      onPointerUp={() => (cur.current = null)}
      onPointerLeave={() => setPos(null)}
    >
      {pos && <div style={{ position: 'absolute', left: pos.x - r, top: pos.y - r, width: r * 2, height: r * 2, borderRadius: '50%', border: '1px solid #fff', pointerEvents: 'none', mixBlendMode: 'difference' }} />}
    </div>
  )
}

const hasType = (t: Layer['type']) => (d: { layers: Layer[] }) => d.layers.some((l) => l.type === t)
export const TEXT_TOOLS: ToolDef[] = [{ id: 'text', label: ['Metin', 'Text'], icon: Type, Panel: TextPanel, Overlay: ({ view }) => <LayerOverlay view={view} types={['text']} />, applied: hasType('text') }]
export const STICKER_TOOLS: ToolDef[] = [{ id: 'stickers', label: ['Çıkartma', 'Stickers'], icon: Sticker, Panel: StickerPanel, Overlay: ({ view }) => <LayerOverlay view={view} types={['sticker']} />, applied: hasType('sticker') }]
export const SHAPE_TOOLS: ToolDef[] = [{ id: 'shapes', label: ['Şekiller', 'Shapes'], icon: Shapes, Panel: ShapePanel, Overlay: ({ view }) => <LayerOverlay view={view} types={['shape']} />, applied: hasType('shape') }]
export const DRAW_TOOLS: ToolDef[] = [{ id: 'draw', label: ['Fırça', 'Draw'], icon: Brush, Panel: DrawPanel, Overlay: DrawOverlay, applied: hasType('drawing') }]
