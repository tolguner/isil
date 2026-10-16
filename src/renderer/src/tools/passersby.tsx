// Yoldan geçenleri sil: kişileri yerelde bul, ana kişiyi koru, seçilenleri LaMa ile karo karo sil.
// Rakip incelemesi: Peachy'de bu iş bulutta ve sessizce başarısız oluyordu; Işıl'da her şey bilgisayarda.
import { useEffect, useState } from 'react'
import { UserMinus } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Switch } from '@/components/ui'
import { detectPeople, personMaskInBox, type PersonBox } from '@/ai/vision'
import { inpaintTiles } from '@/ai/ops'
import { generativeErase } from '@/ai/generative'
import { FillMethod, eraseOpts } from './fill'
import type { ToolDef, View } from './types'
import { WorkFooter, WorkOverlayImage, busy, setWorkResult, useWork, useWorkLifecycle, work, workEmit } from './raster'

interface Person { box: PersonBox; mask: Float32Array; selected: boolean; main: boolean }
const st = { people: [] as Person[], key: '', shadow: false, v: 0 }
const listeners = new Set<() => void>()
const emit = () => { st.v++; listeners.forEach((f) => f()) }
function usePeople() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    listeners.add(h)
    return () => void listeners.delete(h)
  }, [])
  return st
}

/**
 * Ön seçim kuralı (kullanıcı her kişiyi tek tek değiştirebilir):
 * en uzun kişinin boyunun %60'ı ve üstündeki kişiler "ana kişi" sayılır ve korunur; diğerleri silinmek üzere seçilir.
 * Tek kişi bulunduysa hiçbiri seçilmez.
 */
export function preselect(boxes: PersonBox[]): boolean[] {
  if (boxes.length < 2) return boxes.map(() => false)
  const hmax = Math.max(...boxes.map((b) => b.h))
  return boxes.map((b) => b.h < hmax * 0.6)
}

async function findPeople() {
  if (!work.preview) return
  const pv = work.preview
  const boxes = await detectPeople(pv)
  const sel = preselect(boxes)
  const people: Person[] = []
  for (const [i, b] of boxes.entries()) people.push({ box: b, mask: await personMaskInBox(pv, b, pv.width, pv.height), selected: sel[i], main: !sel[i] && boxes.length > 1 })
  st.people = people
  st.key = work.key
  emit()
  paintMask()
}

/** Seçili kişilerin birleşik maskesi (önizleme boyutu), biraz genişletilmiş; gölge seçeneğinde aşağı uzatılmış. */
function paintMask() {
  const m = work.mask
  if (!m) return
  m.clear()
  const W = m.w, H = m.h
  const id = m.ctx.createImageData(W, H)
  for (const p of st.people) {
    if (!p.selected) continue
    const x0 = Math.max(0, Math.floor(p.box.x * W)), x1 = Math.min(W, Math.ceil((p.box.x + p.box.w) * W))
    for (let i = 0; i < W * H; i++) if (p.mask[i] > 0.4) id.data[i * 4 + 3] = 255
    if (st.shadow) {
      // gölge ve yansıma: her sütunda kişinin en alt noktasından boyunun ~%35'i kadar aşağı
      const ext = Math.round(p.box.h * H * 0.35)
      for (let x = x0; x < x1; x++) {
        let last = -1
        for (let y = 0; y < H; y++) if (p.mask[y * W + x] > 0.4) last = y
        if (last >= 0) for (let y = last + 1; y <= Math.min(H - 1, last + ext); y++) id.data[(y * W + x) * 4 + 3] = 255
      }
    }
  }
  for (let i = 0; i < W * H; i++) id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = 255
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  c.getContext('2d')!.putImageData(id, 0, 0)
  // kenar artıkları kalmasın: maskeyi birkaç piksel genişlet
  m.ctx.filter = `blur(${Math.max(2, W / 400)}px)`
  m.ctx.drawImage(c, 0, 0)
  m.ctx.drawImage(c, 0, 0)
  m.ctx.filter = 'none'
  m.dirty = true
  workEmit()
}

async function removeSelected(tr: (a: string, b: string) => string) {
  if (!work.full || !work.mask || !st.people.some((p) => p.selected)) return
  const gen = eraseOpts.gen
  const job = async () => {
    const full = work.full!
    const g = document.createElement('canvas')
    g.width = full.width
    g.height = full.height
    const gctx = g.getContext('2d', { willReadFrequently: true })!
    gctx.drawImage(work.mask!.toGray(), 0, 0, g.width, g.height)
    const out = document.createElement('canvas')
    out.width = full.width
    out.height = full.height
    out.getContext('2d')!.drawImage(full, 0, 0)
    if (gen) {
      const res = await generativeErase(full, g)
      if (!res) return
      setWorkResult(res)
    } else {
      if (!(await inpaintTiles(out, gctx.getImageData(0, 0, g.width, g.height)))) throw new Error(tr('Onarım modeli (LaMa) yüklenemedi', 'Inpainting model (LaMa) could not be loaded'))
      setWorkResult(out)
    }
    st.people = st.people.filter((p) => !p.selected)
    emit()
  }
  // FLUX kendi ilerleme göstergesini açar; LaMa yolunda meşgul göstergesi
  if (gen) await job().catch((e) => useEditor.getState().toast('error', String((e as Error).message)))
  else await busy(tr('Siliniyor…', 'Removing…'), job)
}

function PassersbyPanel() {
  const tr = useT()
  useWorkLifecycle()
  const w = useWork()
  const s = usePeople()
  useEffect(() => {
    if (w.preview && s.key !== w.key && !w.changed) {
      s.key = w.key
      void busy(tr('Kişiler aranıyor…', 'Finding people…'), findPeople)
    }
  }, [w.preview, w.key])
  useEffect(() => () => { st.people = []; st.key = '' }, [])
  const sel = s.people.filter((p) => p.selected).length
  const setAll = (v: boolean) => { for (const p of s.people) if (!p.main) p.selected = v; emit(); paintMask() }
  return (
    <>
      <p className="note">{tr('Fotoğraftaki kişiler bilgisayarında bulunur. Ana kişi korunur, diğerleri silinmek üzere seçilir. Tuvalde bir kişiye tıklayarak seçimi değiştirebilirsin.', 'People are found on your computer. The main subject is kept; others are selected for removal. Click a person on the canvas to change the selection.')}</p>
      <div className="note" aria-live="polite">{s.people.length ? tr(`${s.people.length} kişi bulundu, ${sel} kişi silinecek.`, `${s.people.length} people found, ${sel} selected for removal.`) : tr('Henüz kişi bulunamadı.', 'No people found yet.')}</div>
      <div className="row">
        <button className="btn ghost sm" onClick={() => setAll(true)}>{tr('Ana kişi dışındakileri seç', 'Select all but main')}</button>
        <button className="btn ghost sm" onClick={() => setAll(false)}>{tr('Seçimi temizle', 'Clear')}</button>
      </div>
      <div className="setting" style={{ padding: '4px 0' }}>
        <div><b>{tr('Gölge ve yansımayı da sil', 'Also remove shadow and reflection')}</b><span>{tr('Kişinin altındaki gölge ya da sudaki yansıma kalmasın', 'So no shadow or reflection is left behind')}</span></div>
        <Switch on={s.shadow} onChange={(v) => { st.shadow = v; emit(); paintMask() }} label={tr('Gölge ve yansımayı da sil', 'Also remove shadow and reflection')} />
      </div>
      <FillMethod />
      <button className="btn primary block" disabled={!sel} onClick={() => void removeSelected(tr)}><UserMinus size={16} /> {tr('Seçilenleri sil', 'Remove selected')}</button>
      <p className="note">{tr('Bulunamayan biri varsa Akıllı seçim ile tıklayarak silebilirsin.', 'If someone was missed, remove them with Smart select.')}</p>
      <WorkFooter type="inpaint" params={{ tool: 'passersby' }} />
    </>
  )
}

function PassersbyOverlay({ view }: { view: View }) {
  const tr = useT()
  const s = usePeople()
  useWork()
  return (
    <>
      <WorkOverlayImage view={view} />
      <MaskTint view={view} />
      {s.people.map((p, i) => {
        const a = view.toScreen(p.box.x, p.box.y), b = view.toScreen(p.box.x + p.box.w, p.box.y + p.box.h)
        const label = p.main ? tr('Ana kişi', 'Main subject') : p.selected ? tr('Silinecek', 'Will be removed') : tr('Korunacak', 'Kept')
        return (
          <button
            key={i}
            className={'person-box' + (p.selected ? ' on' : '') + (p.main ? ' main' : '')}
            style={{ left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => { p.selected = !p.selected; emit(); paintMask() }}
            aria-pressed={p.selected}
            aria-label={`${tr('Kişi', 'Person')} ${i + 1}: ${label}`}
            title={label}
          />
        )
      })}
    </>
  )
}

/** Silinecek bölgeyi kırmızımsı göster. */
function MaskTint({ view }: { view: View }) {
  const w = useWork()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const m = w.mask
    if (!m) return setUrl(null)
    const c = document.createElement('canvas')
    c.width = m.w
    c.height = m.h
    const ctx = c.getContext('2d')!
    ctx.drawImage(m.canvas, 0, 0)
    ctx.globalCompositeOperation = 'source-in'
    ctx.fillStyle = 'rgba(255,90,95,0.45)'
    ctx.fillRect(0, 0, m.w, m.h)
    setUrl(c.toDataURL())
  }, [w.v])
  if (!url) return null
  const tl = view.toScreen(0, 0)
  return <img src={url} alt="" style={{ position: 'absolute', left: tl.x, top: tl.y, width: view.size.w, height: view.size.h, pointerEvents: 'none' }} />
}

export const PASSERSBY_TOOL: ToolDef = {
  id: 'passersby', label: ['Yoldan geçenler', 'Passers-by'], icon: UserMinus, Panel: PassersbyPanel, Overlay: PassersbyOverlay, sourceSpace: true, noFooter: true, badge: 'YZ'
}
