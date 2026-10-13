import { useRef } from 'react'
import { Crop as CropIcon, RotateCcw, RotateCw, FlipHorizontal2, FlipVertical2 } from 'lucide-react'
import type { EditDoc } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Slider } from '@/components/ui'
import { session } from '@/engine/session'
import type { ToolDef, View } from './types'

export const RATIOS: { id: string; label: [string, string]; r: number | null }[] = [
  { id: 'free', label: ['Serbest', 'Free'], r: null },
  { id: 'original', label: ['Orijinal', 'Original'], r: -1 },
  { id: '1:1', label: ['1:1', '1:1'], r: 1 },
  { id: '4:5', label: ['4:5', '4:5'], r: 4 / 5 },
  { id: '3:4', label: ['3:4', '3:4'], r: 3 / 4 },
  { id: '2:3', label: ['2:3', '2:3'], r: 2 / 3 },
  { id: '9:16', label: ['9:16', '9:16'], r: 9 / 16 },
  { id: '16:9', label: ['16:9', '16:9'], r: 16 / 9 },
  { id: '4:3', label: ['4:3', '4:3'], r: 4 / 3 },
  { id: '3:2', label: ['3:2', '3:2'], r: 3 / 2 }
]

function rotSize(d: EditDoc) {
  const q = d.crop.quarter % 2 === 1
  return q ? { w: session.H, h: session.W } : { w: session.W, h: session.H }
}

/** Seçili oran için en büyük ortalanmış kırpma. */
export function fitRatio(d: EditDoc, r: number | null) {
  const { w, h } = rotSize(d)
  if (r === -1) r = session.W / session.H
  if (!r) return
  const img = w / h
  let cw = 1, ch = 1
  if (r > img) ch = img / r
  else cw = r / img
  d.crop.x = (1 - cw) / 2
  d.crop.y = (1 - ch) / 2
  d.crop.w = cw
  d.crop.h = ch
}

function CropPanel() {
  const tr = useT()
  const crop = useEditor((s) => s.doc.crop)
  const update = useEditor((s) => s.update)
  return (
    <>
      <div className="group-label">{tr('Oran', 'Aspect')}</div>
      <div className="aspects">
        {RATIOS.map((a) => {
          const r = a.r === -1 ? session.W / Math.max(1, session.H) : a.r
          const bw = r ? (r >= 1 ? 22 : 22 * r) : 20
          const bh = r ? (r >= 1 ? 22 / r : 22) : 16
          return (
            <button key={a.id} className={(crop.ratio ?? 'free') === a.id ? 'on' : ''} onClick={() => update((d) => { d.crop.ratio = a.id; fitRatio(d, a.r) })}>
              <span className="box" style={{ width: bw, height: bh, borderStyle: a.r ? 'solid' : 'dashed' }} />
              {tr(a.label[0], a.label[1])}
            </button>
          )
        })}
      </div>
      <div className="group-label">{tr('Döndür', 'Rotate')}</div>
      <div className="row">
        <button className="btn sm" onClick={() => update((d) => { d.crop.quarter = (d.crop.quarter + 3) % 4; d.crop = { ...d.crop, x: 0, y: 0, w: 1, h: 1 }; if (d.crop.ratio && d.crop.ratio !== 'free') fitRatio(d, RATIOS.find((x) => x.id === d.crop.ratio)?.r ?? null) })} title={tr('Sola 90°', 'Rotate left 90°')}><RotateCcw size={16} /></button>
        <button className="btn sm" onClick={() => update((d) => { d.crop.quarter = (d.crop.quarter + 1) % 4; d.crop = { ...d.crop, x: 0, y: 0, w: 1, h: 1 }; if (d.crop.ratio && d.crop.ratio !== 'free') fitRatio(d, RATIOS.find((x) => x.id === d.crop.ratio)?.r ?? null) })} title={tr('Sağa 90°', 'Rotate right 90°')}><RotateCw size={16} /></button>
        <button className={'btn sm' + (crop.flipH ? ' primary' : '')} onClick={() => update((d) => void (d.crop.flipH = !d.crop.flipH))} title={tr('Yatay çevir', 'Flip horizontal')}><FlipHorizontal2 size={16} /></button>
        <button className={'btn sm' + (crop.flipV ? ' primary' : '')} onClick={() => update((d) => void (d.crop.flipV = !d.crop.flipV))} title={tr('Dikey çevir', 'Flip vertical')}><FlipVertical2 size={16} /></button>
      </div>
      <Slider label={tr('Düzelt', 'Straighten')} bipolar min={-45} max={45} value={crop.rotation} onChange={(v) => update((d) => void (d.crop.rotation = v))} />
      <div className="group-label">{tr('Perspektif', 'Perspective')}</div>
      <Slider label={tr('Yatay', 'Horizontal')} bipolar value={crop.perspH} onChange={(v) => update((d) => void (d.crop.perspH = v))} />
      <Slider label={tr('Dikey', 'Vertical')} bipolar value={crop.perspV} onChange={(v) => update((d) => void (d.crop.perspV = v))} />
      <button className="btn ghost block" onClick={() => update((d) => void (d.crop = { x: 0, y: 0, w: 1, h: 1, rotation: 0, quarter: 0, flipH: false, flipV: false, perspH: 0, perspV: 0, ratio: null }))}>{tr('Sıfırla', 'Reset')}</button>
    </>
  )
}

function CropOverlay({ view }: { view: View }) {
  const crop = useEditor((s) => s.doc.crop)
  const update = useEditor((s) => s.update)
  const drag = useRef<{ mode: string; sx: number; sy: number; c: EditDoc['crop'] } | null>(null)
  const p0 = view.toScreen(crop.x, crop.y)
  const p1 = view.toScreen(crop.x + crop.w, crop.y + crop.h)
  const ratio = RATIOS.find((r) => r.id === crop.ratio)?.r ?? null
  const realR = ratio === -1 ? session.W / session.H : ratio
  const aspectN = realR ? realR / (view.outW / view.outH) : null // normalize uzayda w/h

  const onDown = (mode: string) => (e: React.PointerEvent) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const n = view.toNorm(e.clientX, e.clientY)
    drag.current = { mode, sx: n.x, sy: n.y, c: { ...crop } }
  }
  const onMove = (e: React.PointerEvent) => {
    const dr = drag.current
    if (!dr) return
    const n = view.toNorm(e.clientX, e.clientY)
    const dx = n.x - dr.sx, dy = n.y - dr.sy
    update((d) => {
      const c = { ...dr.c }
      if (dr.mode === 'move') {
        c.x = Math.min(1 - c.w, Math.max(0, c.x + dx))
        c.y = Math.min(1 - c.h, Math.max(0, c.y + dy))
      } else {
        let x0 = c.x, y0 = c.y, x1 = c.x + c.w, y1 = c.y + c.h
        if (dr.mode.includes('w')) x0 = Math.min(x1 - 0.05, Math.max(0, x0 + dx))
        if (dr.mode.includes('e')) x1 = Math.max(x0 + 0.05, Math.min(1, x1 + dx))
        if (dr.mode.includes('n')) y0 = Math.min(y1 - 0.05, Math.max(0, y0 + dy))
        if (dr.mode.includes('s')) y1 = Math.max(y0 + 0.05, Math.min(1, y1 + dy))
        if (aspectN) {
          let w = x1 - x0
          let h = w / aspectN
          if (dr.mode.includes('n')) y0 = y1 - h
          else y1 = y0 + h
          if (y0 < 0 || y1 > 1) {
            h = dr.mode.includes('n') ? y1 : 1 - y0
            h = Math.max(0.05, Math.min(h, dr.mode.includes('n') ? y1 : 1 - y0))
            w = h * aspectN
            if (dr.mode.includes('n')) y0 = y1 - h
            else y1 = y0 + h
            if (dr.mode.includes('w')) x0 = x1 - w
            else x1 = x0 + w
          }
        }
        c.x = x0; c.y = y0; c.w = x1 - x0; c.h = y1 - y0
        if (!aspectN) c.ratio = 'free'
      }
      d.crop = c
    })
  }
  return (
    <div
      className="crop-frame"
      style={{ left: p0.x, top: p0.y, width: p1.x - p0.x, height: p1.y - p0.y }}
      onPointerDown={onDown('move')}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      role="region"
      aria-label="Kırpma alanı"
    >
      <div className="grid" />
      {['nw', 'ne', 'sw', 'se'].map((h) => (
        <div key={h} className={'hd ' + h} onPointerDown={onDown(h)} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} />
      ))}
    </div>
  )
}

export const CROP_TOOLS: ToolDef[] = [
  {
    id: 'crop',
    label: ['Kırp', 'Crop'],
    icon: CropIcon,
    Panel: CropPanel,
    Overlay: CropOverlay,
    viewDoc: (d) => cropViewDoc(d),
    applied: (d) => d.crop.w < 1 || d.crop.h < 1 || d.crop.rotation !== 0 || d.crop.quarter !== 0
  }
]

/** Kırpma aracı açıkken tuvalde tam (döndürülmüş) kare gösterilir. */
export function cropViewDoc(d: EditDoc): EditDoc {
  return { ...d, crop: { ...d.crop, x: 0, y: 0, w: 1, h: 1 }, background: { ...d.background, ratio: null }, effects: [] }
}
