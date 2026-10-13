import { useRef, useState } from 'react'
import { SlidersHorizontal, Wand2, Palette, Spline, Sparkles } from 'lucide-react'
import { HUE_BANDS, type AdjustKey, type CurvePoint, type EditDoc, type HueBand } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Slider, Tabs } from '@/components/ui'
import { session } from '@/engine/session'
import { sampleCurve } from '@/engine/curves'
import type { ToolDef } from './types'
import { EnhanceTool } from './enhance'

const GROUPS: { title: [string, string]; keys: [AdjustKey, string, string, boolean][] }[] = [
  {
    title: ['Işık', 'Light'],
    keys: [
      ['exposure', 'Pozlama', 'Exposure', true],
      ['brightness', 'Parlaklık', 'Brightness', true],
      ['contrast', 'Kontrast', 'Contrast', true],
      ['highlights', 'Vurgular', 'Highlights', true],
      ['shadows', 'Gölgeler', 'Shadows', true],
      ['whites', 'Beyazlar', 'Whites', true],
      ['blacks', 'Siyahlar', 'Blacks', true],
      ['brilliance', 'Işıltı', 'Brilliance', true]
    ]
  },
  {
    title: ['Renk', 'Color'],
    keys: [
      ['temperature', 'Sıcaklık', 'Temperature', true],
      ['tint', 'Renk tonu', 'Tint', true],
      ['saturation', 'Doygunluk', 'Saturation', true],
      ['vibrance', 'Canlılık', 'Vibrance', true]
    ]
  },
  {
    title: ['Ayrıntı', 'Detail'],
    keys: [
      ['sharpen', 'Keskinlik', 'Sharpen', false],
      ['clarity', 'Netlik', 'Clarity', true],
      ['structure', 'Yapı', 'Structure', true],
      ['dehaze', 'Pus giderme', 'Dehaze', true]
    ]
  },
  {
    title: ['Doku', 'Texture'],
    keys: [
      ['fade', 'Soluklaştır', 'Fade', false],
      ['glow', 'Parlama', 'Glow', false],
      ['grain', 'Gren', 'Grain', false],
      ['vignette', 'Vinyet', 'Vignette', true]
    ]
  }
]

function AdjustPanel() {
  const tr = useT()
  const adjust = useEditor((s) => s.doc.adjust)
  const update = useEditor((s) => s.update)
  return (
    <>
      {GROUPS.map((g) => (
        <section key={g.title[0]}>
          <div className="group-label">{tr(g.title[0], g.title[1])}</div>
          {g.keys.map(([k, a, b, bip]) => (
            <Slider key={k} label={tr(a, b)} value={adjust[k]} bipolar={bip} onChange={(v) => update((d) => void (d.adjust[k] = v))} />
          ))}
        </section>
      ))}
      <button className="btn ghost block" onClick={() => update((d) => { for (const k of Object.keys(d.adjust) as AdjustKey[]) d.adjust[k] = 0 })}>
        {tr('Ayarları sıfırla', 'Reset adjustments')}
      </button>
    </>
  )
}

/** Histogramdan otomatik ton. */
async function analyze() {
  const pv = session.preview
  if (!pv) return null
  const s = 256 / Math.max(pv.width, pv.height)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(pv.width * s))
  c.height = Math.max(1, Math.round(pv.height * s))
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(pv, 0, 0, c.width, c.height)
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  const hist = new Array(256).fill(0)
  let sat = 0, rs = 0, bs = 0, n = 0
  for (let i = 0; i < d.length; i += 4) {
    const L = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2])
    hist[L]++
    sat += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2])
    rs += d[i]
    bs += d[i + 2]
    n++
  }
  const pct = (p: number) => {
    let acc = 0
    for (let i = 0; i < 256; i++) {
      acc += hist[i]
      if (acc >= p * n) return i / 255
    }
    return 1
  }
  return { p1: pct(0.01), p50: pct(0.5), p99: pct(0.99), sat: sat / n / 255, warm: (rs - bs) / n / 255 }
}

const AUTO_MODES: { id: string; label: [string, string] }[] = [
  { id: 'auto', label: ['Otomatik', 'Auto'] },
  { id: 'color', label: ['Rengi artır', 'Boost color'] },
  { id: 'enhance', label: ['Geliştir', 'Enhance'] },
  { id: 'backlight', label: ['Karşı ışık', 'Backlight'] },
  { id: 'haze', label: ['Pus kaldır', 'Remove haze'] },
  { id: 'soft', label: ['Yumuşat', 'Soften'] },
  { id: 'denoise', label: ['Gürültü azalt', 'Reduce noise'] },
  { id: 'brighten', label: ['Karanlığı aç', 'Brighten dark'] }
]

function AutoPanel() {
  const tr = useT()
  const [mode, setMode] = useState<string | null>(null)
  const [amt, setAmt] = useState(100)
  const base = useRef<EditDoc['adjust'] | null>(null)
  const update = useEditor((s) => s.update)

  const apply = async (id: string, amount: number) => {
    const a = await analyze()
    if (!a) return
    if (!base.current) base.current = { ...useEditor.getState().doc.adjust }
    const k = amount / 100
    const t: Partial<Record<AdjustKey, number>> = {}
    const exp = Math.max(-0.6, Math.min(0.8, Math.log2(0.46 / Math.max(a.p50, 0.03)) * 0.45))
    if (id === 'auto' || id === 'enhance') {
      t.exposure = exp * 100
      t.blacks = -Math.min(40, a.p1 * 300)
      t.whites = Math.min(40, (1 - a.p99) * 250)
      t.contrast = 10
      t.vibrance = a.sat < 0.25 ? 20 : 8
      t.temperature = Math.max(-25, Math.min(25, -a.warm * 120))
      if (id === 'enhance') { t.clarity = 20; t.sharpen = 18; t.shadows = 15; t.highlights = -15 }
    } else if (id === 'color') { t.vibrance = 35; t.saturation = 10; t.contrast = 8 }
    else if (id === 'backlight') { t.shadows = 55; t.highlights = -35; t.exposure = Math.max(0, exp * 60); t.clarity = 10 }
    else if (id === 'haze') { t.dehaze = 45; t.contrast = 10; t.vibrance = 15 }
    else if (id === 'soft') { t.clarity = -30; t.glow = 18; t.contrast = -10 }
    else if (id === 'denoise') { t.structure = -35; t.sharpen = 0; t.clarity = -10 }
    else if (id === 'brighten') { t.exposure = Math.max(20, exp * 120); t.shadows = 50; t.highlights = -20; t.dehaze = 10 }
    update((d) => {
      for (const key of Object.keys(d.adjust) as AdjustKey[]) d.adjust[key] = base.current![key]
      for (const [key, v] of Object.entries(t)) d.adjust[key as AdjustKey] = Math.max(-100, Math.min(100, Math.round(base.current![key as AdjustKey] + (v ?? 0) * k)))
    })
  }

  return (
    <>
      <p className="note">{tr('Fotoğrafı inceleyip ışık ve rengi senin yerine dengeler. Sonra kaydırıcılarla ince ayar yapabilirsin.', 'Looks at the photo and balances light and color for you. Fine-tune with sliders afterwards.')}</p>
      <div className="presets">
        {AUTO_MODES.map((m) => (
          <button key={m.id} className={'btn sm' + (mode === m.id ? ' primary' : '')} onClick={() => { setMode(m.id); void apply(m.id, amt) }}>
            {tr(m.label[0], m.label[1])}
          </button>
        ))}
      </div>
      {mode && <Slider label={tr('Yoğunluk', 'Amount')} value={amt} onChange={(v) => { setAmt(v); void apply(mode, v) }} />}
    </>
  )
}

const BAND_NAMES: Record<HueBand, [string, string, string]> = {
  red: ['Kırmızı', 'Red', '#ff4d4d'], orange: ['Turuncu', 'Orange', '#ff9a3d'], yellow: ['Sarı', 'Yellow', '#ffd23d'],
  green: ['Yeşil', 'Green', '#4fd16b'], aqua: ['Camgöbeği', 'Aqua', '#3dd6d0'], blue: ['Mavi', 'Blue', '#3d7bff'],
  purple: ['Mor', 'Purple', '#9a5cff'], magenta: ['Eflatun', 'Magenta', '#ff4fd2']
}

function HslPanel() {
  const tr = useT()
  const [band, setBand] = useState<HueBand>('red')
  const hsl = useEditor((s) => s.doc.hsl)
  const update = useEditor((s) => s.update)
  const v = hsl[band]
  return (
    <>
      <div className="colors" role="radiogroup" aria-label={tr('Renk bandı', 'Color band')}>
        {HUE_BANDS.map((b) => (
          <button key={b} className={'swatch' + (band === b ? ' on' : '')} style={{ background: BAND_NAMES[b][2] }} onClick={() => setBand(b)} aria-label={tr(BAND_NAMES[b][0], BAND_NAMES[b][1])} title={tr(BAND_NAMES[b][0], BAND_NAMES[b][1])} />
        ))}
      </div>
      <Slider label={tr('Ton', 'Hue')} bipolar value={v.h} onChange={(x) => update((d) => void (d.hsl[band].h = x))} />
      <Slider label={tr('Doygunluk', 'Saturation')} bipolar value={v.s} onChange={(x) => update((d) => void (d.hsl[band].s = x))} />
      <Slider label={tr('Parlaklık', 'Luminance')} bipolar value={v.l} onChange={(x) => update((d) => void (d.hsl[band].l = x))} />
    </>
  )
}

type Ch = 'rgb' | 'r' | 'g' | 'b'
function CurvesPanel() {
  const tr = useT()
  const [ch, setCh] = useState<Ch>('rgb')
  const pts = useEditor((s) => s.doc.curves[ch])
  const update = useEditor((s) => s.update)
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<number | null>(null)
  const S = 260
  const color = { rgb: '#f2f3f5', r: '#ff6b6b', g: '#4fd18b', b: '#5b9bff' }[ch]
  const samples = sampleCurve(pts, 64)
  const path = Array.from(samples).map((y, i) => `${i ? 'L' : 'M'}${(i / 63) * S},${S - y * S}`).join(' ')
  const pos = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect()
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))] as CurvePoint
  }
  const setPts = (fn: (p: CurvePoint[]) => CurvePoint[]) => update((d) => void (d.curves[ch] = fn(d.curves[ch].map((p) => [p[0], p[1]] as CurvePoint))))
  return (
    <>
      <Tabs items={[{ id: 'rgb', label: 'RGB' }, { id: 'r', label: tr('Kırmızı', 'Red') }, { id: 'g', label: tr('Yeşil', 'Green') }, { id: 'b', label: tr('Mavi', 'Blue') }]} value={ch} onChange={setCh} />
      <svg
        ref={svg}
        viewBox={`0 0 ${S} ${S}`}
        style={{ width: '100%', background: 'var(--c-bg)', borderRadius: 8, touchAction: 'none', cursor: 'crosshair' }}
        role="img"
        aria-label={tr('Ton eğrisi', 'Tone curve')}
        onPointerDown={(e) => {
          const p = pos(e)
          let i = pts.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05)
          if (i < 0) {
            setPts((a) => [...a, p].sort((x, y) => x[0] - y[0]))
            i = [...pts, p].sort((x, y) => x[0] - y[0]).findIndex((q) => q === p)
          }
          drag.current = i
          ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (drag.current === null) return
          const p = pos(e)
          const i = drag.current
          setPts((a) => {
            const lo = i > 0 ? a[i - 1][0] + 0.01 : 0
            const hi = i < a.length - 1 ? a[i + 1][0] - 0.01 : 1
            a[i] = [i === 0 ? 0 : i === a.length - 1 ? 1 : Math.min(hi, Math.max(lo, p[0])), p[1]]
            return a
          })
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={(e) => {
          const p = pos(e)
          setPts((a) => (a.length > 2 ? a.filter((q, k) => k === 0 || k === a.length - 1 || Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.05) : a))
        }}
      >
        {[1, 2, 3].map((k) => (
          <g key={k} stroke="var(--c-surface-3)" strokeWidth={1}>
            <line x1={(k * S) / 4} y1={0} x2={(k * S) / 4} y2={S} />
            <line x1={0} y1={(k * S) / 4} x2={S} y2={(k * S) / 4} />
          </g>
        ))}
        <line x1={0} y1={S} x2={S} y2={0} stroke="var(--c-surface-3)" strokeDasharray="4 4" />
        <path d={path} fill="none" stroke={color} strokeWidth={2} />
        {pts.map((p, i) => (
          <circle key={i} cx={p[0] * S} cy={S - p[1] * S} r={6} fill="var(--c-bg)" stroke={color} strokeWidth={2} />
        ))}
      </svg>
      <p className="note">{tr('Nokta eklemek için tıkla, sürükle; silmek için çift tıkla.', 'Click to add a point and drag; double-click to remove.')}</p>
      <button className="btn ghost block" onClick={() => setPts(() => [[0, 0], [1, 1]])}>{tr('Eğriyi sıfırla', 'Reset curve')}</button>
    </>
  )
}

const changed = (d: EditDoc) => Object.values(d.adjust).some((v) => v !== 0)
export const ADJUST_TOOLS: ToolDef[] = [
  { id: 'adjust', label: ['Ayarlar', 'Adjust'], icon: SlidersHorizontal, Panel: AdjustPanel, applied: changed },
  { id: 'auto', label: ['Akıllı', 'Smart'], icon: Wand2, Panel: AutoPanel },
  { id: 'hsl', label: ['HSL', 'HSL'], icon: Palette, Panel: HslPanel, applied: (d) => Object.values(d.hsl).some((b) => b.h || b.s || b.l) },
  { id: 'curves', label: ['Eğriler', 'Curves'], icon: Spline, Panel: CurvesPanel, applied: (d) => Object.values(d.curves).some((c) => c.length > 2 || c[0][1] !== 0 || c[1][1] !== 1) },
  { id: 'enhance', label: ['Kalite artır', 'Enhance'], icon: Sparkles, Panel: EnhanceTool, noFooter: true, sourceSpace: true }
]
