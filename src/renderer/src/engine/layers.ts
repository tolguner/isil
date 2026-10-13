// Katmanlar (metin, çıkartma, şekil, çizim) — önizleme ve dışa aktarma aynı kodla çizilir.
import type { Layer } from '@shared/schema'

export interface TextProps {
  text: string; font: string; weight: number; size: number // tuval yüksekliğinin oranı
  color: string; opacity: number; align: 'left' | 'center' | 'right'
  stroke?: { color: string; width: number } | null
  shadow?: { color: string; blur: number; x: number; y: number } | null
  bg?: { color: string; opacity: number; radius: number } | null
  italic?: boolean; spacing?: number; lineHeight?: number; gradient?: [string, string] | null; skew?: number
}
export interface StickerProps { kind: 'emoji' | 'image'; value: string; size: number }
export interface ShapeProps { kind: 'rect' | 'round' | 'circle' | 'triangle' | 'star' | 'heart' | 'arrow' | 'line'; fill: string | null; stroke: string | null; strokeW: number; w: number; h: number }
export interface Stroke { pts: number[]; color: string; size: number; kind: 'pen' | 'marker' | 'neon' | 'dash' | 'eraser' | 'stamp'; stamp?: string }
export interface DrawingProps { strokes: Stroke[] }

const imgCache = new Map<string, HTMLImageElement>()
export function stickerImage(src: string, onload?: () => void) {
  let im = imgCache.get(src)
  if (!im) {
    im = new Image()
    im.src = src
    imgCache.set(src, im)
    if (onload) im.onload = onload
  }
  return im.complete && im.naturalWidth ? im : null
}

export function layerSize(l: Layer, W: number, H: number, ctx?: CanvasRenderingContext2D): { w: number; h: number } {
  if (l.type === 'text') {
    const p = l.props as unknown as TextProps
    const fs = p.size * H
    const c = ctx ?? measureCtx()
    c.font = fontString(p, fs)
    const lines = p.text.split('\n')
    const lw = Math.max(...lines.map((s) => c.measureText(s).width + (p.spacing ?? 0) * fs * s.length), fs * 0.5)
    const lh = fs * (p.lineHeight ?? 1.2)
    const pad = p.bg ? fs * 0.35 : fs * 0.1
    return { w: lw + pad * 2, h: lh * lines.length + pad * 2 }
  }
  if (l.type === 'sticker') {
    const p = l.props as unknown as StickerProps
    const s = p.size * Math.min(W, H)
    const im = p.kind === 'image' ? stickerImage(p.value) : null
    const r = im ? im.naturalHeight / im.naturalWidth : 1
    return { w: s, h: s * r }
  }
  if (l.type === 'shape') {
    const p = l.props as unknown as ShapeProps
    return { w: p.w * Math.min(W, H), h: p.h * Math.min(W, H) }
  }
  return { w: W, h: H }
}

let mctx: CanvasRenderingContext2D | null = null
function measureCtx() {
  mctx ??= document.createElement('canvas').getContext('2d')!
  return mctx
}

export function fontString(p: TextProps, px: number) {
  return `${p.italic ? 'italic ' : ''}${p.weight} ${px}px ${p.font}`
}

function shapePath(ctx: CanvasRenderingContext2D, kind: ShapeProps['kind'], w: number, h: number) {
  ctx.beginPath()
  const x = -w / 2, y = -h / 2
  switch (kind) {
    case 'rect': ctx.rect(x, y, w, h); break
    case 'round': ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.2); break
    case 'circle': ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2); break
    case 'triangle': ctx.moveTo(0, y); ctx.lineTo(w / 2, h / 2); ctx.lineTo(x, h / 2); ctx.closePath(); break
    case 'star': {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.4 : 1
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const px = Math.cos(a) * (w / 2) * r, py = Math.sin(a) * (h / 2) * r
        if (i) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
      }
      ctx.closePath()
      break
    }
    case 'heart': {
      const s = Math.min(w, h) / 2
      ctx.moveTo(0, s * 0.7)
      ctx.bezierCurveTo(-s * 1.4, -s * 0.2, -s * 0.6, -s * 1.1, 0, -s * 0.45)
      ctx.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.4, -s * 0.2, 0, s * 0.7)
      ctx.closePath()
      break
    }
    case 'arrow':
      ctx.moveTo(x, -h * 0.15); ctx.lineTo(w * 0.15, -h * 0.15); ctx.lineTo(w * 0.15, y); ctx.lineTo(w / 2, 0)
      ctx.lineTo(w * 0.15, h / 2); ctx.lineTo(w * 0.15, h * 0.15); ctx.lineTo(x, h * 0.15); ctx.closePath()
      break
    case 'line': ctx.moveTo(x, 0); ctx.lineTo(w / 2, 0); break
  }
}

export function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[], W: number, H: number) {
  for (const s of strokes) {
    if (s.pts.length < 2) continue
    ctx.save()
    const size = s.size * Math.min(W, H)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = size
    ctx.strokeStyle = s.color
    if (s.kind === 'eraser') ctx.globalCompositeOperation = 'destination-out'
    if (s.kind === 'marker') ctx.globalAlpha = 0.45
    if (s.kind === 'neon') {
      ctx.shadowColor = s.color
      ctx.shadowBlur = size * 2
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = size * 0.45
    }
    if (s.kind === 'dash') ctx.setLineDash([size * 1.5, size * 1.5])
    if (s.kind === 'stamp' && s.stamp) {
      ctx.font = `${size * 2}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      let last: [number, number] | null = null
      for (let i = 0; i < s.pts.length; i += 2) {
        const x = s.pts[i] * W, y = s.pts[i + 1] * H
        if (!last || Math.hypot(x - last[0], y - last[1]) > size * 2.2) {
          ctx.fillText(s.stamp, x, y)
          last = [x, y]
        }
      }
      ctx.restore()
      continue
    }
    ctx.beginPath()
    ctx.moveTo(s.pts[0] * W, s.pts[1] * H)
    for (let i = 2; i < s.pts.length - 2; i += 2) {
      const mx = ((s.pts[i] + s.pts[i + 2]) / 2) * W
      const my = ((s.pts[i + 1] + s.pts[i + 3]) / 2) * H
      ctx.quadraticCurveTo(s.pts[i] * W, s.pts[i + 1] * H, mx, my)
    }
    ctx.lineTo(s.pts[s.pts.length - 2] * W, s.pts[s.pts.length - 1] * H)
    ctx.stroke()
    if (s.kind === 'neon') {
      ctx.shadowBlur = size
      ctx.stroke()
    }
    ctx.restore()
  }
}

/** Tüm katmanları W×H tuvale çizer. */
export function drawLayers(ctx: CanvasRenderingContext2D, layers: Layer[], W: number, H: number, onAsset?: () => void) {
  for (const l of layers) {
    ctx.save()
    ctx.globalAlpha = l.opacity
    if (l.type === 'drawing') {
      // çizimleri ayrı katmanda çiz ki silgi yalnızca çizimi silsin
      const off = document.createElement('canvas')
      off.width = W
      off.height = H
      drawStrokes(off.getContext('2d')!, (l.props as unknown as DrawingProps).strokes, W, H)
      ctx.drawImage(off, 0, 0)
      ctx.restore()
      continue
    }
    ctx.translate(l.x * W, l.y * H)
    ctx.rotate((l.rotation * Math.PI) / 180)
    ctx.scale(l.scale, l.scale)
    if (l.type === 'text') {
      const p = l.props as unknown as TextProps
      const fs = p.size * H
      const { w, h } = layerSize(l, W, H, ctx)
      ctx.font = fontString(p, fs)
      if (p.skew) ctx.transform(1, 0, -p.skew, 1, 0, 0)
      if (p.bg) {
        ctx.save()
        ctx.globalAlpha *= p.bg.opacity
        ctx.fillStyle = p.bg.color
        ctx.beginPath()
        ctx.roundRect(-w / 2, -h / 2, w, h, fs * p.bg.radius)
        ctx.fill()
        ctx.restore()
      }
      ctx.textBaseline = 'middle'
      ctx.textAlign = p.align
      if ('letterSpacing' in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(p.spacing ?? 0) * fs}px`
      const lines = p.text.split('\n')
      const lh = fs * (p.lineHeight ?? 1.2)
      const pad = p.bg ? fs * 0.35 : fs * 0.1
      const x = p.align === 'left' ? -w / 2 + pad : p.align === 'right' ? w / 2 - pad : 0
      lines.forEach((line, i) => {
        const y = -((lines.length - 1) * lh) / 2 + i * lh
        if (p.shadow) {
          ctx.shadowColor = p.shadow.color
          ctx.shadowBlur = p.shadow.blur * fs
          ctx.shadowOffsetX = p.shadow.x * fs
          ctx.shadowOffsetY = p.shadow.y * fs
        }
        if (p.stroke && p.stroke.width > 0) {
          ctx.lineWidth = p.stroke.width * fs
          ctx.strokeStyle = p.stroke.color
          ctx.lineJoin = 'round'
          ctx.strokeText(line, x, y)
          ctx.shadowColor = 'transparent'
        }
        if (p.gradient) {
          const g = ctx.createLinearGradient(0, -lh / 2 + y, 0, lh / 2 + y)
          g.addColorStop(0, p.gradient[0])
          g.addColorStop(1, p.gradient[1])
          ctx.fillStyle = g
        } else ctx.fillStyle = p.color
        ctx.globalAlpha = l.opacity * p.opacity
        ctx.fillText(line, x, y)
        ctx.shadowColor = 'transparent'
      })
    } else if (l.type === 'sticker') {
      const p = l.props as unknown as StickerProps
      const { w, h } = layerSize(l, W, H)
      if (p.kind === 'emoji') {
        ctx.font = `${w * 0.85}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(p.value, 0, w * 0.04)
      } else {
        const im = stickerImage(p.value, onAsset)
        if (im) ctx.drawImage(im, -w / 2, -h / 2, w, h)
      }
    } else if (l.type === 'shape') {
      const p = l.props as unknown as ShapeProps
      const { w, h } = layerSize(l, W, H)
      shapePath(ctx, p.kind, w, h)
      if (p.fill && p.kind !== 'line') {
        ctx.fillStyle = p.fill
        ctx.fill()
      }
      if (p.stroke) {
        ctx.lineWidth = p.strokeW * Math.min(W, H)
        ctx.strokeStyle = p.stroke
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}
