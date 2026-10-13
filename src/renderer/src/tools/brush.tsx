// Ortak fırça kaplaması: imleç, boyama (maske tuvaline), sürükleme olayları.
import { useEffect, useRef, useState } from 'react'
import type { View } from './types'

export interface BrushState {
  size: number      // görüntünün kısa kenarına oranı (0.005..0.25)
  hardness: number  // 0..1
  erase: boolean
}

/** Kaynak boyutunda boyama maskesi (beyaz = boyalı). */
export class PaintMask {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  dirty = false
  constructor(public w: number, public h: number) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = w
    this.canvas.height = h
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
  }
  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h)
    this.dirty = false
  }
  dab(x: number, y: number, b: BrushState, last?: { x: number; y: number }) {
    const r = (b.size * Math.min(this.w, this.h)) / 2
    const ctx = this.ctx
    ctx.save()
    ctx.globalCompositeOperation = b.erase ? 'destination-out' : 'source-over'
    const steps = last ? Math.max(1, Math.ceil(Math.hypot((x - last.x) * this.w, (y - last.y) * this.h) / (r * 0.25))) : 1
    for (let i = 1; i <= steps; i++) {
      const px = (last ? last.x + ((x - last.x) * i) / steps : x) * this.w
      const py = (last ? last.y + ((y - last.y) * i) / steps : y) * this.h
      const g = ctx.createRadialGradient(px, py, r * b.hardness * 0.95, px, py, r)
      g.addColorStop(0, 'rgba(255,255,255,1)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    this.dirty = true
  }
  /** Maskeyi gri (R=G=B=alfa, A=255) tuvale çevir. */
  toGray(): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = this.w
    c.height = this.h
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, this.w, this.h)
    ctx.drawImage(this.canvas, 0, 0)
    return c
  }
  isEmpty() {
    const d = this.ctx.getImageData(0, 0, this.w, this.h).data
    for (let i = 3; i < d.length; i += 64) if (d[i] > 8) return false
    return true
  }
}

/**
 * Tuval üstü fırça. tint: boyalı alanın görünümü. onStroke: her harekette (normalize).
 */
export function BrushOverlay(props: {
  view: View
  brush: BrushState
  mask?: PaintMask | null
  tint?: string
  onStart?: (p: { x: number; y: number }) => void
  onMove?: (p: { x: number; y: number }, last: { x: number; y: number }) => void
  onEnd?: () => void
  showMask?: boolean
  version?: number
}) {
  const { view, brush } = props
  const [cur, setCur] = useState<{ x: number; y: number } | null>(null)
  const last = useRef<{ x: number; y: number } | null>(null)
  const maskView = useRef<HTMLCanvasElement>(null)
  const [, force] = useState(0)

  const redrawMask = () => {
    const m = props.mask
    const c = maskView.current
    if (!m || !c) return
    if (c.width !== m.w || c.height !== m.h) {
      c.width = m.w
      c.height = m.h
    }
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, m.w, m.h)
    ctx.drawImage(m.canvas, 0, 0)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = props.tint ?? 'rgba(255,90,95,0.5)'
    ctx.fillRect(0, 0, m.w, m.h)
    ctx.globalCompositeOperation = 'source-over'
  }
  useEffect(redrawMask, [props.mask, props.version])

  const r = (brush.size * Math.min(view.size.w, view.size.h)) / 2
  const tl = view.toScreen(0, 0)
  return (
    <div
      style={{ position: 'absolute', inset: 0, cursor: 'none', touchAction: 'none' }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        const p = view.toNorm(e.clientX, e.clientY)
        last.current = p
        props.mask?.dab(p.x, p.y, brush)
        props.onStart?.(p)
        redrawMask()
      }}
      onPointerMove={(e) => {
        const r0 = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setCur({ x: e.clientX - r0.left, y: e.clientY - r0.top })
        if (!last.current || !(e.buttons & 1)) return
        const p = view.toNorm(e.clientX, e.clientY)
        props.mask?.dab(p.x, p.y, brush, last.current)
        props.onMove?.(p, last.current)
        last.current = p
        redrawMask()
        force((x) => x + 1)
      }}
      onPointerUp={() => {
        if (last.current) props.onEnd?.()
        last.current = null
      }}
      onPointerLeave={() => setCur(null)}
    >
      {props.mask && props.showMask !== false && (
        <canvas ref={maskView} style={{ position: 'absolute', left: tl.x, top: tl.y, width: view.size.w, height: view.size.h, pointerEvents: 'none' }} />
      )}
      {cur && (
        <div style={{ position: 'absolute', left: cur.x - r, top: cur.y - r, width: r * 2, height: r * 2, borderRadius: '50%', border: '1.5px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,.6)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: `${(1 - brush.hardness) * r}px`, borderRadius: '50%', border: '1px dashed rgba(255,255,255,.6)' }} />
        </div>
      )}
    </div>
  )
}
