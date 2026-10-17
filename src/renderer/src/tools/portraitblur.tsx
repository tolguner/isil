// Portre bulanıklığı: konuyu (ya da arka planı) yapay zekâ maskesiyle ayırıp yalnız diğerini bulanıklaştır.
// Lens türü derinlik haritasıyla kademeli bulanıklık verir (uzak = daha bulanık). Hepsi yerel.
import { useEffect, useRef, useState } from 'react'
import { Aperture } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Segmented, Slider } from '@/components/ui'
import { removeBackground, depthMap, toCanvas } from '@/ai/ops'
import { commitRaster } from '@/lib/projects'
import type { ToolDef, View } from './types'
import { busy, useWork, useWorkLifecycle, work } from './raster'

type Kind = 'lens' | 'gauss' | 'motion' | 'spin' | 'radial'
type Target = 'bg' | 'subject'
const st = { kind: 'lens' as Kind, target: 'bg' as Target, amount: 50, angle: 0, mask: null as HTMLCanvasElement | null, depth: null as HTMLCanvasElement | null, key: '', pv: null as HTMLCanvasElement | null, v: 0 }
const listeners = new Set<() => void>()
const emit = () => { st.v++; listeners.forEach((f) => f()) }
function useSt() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    listeners.add(h)
    return () => void listeners.delete(h)
  }, [])
  return st
}

/** Görüntünün tamamının bulanık hali (türe göre). r: kısa kenara göre bulanıklık yarıçapı (px). */
function blurred(src: HTMLCanvasElement, kind: Kind, r: number, angle: number, center: [number, number]): HTMLCanvasElement {
  const W = src.width, H = src.height
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  if (kind === 'gauss' || kind === 'lens') {
    // kenarda karartma olmasın: taşkın çiz
    ctx.filter = `blur(${r}px)`
    ctx.drawImage(src, -r * 2, -r * 2, W + r * 4, H + r * 4)
    ctx.filter = 'none'
    return c
  }
  const N = 24
  ctx.globalAlpha = 1
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1) - 0.5
    ctx.save()
    ctx.globalAlpha = 1 / (i + 1)
    if (kind === 'motion') {
      const a = (angle * Math.PI) / 180
      ctx.translate(Math.cos(a) * t * r * 4, Math.sin(a) * t * r * 4)
    } else {
      ctx.translate(center[0] * W, center[1] * H)
      if (kind === 'spin') ctx.rotate(t * (r / Math.max(W, H)) * 1.2)
      else { const s = 1 + t * (r / Math.max(W, H)) * 2.4; ctx.scale(s, s) }
      ctx.translate(-center[0] * W, -center[1] * H)
    }
    ctx.drawImage(src, 0, 0)
    ctx.restore()
  }
  return c
}

/**
 * Bileşim: hedef bölgede bulanık, diğerinde net. Lens türünde arka plan derinliğe göre kademeli:
 * konu derinliğinden uzaklaştıkça bulanıklık artar (üç katman arasında karışım).
 */
export function compose(src: HTMLCanvasElement, mask: HTMLCanvasElement, depth: HTMLCanvasElement | null, o: { kind: Kind; target: Target; amount: number; angle: number }): HTMLCanvasElement {
  const W = src.width, H = src.height
  const r = Math.max(1, (o.amount / 100) * Math.min(W, H) * 0.03)
  const m = toCanvas(mask, W, H).getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  // konu ağırlık merkezi (spin/radial merkezi)
  let sx = 0, sy = 0, sn = 0
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) { const v = m[(y * W + x) * 4]; if (v > 128) { sx += x; sy += y; sn++ } }
  const center: [number, number] = sn ? [sx / sn / W, sy / sn / H] : [0.5, 0.5]
  const sd = src.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H)
  const layers = o.kind === 'lens' && depth ? [r * 0.35, r * 0.7, r] : [r]
  // hale olmasın: bulanıklaştırılacak bölgenin dışı saydam yapılır; tuval bulanıklığı alfa ağırlıklı ortalama
  // aldığı için (ön-çarpımlı) özne renkleri arka plana taşmaz
  const iso = document.createElement('canvas')
  iso.width = W
  iso.height = H
  const ictx = iso.getContext('2d', { willReadFrequently: true })!
  const id = new ImageData(W, H)
  for (let i = 0; i < W * H; i++) {
    const a = o.target === 'bg' ? 255 - m[i * 4] : m[i * 4]
    id.data[i * 4] = sd.data[i * 4]; id.data[i * 4 + 1] = sd.data[i * 4 + 1]; id.data[i * 4 + 2] = sd.data[i * 4 + 2]
    id.data[i * 4 + 3] = Math.max(2, a)
  }
  ictx.putImageData(id, 0, 0)
  const bl = layers.map((rr) => blurred(iso, o.kind, rr, o.angle, center).getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data)
  let dd: Uint8ClampedArray | null = null, dSubj = 0
  if (o.kind === 'lens' && depth) {
    dd = toCanvas(depth, W, H).getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
    let s2 = 0, n2 = 0
    for (let i = 0; i < W * H; i += 7) if (m[i * 4] > 200) { s2 += dd[i * 4]; n2++ }
    dSubj = n2 ? s2 / n2 : 200
  }
  const out = new ImageData(W, H)
  for (let i = 0; i < W * H; i++) {
    const subj = m[i * 4] / 255
    const w = o.target === 'bg' ? 1 - subj : subj
    let b0 = 0, b1 = 0, b2 = 0
    if (layers.length === 1) { b0 = bl[0][i * 4]; b1 = bl[0][i * 4 + 1]; b2 = bl[0][i * 4 + 2] }
    else {
      // derinlik farkı 0..1 → katman karışımı
      const t = Math.min(1, Math.abs(dSubj - dd![i * 4]) / 110) * 2
      const k = Math.min(1, Math.floor(t)), f = t - k
      for (let ch = 0; ch < 3; ch++) {
        const a = bl[k][i * 4 + ch], b = bl[Math.min(2, k + 1)][i * 4 + ch]
        const v = a * (1 - f) + b * f
        if (ch === 0) b0 = v; else if (ch === 1) b1 = v; else b2 = v
      }
    }
    out.data[i * 4] = sd.data[i * 4] * (1 - w) + b0 * w
    out.data[i * 4 + 1] = sd.data[i * 4 + 1] * (1 - w) + b1 * w
    out.data[i * 4 + 2] = sd.data[i * 4 + 2] * (1 - w) + b2 * w
    out.data[i * 4 + 3] = 255
  }
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  c.getContext('2d')!.putImageData(out, 0, 0)
  return c
}

let previewTimer = 0
function schedulePreview() {
  clearTimeout(previewTimer)
  previewTimer = window.setTimeout(() => void runPreview(), 120)
}
let base: HTMLCanvasElement | null = null
async function runPreview() {
  if (!work.preview || !st.mask) return
  base ??= toCanvas(work.preview)
  // önizleme: önizleme boyutunda hesaplanıp tuvalin üstünde gösterilir; tam çözünürlük Uygula'da
  st.pv = compose(base, st.mask, st.depth, st)
  emit()
}

async function prepare(tr: (a: string, b: string) => string) {
  if (!work.preview || st.key === work.key) return
  await busy(tr('Konu ayrılıyor…', 'Finding the subject…'), async () => {
    st.mask = await removeBackground(work.preview!, true)
    st.depth = await depthMap(work.preview!).catch(() => null)
    st.key = work.key
    base = null
  })
  emit()
  if (!st.mask) useEditor.getState().toast('error', tr('Konu bulunamadı.', 'No subject found.'))
  else schedulePreview()
}

function PortraitBlurPanel() {
  const tr = useT()
  useWorkLifecycle()
  const w = useWork()
  useSt()
  const set = (p: Partial<typeof st>) => { Object.assign(st, p); emit(); schedulePreview() }
  useEffect(() => { if (w.preview) void prepare(tr) }, [w.preview, w.key])
  useEffect(() => () => { st.key = ''; st.mask = st.depth = st.pv = null; base = null }, [])
  return (
    <>
      <p className="note">{tr('Konu yapay zekâyla ayrılır; seçtiğin bölge bulanıklaşır. Lens, derinliğe göre kademeli bulanıklık verir.', 'The subject is separated by AI; the chosen area is blurred. Lens blurs gradually by depth.')}</p>
      <Segmented items={[{ id: 'bg', label: tr('Arka plan', 'Background') }, { id: 'subject', label: tr('Özne', 'Subject') }]} value={st.target} onChange={(v) => set({ target: v })} />
      <div className="presets" style={{ marginTop: 8 }}>
        {([['lens', 'Lens', 'Lens'], ['gauss', 'Gauss', 'Gaussian'], ['motion', 'Hareket', 'Motion'], ['spin', 'Dönme', 'Spin'], ['radial', 'Yakınlaşma', 'Zoom']] as const).map(([id, a, b]) => (
          <button key={id} className={'btn sm' + (st.kind === id ? ' primary' : '')} aria-pressed={st.kind === id} onClick={() => set({ kind: id })}>{tr(a, b)}</button>
        ))}
      </div>
      <Slider label={tr('Yoğunluk', 'Strength')} min={5} max={100} value={st.amount} onChange={(v) => set({ amount: v })} />
      {st.kind === 'motion' && <Slider label={tr('Açı', 'Angle')} min={-90} max={90} def={0} value={st.angle} onChange={(v) => set({ angle: v })} />}
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => useEditor.getState().closeTool(false)}>{tr('İptal', 'Cancel')}</button>
        <button className="btn primary" style={{ flex: 1 }} disabled={!st.mask} onClick={() => void busy(tr('Uygulanıyor…', 'Applying…'), async () => {
          if (!work.full || !st.mask) return
          const out = compose(toCanvas(work.full), st.mask, st.depth, st)
          await commitRaster(out, 'paint', { tool: 'portrait-blur', kind: st.kind, target: st.target, amount: st.amount })
          useEditor.getState().closeTool(true)
        })}>{tr('Uygula', 'Apply')}</button>
      </div>
    </>
  )
}

function PortraitBlurOverlay({ view }: { view: View }) {
  const s = useSt()
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !s.pv) return
    c.width = s.pv.width
    c.height = s.pv.height
    c.getContext('2d')!.drawImage(s.pv, 0, 0)
  }, [s.v])
  if (!s.pv) return null
  const tl = view.toScreen(0, 0)
  return <canvas ref={ref} style={{ position: 'absolute', left: tl.x, top: tl.y, width: view.size.w, height: view.size.h, pointerEvents: 'none' }} />
}

export const PORTRAIT_BLUR_TOOL: ToolDef = {
  id: 'pblur', label: ['Portre bulanıklığı', 'Portrait blur'], icon: Aperture, Panel: PortraitBlurPanel, Overlay: PortraitBlurOverlay, sourceSpace: true, noFooter: true, badge: 'YZ',
  sliders: [{ label: ['Arka planı bulanıklaştır', 'Blur background'] }]
}
