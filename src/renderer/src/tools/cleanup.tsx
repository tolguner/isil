import { useState } from 'react'
import { Eraser, MousePointerClick, Stamp, Grid3x3, WandSparkles } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Slider, Segmented } from '@/components/ui'
import { inpaint, toCanvas } from '@/ai/ops'
import { tapSelect, resetTapSelect } from '@/ai/vision'
import { localMaskedEdit, grayToAlpha } from '@/ai/generative'
import type { ToolDef, View } from './types'
import { BrushOverlay, type BrushState } from './brush'
import { WorkFooter, WorkOverlayImage, busy, fullMask, setWorkResult, useWork, useWorkLifecycle, work, workEmit } from './raster'

const brush: BrushState = { size: 0.05, hardness: 0.7, erase: false }

function BrushControls() {
  const tr = useT()
  const [, f] = useState(0)
  return (
    <>
      <Segmented items={[{ id: 'paint', label: tr('Boya', 'Paint') }, { id: 'erase', label: tr('Sil', 'Erase') }]} value={brush.erase ? 'erase' : 'paint'} onChange={(v) => { brush.erase = v === 'erase'; f((x) => x + 1) }} />
      <Slider label={tr('Fırça boyutu', 'Brush size')} min={1} max={25} value={Math.round(brush.size * 100)} onChange={(v) => { brush.size = v / 100; f((x) => x + 1); workEmit() }} />
    </>
  )
}

function maskEmpty() {
  return !work.mask || work.mask.isEmpty()
}

// ---------- Sihirli silgi ----------
async function runErase() {
  if (!work.full || maskEmpty()) return
  const res = await busy(useEditor.getState().settings.language === 'en' ? 'Removing…' : 'Siliniyor…', () => inpaint(work.full!, fullMask()))
  if (res) setWorkResult(res)
}

function ErasePanel() {
  const tr = useT()
  useWorkLifecycle()
  const w = useWork()
  return (
    <>
      <p className="note">{tr('Silmek istediğin nesnenin üzerini boya, sonra Kaldır’a bas. Arka plan yapay zekâyla bilgisayarında doldurulur.', 'Paint over what you want gone, then press Remove. The background is filled by AI on your computer.')}</p>
      <BrushControls />
      <button className="btn primary block" disabled={!w.mask} onClick={runErase}><Eraser size={16} /> {tr('Kaldır', 'Remove')}</button>
      <WorkFooter type="erase" />
    </>
  )
}

function PaintOverlay({ view }: { view: View }) {
  const w = useWork()
  return (
    <>
      <WorkOverlayImage view={view} />
      <BrushOverlay view={view} brush={brush} mask={w.mask} tint="rgba(255,90,95,0.45)" version={w.v} />
    </>
  )
}

// ---------- Akıllı seçim (dokun) ----------
const tap = { pos: [] as { x: number; y: number }[], neg: [] as { x: number; y: number }[], mode: 'add' as 'add' | 'sub' }

async function runTap() {
  if (!work.preview || !work.mask) return
  if (!tap.pos.length) {
    work.mask.clear()
    workEmit()
    return
  }
  const r = await tapSelect(work.preview, tap.pos, tap.neg)
  const m = work.mask
  m.clear()
  const c = document.createElement('canvas')
  c.width = r.w
  c.height = r.h
  const ctx = c.getContext('2d')!
  const id = ctx.createImageData(r.w, r.h)
  for (let i = 0; i < r.w * r.h; i++) {
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255
    id.data[i * 4 + 3] = r.data[i] > 0.5 ? 255 : 0
  }
  ctx.putImageData(id, 0, 0)
  // biraz genişlet
  m.ctx.filter = `blur(${Math.max(2, m.w / 300)}px)`
  m.ctx.drawImage(c, 0, 0, m.w, m.h)
  m.ctx.drawImage(c, 0, 0, m.w, m.h)
  m.ctx.filter = 'none'
  m.dirty = true
  workEmit()
}

function SmartPanel() {
  const tr = useT()
  useWorkLifecycle()
  const [mode, setMode] = useState(tap.mode)
  return (
    <>
      <p className="note">{tr('Kaldırmak istediğin nesneye tıkla; yapay zekâ nesneyi bütün olarak seçer. Fazlası seçildiyse "Çıkar" ile tıkla.', 'Click the object to remove; AI selects it whole. If too much is selected, click with "Subtract".')}</p>
      <Segmented items={[{ id: 'add', label: tr('Ekle', 'Add') }, { id: 'sub', label: tr('Çıkar', 'Subtract') }]} value={mode} onChange={(v) => { tap.mode = v; setMode(v) }} />
      <div className="row">
        <button className="btn ghost sm" onClick={() => { tap.pos = []; tap.neg = []; void runTap() }}>{tr('Seçimi temizle', 'Clear selection')}</button>
      </div>
      <button className="btn primary block" style={{ marginTop: 8 }} onClick={async () => { await runErase(); tap.pos = []; tap.neg = []; resetTapSelect() }}><Eraser size={16} /> {tr('Kaldır', 'Remove')}</button>
      <WorkFooter type="erase" />
    </>
  )
}
function SmartOverlay({ view }: { view: View }) {
  const w = useWork()
  const tr = useT()
  return (
    <>
      <WorkOverlayImage view={view} />
      <BrushOverlay view={view} brush={{ size: 0.001, hardness: 1, erase: false }} mask={w.mask} tint="rgba(255,181,71,0.5)" version={w.v}
        onStart={(p) => {
          if (tap.mode === 'add') tap.pos.push(p)
          else tap.neg.push(p)
          void busy(tr('Seçiliyor…', 'Selecting…'), runTap)
        }} />
      {[...tap.pos.map((p) => ({ ...p, c: '#4fd18b' })), ...tap.neg.map((p) => ({ ...p, c: '#ff7a7a' }))].map((p, i) => {
        const s = view.toScreen(p.x, p.y)
        return <div key={i} style={{ position: 'absolute', left: s.x - 6, top: s.y - 6, width: 12, height: 12, borderRadius: '50%', background: p.c, border: '2px solid #fff', pointerEvents: 'none' }} />
      })}
    </>
  )
}

// ---------- Klonla ----------
const clone = { src: null as { x: number; y: number } | null, offset: null as { x: number; y: number } | null, setting: true }
function applyClone() {
  if (!work.full || !clone.offset || maskEmpty()) return
  const W = work.full.width, H = work.full.height
  const shifted = document.createElement('canvas')
  shifted.width = W
  shifted.height = H
  const sctx = shifted.getContext('2d')!
  sctx.drawImage(work.full, -clone.offset.x * W, -clone.offset.y * H)
  sctx.globalCompositeOperation = 'destination-in'
  sctx.drawImage(grayToAlpha(fullMask(), W, H), 0, 0)
  const out = toCanvas(work.full)
  out.getContext('2d')!.drawImage(shifted, 0, 0)
  setWorkResult(out)
}
function ClonePanel() {
  const tr = useT()
  useWorkLifecycle()
  const [, f] = useState(0)
  return (
    <>
      <p className="note">{tr('Önce "Kaynak seç" ile kopyalanacak yere tıkla, sonra düzeltilecek yeri boya. Fırçayı bırakınca uygulanır.', 'First click "Pick source" and click where to copy from, then paint the area to fix. Applied when you release.')}</p>
      <button className={'btn block' + (clone.setting ? ' primary' : '')} onClick={() => { clone.setting = true; f((x) => x + 1) }}>{tr('Kaynak seç', 'Pick source')}</button>
      <BrushControls />
      <WorkFooter type="clone" />
    </>
  )
}
function CloneOverlay({ view }: { view: View }) {
  const w = useWork()
  const [, f] = useState(0)
  const s = clone.src ? view.toScreen(clone.src.x, clone.src.y) : null
  return (
    <>
      <WorkOverlayImage view={view} />
      <BrushOverlay view={view} brush={brush} mask={clone.setting ? null : w.mask} tint="rgba(79,209,139,0.4)" version={w.v}
        onStart={(p) => {
          if (clone.setting) {
            clone.src = p
            clone.setting = false
            clone.offset = null
            f((x) => x + 1)
            return
          }
          if (clone.src && !clone.offset) clone.offset = { x: p.x - clone.src.x, y: p.y - clone.src.y }
        }}
        onEnd={() => {
          if (!clone.setting) applyClone()
        }} />
      {s && <div style={{ position: 'absolute', left: s.x - 10, top: s.y - 10, width: 20, height: 20, borderRadius: '50%', border: '2px dashed #4fd18b', pointerEvents: 'none' }} />}
    </>
  )
}

// ---------- Mozaik ----------
const mosaic = { cell: 30 }
function applyMosaic() {
  if (!work.full || maskEmpty()) return
  const W = work.full.width, H = work.full.height
  const cell = Math.max(4, (Math.max(W, H) * mosaic.cell) / 2000)
  const small = toCanvas(work.full, W / cell, H / cell)
  const pix = document.createElement('canvas')
  pix.width = W
  pix.height = H
  const pctx = pix.getContext('2d')!
  pctx.imageSmoothingEnabled = false
  pctx.drawImage(small, 0, 0, W, H)
  pctx.globalCompositeOperation = 'destination-in'
  pctx.drawImage(grayToAlpha(fullMask(), W, H), 0, 0)
  const out = toCanvas(work.full)
  out.getContext('2d')!.drawImage(pix, 0, 0)
  setWorkResult(out)
}
function MosaicPanel() {
  const tr = useT()
  useWorkLifecycle()
  const [, f] = useState(0)
  return (
    <>
      <p className="note">{tr('Gizlemek istediğin alanı boya; bırakınca pikselleşir.', 'Paint over what to hide; it pixelates when you release.')}</p>
      <BrushControls />
      <Slider label={tr('Piksel boyutu', 'Cell size')} min={6} max={80} value={mosaic.cell} onChange={(v) => { mosaic.cell = v; f((x) => x + 1) }} />
      <WorkFooter type="mosaic" />
    </>
  )
}
function MosaicOverlay({ view }: { view: View }) {
  const w = useWork()
  return (
    <>
      <WorkOverlayImage view={view} />
      <BrushOverlay view={view} brush={brush} mask={w.mask} tint="rgba(120,140,255,0.4)" version={w.v} onEnd={applyMosaic} />
    </>
  )
}

// ---------- YZ ile değiştir ----------
function ReplacePanel() {
  const tr = useT()
  useWorkLifecycle()
  const [prompt, setPrompt] = useState('')
  return (
    <>
      <p className="note">{tr('Değiştirmek istediğin yeri boya ve yerine ne geleceğini yaz. FLUX.2 klein ile bilgisayarında çalışır (20–60 sn).', 'Paint what to change and describe the replacement. Runs on your computer with FLUX.2 klein (20–60 s).')}</p>
      <BrushControls />
      <label className="field">
        <span>{tr('Yerine ne gelsin?', 'Replace with')}</span>
        <textarea className="textarea" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={tr('Örn: pembe bir çiçek buketi', 'e.g. a bouquet of pink flowers')} />
      </label>
      <button className="btn primary block" disabled={!prompt.trim()} onClick={async () => {
        if (!work.full || maskEmpty()) {
          useEditor.getState().toast('info', tr('Önce değiştirilecek alanı boya.', 'Paint the area to change first.'))
          return
        }
        try {
          const res = await localMaskedEdit(work.full!, fullMask(), prompt.trim())
          if (res) setWorkResult(res)
        } catch (e) {
          useEditor.getState().toast('error', String((e as Error).message))
        }
      }}><WandSparkles size={16} /> {tr('Oluştur', 'Generate')}</button>
      <WorkFooter type="gen" params={{ prompt }} />
    </>
  )
}

export const CLEANUP_TOOLS: ToolDef[] = [
  { id: 'erase', label: ['Sihirli silgi', 'Magic eraser'], icon: Eraser, Panel: ErasePanel, Overlay: PaintOverlay, sourceSpace: true, noFooter: true },
  { id: 'smart', label: ['Akıllı seçim', 'Smart select'], icon: MousePointerClick, Panel: SmartPanel, Overlay: SmartOverlay, sourceSpace: true, noFooter: true },
  { id: 'clone', label: ['Klonla', 'Clone'], icon: Stamp, Panel: ClonePanel, Overlay: CloneOverlay, sourceSpace: true, noFooter: true },
  { id: 'mosaic', label: ['Mozaik', 'Mosaic'], icon: Grid3x3, Panel: MosaicPanel, Overlay: MosaicOverlay, sourceSpace: true, noFooter: true },
  { id: 'replace', label: ['YZ ile değiştir', 'AI replace'], icon: WandSparkles, Panel: ReplacePanel, Overlay: PaintOverlay, sourceSpace: true, noFooter: true, badge: 'YZ' }
]
