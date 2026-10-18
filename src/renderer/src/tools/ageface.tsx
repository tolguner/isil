// Yaş ve ifade: seçili yüzde gülümseme, ciddi ifade, gözleri açma, gençleştirme ve yaşlandırma (yerel FLUX.2 klein).
// Her deneme asıl fotoğraftan yapılır (üst üste binmez); Uygula ile kalıcı olur.
import { useEffect, useState } from 'react'
import { Smile } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Slider } from '@/components/ui'
import { session } from '@/engine/session'
import { FACE_CHANGES, changeFace, type FaceChange } from '@/ai/ageface'
import { toCanvas } from '@/ai/ops'
import { FaceOverlay, NoFace, useFaceCount } from './faceui'
import { WorkFooter, WorkOverlayImage, setWorkResult, useWork, useWorkLifecycle, work } from './raster'
import type { ToolDef, View } from './types'

/** Yüz bu genişlikten (px, tam çözünürlük) küçükse sonuç uydurma olur; araç uyarır. */
const MIN_FACE = 90
let original: HTMLCanvasElement | null = null

function AgeFacePanel() {
  const tr = useT()
  useWorkLifecycle()
  const w = useWork()
  const n = useFaceCount()
  const sel = useEditor((s) => s.selectedFace)
  const [cur, setCur] = useState<FaceChange | null>(null)
  const [power, setPower] = useState(0)
  useEffect(() => () => { original = null }, [])
  if (w.full && !w.changed && !original) original = toCanvas(w.full)
  const geo = () => {
    const src = original ?? w.full
    return src ? session.faceGeos(src.width, src.height)[sel] : undefined
  }
  const g = n > 0 ? geo() : undefined
  const small = !!g && g.width < MIN_FACE
  const run = async (id: FaceChange, p = power) => {
    const src = original ?? work.full
    const fg = geo()
    if (!src || !fg) return
    setCur(id)
    const def = FACE_CHANGES.find((x) => x.id === id)!
    try {
      const out = await changeFace(src, fg, id, Math.max(0.3, Math.min(0.95, def.strength + p / 100)))
      if (out) setWorkResult(out)
    } catch (e) {
      useEditor.getState().toast('error', String((e as Error).message ?? e))
    }
  }
  const group = (gid: 'expr' | 'age', title: string) => (
    <>
      <div className="group-label">{title}</div>
      <div className="presets" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        {FACE_CHANGES.filter((x) => x.group === gid).map((x) => (
          <button key={x.id} className={'btn sm' + (cur === x.id ? ' primary' : '')} aria-pressed={cur === x.id} disabled={!g || small} onClick={() => void run(x.id)}>{tr(x.label[0], x.label[1])}</button>
        ))}
      </div>
    </>
  )
  return (
    <>
      <NoFace />
      <p className="note">{tr('Seçtiğin yüzün ifadesini ya da yaşını yapay zekâyla değiştirir; yüzün dışı aynen kalır. Bilgisayarında çalışır, her deneme 20–60 saniye sürebilir.', 'Changes the expression or age of the selected face with AI; everything outside the face stays the same. Runs on your computer; each try can take 20–60 seconds.')}</p>
      {small && <div className="card"><b>{tr('Yüz çok küçük', 'Face too small')}</b><div className="note">{tr('Bu fotoğraftaki yüz, güvenilir bir sonuç için çok küçük. Yüzün daha yakından çekildiği bir fotoğraf dene ya da önce kırp.', 'This face is too small for a reliable result. Try a closer photo or crop first.')}</div></div>}
      {group('expr', tr('İfade', 'Expression'))}
      {group('age', tr('Yaş', 'Age'))}
      <Slider plain label={tr('Etki', 'Strength')} min={-20} max={15} def={0} value={power} onChange={setPower} onCommit={() => { if (cur && w.changed) void run(cur, power) }} />
      <p className="note">{tr('Etki arttıkça değişim belirginleşir ama yüz kişiye daha az benzeyebilir.', 'More strength gives a bigger change but the face may look less like the person.')}</p>
      <WorkFooter type="gen" params={{ tool: 'ageface', change: cur, face: sel }} />
    </>
  )
}

function AgeFaceOverlay({ view }: { view: View }) {
  return (
    <>
      <WorkOverlayImage view={view} />
      <FaceOverlay view={view} />
    </>
  )
}

export const AGEFACE_TOOL: ToolDef = {
  id: 'ageface', label: ['Yaş ve ifade', 'Age & expression'], icon: Smile, Panel: AgeFacePanel, Overlay: AgeFaceOverlay,
  sourceSpace: true, needs: ['faces'], noFooter: true, badge: 'YZ',
  sliders: [{ label: ['Gülümse', 'Smile'] }, { label: ['Yaşlandır', 'Make older'] }, { label: ['Gençleştir', 'Make younger'] }, { label: ['Gözleri aç', 'Open eyes'] }]
}
