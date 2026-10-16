// Seçmeli ayar: fotoğrafa nokta koy, yalnız o bölgenin (ve benzer renklerin) ışığını/rengini değiştir.
// Masaüstü karşılığı Snapseed "Seçmeli" ve Lightroom yerel ayarları; formül ve kod bize ait.
import { useEffect, useRef, useState } from 'react'
import { Crosshair, Trash2 } from 'lucide-react'
import type { LocalPoint } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Slider } from '@/components/ui'
import { session } from '@/engine/session'
import type { ToolDef, View } from './types'

const MAX = 8
const NONE: LocalPoint[] = []
const sel = { id: null as string | null }
const selListeners = new Set<() => void>()
const select = (id: string | null) => { sel.id = id; selListeners.forEach((f) => f()) }
function useSelected() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    selListeners.add(h)
    return () => void selListeners.delete(h)
  }, [])
  return sel.id
}

/** Önizlemeden bir noktanın rengini oku (kaynak uv). */
let colorCanvas: { key: string; ctx: CanvasRenderingContext2D } | null = null
function sampleColor(x: number, y: number): [number, number, number] {
  const pv = session.preview
  if (!pv) return [0.5, 0.5, 0.5]
  if (!colorCanvas || colorCanvas.key !== session.baseKey) {
    const c = document.createElement('canvas')
    c.width = pv.width
    c.height = pv.height
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(pv, 0, 0)
    colorCanvas = { key: session.baseKey, ctx }
  }
  // 5×5 ortalama: tek piksel gürültüsü rengi saptırmasın
  const px = Math.min(pv.width - 3, Math.max(2, Math.round(x * pv.width))), py = Math.min(pv.height - 3, Math.max(2, Math.round(y * pv.height)))
  const d = colorCanvas.ctx.getImageData(px - 2, py - 2, 5, 5).data
  let r = 0, g = 0, b = 0
  for (let i = 0; i < 25; i++) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2] }
  return [r / 25 / 255, g / 25 / 255, b / 25 / 255]
}

function SelectivePanel() {
  const tr = useT()
  const points = useEditor((s) => s.doc.local) ?? NONE
  const update = useEditor((s) => s.update)
  const id = useSelected()
  const p = points.find((q) => q.id === id) ?? null
  useEffect(() => () => select(null), [])
  const set = (fn: (q: LocalPoint) => void) => update((d) => { const q = d.local?.find((x) => x.id === id); if (q) fn(q) })
  return (
    <>
      <p className="note">{tr('Düzenlemek istediğin yere tıkla: bir nokta eklenir. Nokta, çevresindeki ve benzer renkteki alanı etkiler. Sürükleyerek taşıyabilirsin.', 'Click where you want to edit to add a point. It affects the surrounding area with similar colours. Drag to move it.')}</p>
      <div className="note" aria-live="polite">{tr(`${points.length}/${MAX} nokta`, `${points.length}/${MAX} points`)}</div>
      {p ? (
        <>
          <Slider label={tr('Parlaklık', 'Brightness')} bipolar value={p.adj.b} onChange={(v) => set((q) => void (q.adj.b = v))} />
          <Slider label={tr('Kontrast', 'Contrast')} bipolar value={p.adj.c} onChange={(v) => set((q) => void (q.adj.c = v))} />
          <Slider label={tr('Doygunluk', 'Saturation')} bipolar value={p.adj.s} onChange={(v) => set((q) => void (q.adj.s = v))} />
          <Slider label={tr('Sıcaklık', 'Warmth')} bipolar value={p.adj.w} onChange={(v) => set((q) => void (q.adj.w = v))} />
          <Slider label={tr('Yarıçap', 'Radius')} min={3} max={60} def={20} value={Math.round(p.r * 100)} onChange={(v) => set((q) => void (q.r = v / 100))} />
          <Slider label={tr('Renk duyarlılığı', 'Colour sensitivity')} def={50} value={p.tol} onChange={(v) => set((q) => void (q.tol = v))} />
          <button className="btn ghost sm block" onClick={() => { update((d) => { d.local = (d.local ?? []).filter((x) => x.id !== id) }); select(null) }}><Trash2 size={14} /> {tr('Noktayı sil', 'Delete point')}</button>
        </>
      ) : points.length ? (
        <p className="note">{tr('Ayarlarını görmek için bir noktaya tıkla.', 'Click a point to see its settings.')}</p>
      ) : null}
      {points.length > 0 && <button className="btn ghost sm block" onClick={() => { update((d) => void (d.local = [])); select(null) }}>{tr('Tüm noktaları temizle', 'Clear all points')}</button>}
    </>
  )
}

function SelectiveOverlay({ view }: { view: View }) {
  const tr = useT()
  const points = useEditor((s) => s.doc.local) ?? NONE
  const update = useEditor((s) => s.update)
  const id = useSelected()
  const drag = useRef<string | null>(null)
  const add = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (points.length >= MAX) {
      useEditor.getState().toast('info', tr(`En çok ${MAX} nokta eklenebilir.`, `Up to ${MAX} points.`))
      return
    }
    const n = view.toNorm(e.clientX, e.clientY)
    if (n.x < 0 || n.y < 0 || n.x > 1 || n.y > 1) return
    const q: LocalPoint = { id: crypto.randomUUID(), x: n.x, y: n.y, r: 0.2, color: sampleColor(n.x, n.y), tol: 50, adj: { b: 0, c: 0, s: 0, w: 0 } }
    update((d) => { d.local = [...(d.local ?? []), q] })
    select(q.id)
  }
  const short = Math.min(view.size.w, view.size.h)
  return (
    <div
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
      onPointerDown={add}
      onPointerMove={(e) => {
        if (!drag.current || !(e.buttons & 1)) return
        const n = view.toNorm(e.clientX, e.clientY)
        const did = drag.current
        useEditor.getState().update((d) => { const q = d.local?.find((x) => x.id === did); if (q) { q.x = Math.min(1, Math.max(0, n.x)); q.y = Math.min(1, Math.max(0, n.y)); q.color = sampleColor(q.x, q.y) } })
      }}
      onPointerUp={() => { drag.current = null }}
    >
      {points.map((q, i) => {
        const s = view.toScreen(q.x, q.y)
        const R = q.r * short * 0.5
        const on = q.id === id
        return (
          <div key={q.id}>
            {on && <div className="sel-ring" style={{ left: s.x - R, top: s.y - R, width: 2 * R, height: 2 * R }} />}
            <button
              className={'sel-point' + (on ? ' on' : '')}
              style={{ left: s.x - 11, top: s.y - 11 }}
              aria-label={`${tr('Nokta', 'Point')} ${i + 1}`}
              aria-pressed={on}
              onPointerDown={(e) => {
                e.stopPropagation()
                ;(e.currentTarget.parentElement?.parentElement as HTMLElement)?.setPointerCapture(e.pointerId)
                drag.current = q.id
                select(q.id)
              }}
            >
              <Crosshair size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

export const SELECTIVE_TOOL: ToolDef = {
  id: 'selective', label: ['Seçmeli', 'Selective'], icon: Crosshair, Panel: SelectivePanel, Overlay: SelectiveOverlay, sourceSpace: true,
  applied: (d) => !!d.local?.length,
  sliders: [{ label: ['Seçmeli ayar', 'Selective adjust'] }]
}
