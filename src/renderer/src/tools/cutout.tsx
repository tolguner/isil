import { useEffect, useState } from 'react'
import { Scissors, Square, ImagePlus } from 'lucide-react'
import type { Fill } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { ColorRow, Preset, Segmented, Slider, Switch } from '@/components/ui'
import { session, encodeCanvas } from '@/engine/session'
import { removeBackground, toCanvas } from '@/ai/ops'
import { segmentPerson, maskToCanvas, tapSelect } from '@/ai/vision'
import { commitMask, putImageAsset } from '@/lib/projects'
import { platform } from '@/lib/platform'
import { RATIOS } from './crop'
import type { ToolDef, View } from './types'
import { BrushOverlay, type BrushState } from './brush'
import { busy } from './raster'

// Düzenlenebilir gri maske (önizleme boyutunda): beyaz = konu
export const cutRequest = { auto: false }
const cut = { mask: null as HTMLCanvasElement | null, v: 0, brush: { size: 0.04, hardness: 0.6, erase: false } as BrushState, mode: 'brush' as 'brush' | 'tap', changed: false }
const L = new Set<() => void>()
const emit = () => {
  cut.v++
  if (cut.mask) session.renderer?.setSubjectMask(cut.mask)
  L.forEach((f) => f())
  session.emit()
}
function useCut() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    L.add(h)
    return () => void L.delete(h)
  }, [])
  return cut
}

function setMaskFrom(src: CanvasImageSource) {
  const pv = session.preview!
  const c = document.createElement('canvas')
  c.width = pv.width
  c.height = pv.height
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.drawImage(src, 0, 0, c.width, c.height)
  cut.mask = c
  cut.changed = true
  useEditor.getState().update((d) => void (d.background.useCutout = true))
  emit()
}

async function autoCut(detailed = false) {
  const pv = session.preview
  if (!pv) return
  const m = await busy(useEditor.getState().settings.language === 'en' ? 'Removing background…' : 'Arka plan kaldırılıyor…', () => removeBackground(pv, detailed))
  if (m) setMaskFrom(m)
}
async function personCut() {
  const pv = session.preview
  if (!pv) return
  const r = await busy('…', () => segmentPerson(pv))
  if (!r) return
  const fg = new Float32Array(r.background.length)
  for (let i = 0; i < fg.length; i++) fg[i] = 1 - r.background[i]
  setMaskFrom(maskToCanvas(fg, r.w, r.h))
}

const taps: { x: number; y: number }[] = []
async function tapCut(p: { x: number; y: number }) {
  const pv = session.preview
  if (!pv) return
  taps.push(p)
  const r = await tapSelect(pv, taps)
  setMaskFrom(maskToCanvas(r.data, r.w, r.h))
}

function paint(p: { x: number; y: number }, last?: { x: number; y: number }) {
  const m = cut.mask
  if (!m) return
  const ctx = m.getContext('2d')!
  const r = (cut.brush.size * Math.min(m.width, m.height)) / 2
  const steps = last ? Math.max(1, Math.ceil(Math.hypot((p.x - last.x) * m.width, (p.y - last.y) * m.height) / (r * 0.25))) : 1
  for (let i = 1; i <= steps; i++) {
    const x = (last ? last.x + ((p.x - last.x) * i) / steps : p.x) * m.width
    const y = (last ? last.y + ((p.y - last.y) * i) / steps : p.y) * m.height
    const g = ctx.createRadialGradient(x, y, r * cut.brush.hardness, x, y, r)
    const c = cut.brush.erase ? '0,0,0' : '255,255,255'
    g.addColorStop(0, `rgba(${c},1)`)
    g.addColorStop(1, `rgba(${c},0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  cut.changed = true
}

function CutoutPanel() {
  const tr = useT()
  const c = useCut()
  const doc = useEditor((s) => s.doc)
  useEffect(() => {
    ;(async () => {
      cut.mask = null
      cut.changed = false
      taps.length = 0
      if (session.maskBitmap) setMaskFrom(session.maskBitmap)
      cut.changed = false
      if (cutRequest.auto) {
        cutRequest.auto = false
        for (let i = 0; i < 50 && !session.preview; i++) await new Promise((r) => setTimeout(r, 100))
        await autoCut(false)
      }
    })()
    return () => {
      if (session.maskBitmap) session.renderer?.setSubjectMask(session.maskBitmap)
      else session.renderer?.setSubjectMask(null)
    }
  }, [])
  const apply = async () => {
    if (!cut.mask) return useEditor.getState().closeTool(true)
    await busy(tr('Kaydediliyor…', 'Saving…'), async () => {
      const full = toCanvas(cut.mask!, session.W, session.H)
      await commitMask(full)
    })
    useEditor.getState().closeTool(true)
  }
  const saveSticker = async () => {
    if (!cut.mask) return
    await busy(tr('Hazırlanıyor…', 'Preparing…'), async () => {
      const full = await session.fullBase()
      const out = toCanvas(full)
      full.close()
      const m = toCanvas(cut.mask!, out.width, out.height)
      const md = m.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, out.width, out.height).data
      const octx = out.getContext('2d', { willReadFrequently: true })!
      const id = octx.getImageData(0, 0, out.width, out.height)
      for (let i = 0; i < md.length; i += 4) id.data[i + 3] = md[i]
      octx.putImageData(id, 0, 0)
      const blob = await encodeCanvas(out, 'image/png')
      const path = await platform.exportSave({ bytes: new Uint8Array(await blob.arrayBuffer()), ext: 'png', suggestedName: (useEditor.getState().project?.name || 'kesim') + '-kesim' })
      if (path) useEditor.getState().toast('success', tr('Şeffaf PNG kaydedildi', 'Transparent PNG saved'))
    })
  }
  return (
    <>
      <p className="note">{tr('Konuyu yapay zekâyla ayır, sonra fırçayla düzelt. Kesilmiş fotoğrafa Arka plan sekmesinden yeni zemin ekleyebilirsin.', 'Separate the subject with AI, then refine with the brush. Add a new backdrop from the Backdrop tab.')}</p>
      <div className="presets">
        <button className="btn sm primary" onClick={() => autoCut(false)}>{tr('Otomatik', 'Auto')}</button>
        <button className="btn sm" onClick={() => autoCut(true)}>{tr('Detaylı', 'Detailed')}</button>
        <button className="btn sm" onClick={personCut}>{tr('Kişi (hızlı)', 'Person (fast)')}</button>
        <button className={'btn sm' + (c.mode === 'tap' ? ' primary' : '')} onClick={() => { cut.mode = cut.mode === 'tap' ? 'brush' : 'tap'; emit() }}>{tr('Dokun-seç', 'Tap select')}</button>
      </div>
      {c.mask && (
        <>
          <div className="group-label">{tr('Düzelt', 'Refine')}</div>
          <Segmented items={[{ id: 'keep', label: tr('Geri getir', 'Restore') }, { id: 'erase', label: tr('Sil', 'Erase') }]} value={c.brush.erase ? 'erase' : 'keep'} onChange={(v) => { cut.brush.erase = v === 'erase'; cut.mode = 'brush'; emit() }} />
          <Slider label={tr('Boyut', 'Size')} min={1} max={25} value={Math.round(c.brush.size * 100)} onChange={(v) => { cut.brush.size = v / 100; emit() }} />
          <Slider label={tr('Sertlik', 'Hardness')} value={Math.round(c.brush.hardness * 100)} onChange={(v) => { cut.brush.hardness = v / 100; emit() }} />
          <div className="setting">
            <div><b>{tr('Kesimi göster', 'Show cutout')}</b></div>
            <Switch label="cutout" on={doc.background.useCutout} onChange={(v) => useEditor.getState().update((d) => void (d.background.useCutout = v))} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={saveSticker}>{tr('PNG kaydet', 'Save PNG')}</button>
            <button className="btn sm" onClick={async () => { await apply(); useEditor.getState().setTab('background') }}>{tr('Arka planı değiştir', 'Change backdrop')}</button>
          </div>
        </>
      )}
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => useEditor.getState().closeTool(false)}>{tr('İptal', 'Cancel')}</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={apply}>{tr('Uygula', 'Apply')}</button>
      </div>
    </>
  )
}
function CutoutOverlay({ view }: { view: View }) {
  const c = useCut()
  if (!c.mask && c.mode !== 'tap') return null
  return (
    <BrushOverlay view={view} brush={c.mode === 'tap' ? { size: 0.004, hardness: 1, erase: false } : c.brush}
      onStart={(p) => {
        if (cut.mode === 'tap') void busy('…', () => tapCut(p))
        else { paint(p); emit() }
      }}
      onMove={(p, last) => { if (cut.mode === 'brush') { paint(p, last); emit() } }}
    />
  )
}

// ---------------- Arka plan ----------------
const GRADIENTS: [string, string][] = [['#ffd6a5', '#ff7a7a'], ['#a1c4fd', '#c2e9fb'], ['#fbc2eb', '#a6c1ee'], ['#d4fc79', '#96e6a1'], ['#f6d365', '#fda085'], ['#232526', '#414345'], ['#0f2027', '#2c5364'], ['#ffecd2', '#fcb69f']]
function BackgroundPanel() {
  const tr = useT()
  const bg = useEditor((s) => s.doc.background)
  const hasMask = useEditor((s) => !!s.doc.mask)
  const update = useEditor((s) => s.update)
  const setFill = (f: Fill | null) => update((d) => void (d.background.fill = f))
  const fill = bg.fill
  return (
    <>
      <div className="group-label">{tr('Tuval oranı', 'Canvas ratio')}</div>
      <div className="aspects">
        <button className={!bg.ratio ? 'on' : ''} onClick={() => update((d) => void (d.background.ratio = null))}><span className="box" style={{ width: 18, height: 14, borderStyle: 'dashed' }} />{tr('Yok', 'None')}</button>
        {RATIOS.filter((r) => r.r && r.r > 0).map((a) => (
          <button key={a.id} className={bg.ratio === a.id ? 'on' : ''} onClick={() => update((d) => { d.background.ratio = a.id; if (!d.background.fill) d.background.fill = { type: 'color', color: '#ffffff' } })}>
            <span className="box" style={{ width: a.r! >= 1 ? 22 : 22 * a.r!, height: a.r! >= 1 ? 22 / a.r! : 22 }} />
            {a.label[0]}
          </button>
        ))}
      </div>
      {!hasMask && !bg.ratio && <p className="note">{tr('Zemin; tuval oranı seçildiğinde boşlukta, Kesim yapıldığında konunun arkasında görünür.', 'The backdrop shows in the padding when a ratio is set, or behind the subject after a cutout.')}</p>}
      {hasMask && (
        <div className="setting">
          <div><b>{tr('Kesilmiş konuyu kullan', 'Use the cutout subject')}</b></div>
          <Switch label="cutout" on={bg.useCutout} onChange={(v) => update((d) => void (d.background.useCutout = v))} />
        </div>
      )}
      <div className="group-label">{tr('Renk', 'Color')}</div>
      <ColorRow value={fill?.type === 'color' ? fill.color : fill?.type === 'transparent' ? null : ''} transparent onTransparent={() => setFill({ type: 'transparent' })} onChange={(c) => setFill({ type: 'color', color: c })} />
      <div className="group-label">{tr('Degrade', 'Gradient')}</div>
      <div className="colors">
        {GRADIENTS.map(([a, b]) => (
          <button key={a + b} className={'swatch' + (fill?.type === 'gradient' && fill.from === a ? ' on' : '')} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }} onClick={() => setFill({ type: 'gradient', from: a, to: b, angle: 90 })} aria-label={`${a} → ${b}`} />
        ))}
      </div>
      {fill?.type === 'gradient' && <Slider label={tr('Açı', 'Angle')} min={0} max={360} value={fill.angle} onChange={(v) => setFill({ ...fill, angle: v })} />}
      <div className="group-label">{tr('Bulanık fotoğraf', 'Blurred photo')}</div>
      <Slider label={tr('Bulanıklık', 'Blur')} value={fill?.type === 'blur' ? fill.amount : 0} onChange={(v) => setFill(v ? { type: 'blur', amount: v } : null)} />
      <div className="group-label">{tr('Görsel', 'Image')}</div>
      <button className="btn block" onClick={async () => {
        const files = await platform.openFiles(false)
        if (!files[0]) return
        const ext = files[0].name.split('.').pop()?.toLowerCase() || 'jpg'
        const rel = await putImageAsset(files[0].bytes, ext)
        setFill({ type: 'image', file: rel })
      }}><ImagePlus size={16} /> {tr('Görsel seç', 'Choose image')}</button>
      <button className="btn ghost block" style={{ marginTop: 8 }} onClick={() => update((d) => void (d.background = { ratio: null, fill: null, useCutout: d.background.useCutout }))}>{tr('Zemini kaldır', 'Remove backdrop')}</button>
    </>
  )
}

export const CUTOUT_TOOLS: ToolDef[] = [
  { id: 'cutout', label: ['Kesim', 'Cutout'], icon: Scissors, Panel: CutoutPanel, Overlay: CutoutOverlay, sourceSpace: true, noFooter: true, applied: (d) => !!d.mask }
]
export const BACKGROUND_TOOLS: ToolDef[] = [
  { id: 'background', label: ['Arka plan', 'Backdrop'], icon: Square, Panel: BackgroundPanel, applied: (d) => !!d.background.fill || !!d.background.ratio }
]
void Preset
