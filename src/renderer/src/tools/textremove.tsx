// Metin silme: fotoğraftaki yazılar bilgisayarında bulunur (PP-OCRv4 algılayıcı), seçilenler LaMa ya da
// üretken doldurmayla silinir. Tuvalde bir kutuya tıklayarak seçimi değiştirebilirsin.
import { useEffect, useState } from 'react'
import { Type } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { detectText, faceRects } from '@/ai/text'
import { session } from '@/engine/session'
import { inpaintTiles } from '@/ai/ops'
import { generativeErase } from '@/ai/generative'
import { FillMethod, eraseOpts } from './fill'
import { WorkFooter, WorkOverlayImage, busy, setWorkResult, useWork, useWorkLifecycle, work } from './raster'
import type { ToolDef, View } from './types'

type Box = { x: number; y: number; w: number; h: number; on: boolean }
const st = { boxes: [] as Box[], key: '', v: 0 }
const L = new Set<() => void>()
const emit = () => { st.v++; L.forEach((f) => f()) }
function useSt() {
  const [, f] = useState(0)
  useEffect(() => { const h = () => f((x) => x + 1); L.add(h); return () => void L.delete(h) }, [])
  return st
}

async function find() {
  if (!work.preview) return
  // yüzlerin içi (göz, ağız) yazı sanılmasın diye yüz kutuları dışarıda bırakılır
  const faces = await session.ensureFaces().catch(() => [])
  const r = await detectText(work.preview, faceRects(faces))
  st.boxes = (r?.boxes ?? []).map((b) => ({ ...b, on: true }))
  emit()
}

function maskFor(W: number, H: number) {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#fff'
  for (const b of st.boxes) if (b.on) { ctx.beginPath(); ctx.roundRect(b.x * W, b.y * H, b.w * W, b.h * H, b.h * H * 0.25); ctx.fill() }
  return c
}

async function removeSelected(tr: (a: string, b: string) => string) {
  if (!work.full || !st.boxes.some((b) => b.on)) return
  const full = work.full
  const m = maskFor(full.width, full.height)
  const job = async () => {
    if (eraseOpts.gen) {
      const res = await generativeErase(full, m)
      if (res) setWorkResult(res)
    } else {
      const out = document.createElement('canvas')
      out.width = full.width
      out.height = full.height
      out.getContext('2d')!.drawImage(full, 0, 0)
      if (!(await inpaintTiles(out, m.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, out.width, out.height)))) throw new Error(tr('Onarım modeli (LaMa) yüklenemedi', 'Inpainting model (LaMa) could not be loaded'))
      setWorkResult(out)
    }
    st.boxes = st.boxes.filter((b) => !b.on)
    emit()
  }
  if (eraseOpts.gen) await job().catch((e) => useEditor.getState().toast('error', String((e as Error).message)))
  else await busy(tr('Yazılar siliniyor…', 'Removing text…'), job)
}

function TextRemovePanel() {
  const tr = useT()
  useWorkLifecycle()
  const w = useWork()
  const s = useSt()
  useEffect(() => {
    if (w.preview && s.key !== w.key && !w.changed) {
      st.key = w.key
      void busy(tr('Yazılar aranıyor…', 'Finding text…'), find)
    }
  }, [w.preview, w.key])
  useEffect(() => () => { st.boxes = []; st.key = '' }, [])
  const sel = s.boxes.filter((b) => b.on).length
  return (
    <>
      <p className="note">{tr('Fotoğraftaki yazılar (tabela, alt yazı, tarih damgası) bilgisayarında bulunur ve silinir. Tuvalde bir kutuya tıklayarak seçimi değiştirebilirsin. Başkasına ait filigranları silmek için kullanma.', 'Text in the photo (signs, captions, date stamps) is found on your computer and removed. Click a box on the canvas to toggle it. Do not use this to remove other people\'s watermarks.')}</p>
      <div className="note" aria-live="polite">{s.boxes.length ? tr(`${s.boxes.length} yazı bulundu, ${sel} tanesi silinecek.`, `${s.boxes.length} text areas found, ${sel} selected.`) : tr('Yazı bulunamadı.', 'No text found.')}</div>
      <FillMethod />
      <button className="btn primary block" disabled={!sel} onClick={() => void removeSelected(tr)}><Type size={16} /> {tr('Seçili yazıları sil', 'Remove selected text')}</button>
      <WorkFooter type="inpaint" params={{ tool: 'text' }} />
    </>
  )
}

function TextOverlay({ view }: { view: View }) {
  const s = useSt()
  const tr = useT()
  return (
    <>
      <WorkOverlayImage view={view} />
      {s.boxes.map((b, i) => {
        const a = view.toScreen(b.x, b.y), z = view.toScreen(b.x + b.w, b.y + b.h)
        return (
          <button key={i} className={'text-box' + (b.on ? ' on' : '')} style={{ left: a.x, top: a.y, width: z.x - a.x, height: z.y - a.y }}
            aria-pressed={b.on} aria-label={tr(`${i + 1}. yazı`, `Text ${i + 1}`)}
            onPointerDown={(e) => e.stopPropagation()} onClick={() => { b.on = !b.on; emit() }} />
        )
      })}
    </>
  )
}

export const TEXT_REMOVE_TOOL: ToolDef = {
  id: 'textremove', label: ['Metin sil', 'Remove text'], icon: Type, Panel: TextRemovePanel, Overlay: TextOverlay,
  sourceSpace: true, noFooter: true, badge: 'YZ'
}
