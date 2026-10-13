// Rötuş araçlarının ortak parçaları: yüz seçici kaplama, taraf seçici, yüz düzenleme erişimi.
import { useEffect, useState } from 'react'
import type { EditDoc, FaceEdit } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { session } from '@/engine/session'
import { FaceGeo, OVAL } from '@/engine/face'
import { useT } from '@/lib/i18n'
import { Segmented } from '@/components/ui'
import type { View } from './types'

export function emptyFace(index: number): FaceEdit {
  return { index, side: 'both', shape: {}, skin: {}, makeup: {} }
}

/** Seçili yüzün düzenlemesini değiştir (yoksa oluşturur). */
export function editFace(d: EditDoc, index: number, fn: (f: FaceEdit) => void) {
  let f = d.retouch.faces.find((x) => x.index === index)
  if (!f) {
    f = emptyFace(index)
    d.retouch.faces.push(f)
  }
  fn(f)
}

export function useFace(): FaceEdit {
  const idx = useEditor((s) => s.selectedFace)
  const f = useEditor((s) => s.doc.retouch.faces.find((x) => x.index === idx))
  return f ?? emptyFace(idx)
}

export function useFaceCount() {
  const [n, setN] = useState(session.faces?.length ?? 0)
  useEffect(() => session.onChange(() => setN(session.faces?.length ?? 0)), [])
  return n
}

/** Tüm uygulanan yüzlere aynı değeri uygula seçeneği. */
export function setFaceValue(group: 'shape' | 'skin', key: string, v: number, all = false) {
  const st = useEditor.getState()
  const n = session.faces?.length ?? 1
  st.update((d) => {
    const targets = all ? Array.from({ length: n }, (_, i) => i) : [st.selectedFace]
    for (const i of targets) editFace(d, i, (f) => void (f[group][key] = v))
  })
}

export function FaceOverlay({ view }: { view: View }) {
  const n = useFaceCount()
  const sel = useEditor((s) => s.selectedFace)
  const select = useEditor((s) => s.selectFace)
  const tr = useT()
  if (!session.faces || n < 1) return null
  const geos = session.faces.map((f) => new FaceGeo(f, 1, 1))
  if (n === 1) return null
  return (
    <>
      {geos.map((g, i) => {
        const xs = OVAL.map((k) => g.p(k).x), ys = OVAL.map((k) => g.p(k).y)
        const a = view.toScreen(Math.min(...xs), Math.min(...ys))
        const b = view.toScreen(Math.max(...xs), Math.max(...ys))
        return (
          <button
            key={i}
            className={'face-box' + (i === sel ? ' on' : '')}
            style={{ left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => select(i)}
            aria-label={tr(`${i + 1}. yüzü seç`, `Select face ${i + 1}`)}
            aria-pressed={i === sel}
          />
        )
      })}
      <div className="hint">{tr('Düzenlemek istediğin yüze tıkla', 'Click the face you want to edit')}</div>
    </>
  )
}

export function SidePicker() {
  const tr = useT()
  const f = useFace()
  const idx = useEditor((s) => s.selectedFace)
  return (
    <Segmented
      items={[{ id: 'both', label: tr('İki taraf', 'Both') }, { id: 'left', label: tr('Sol', 'Left') }, { id: 'right', label: tr('Sağ', 'Right') }]}
      value={f.side}
      onChange={(v) => useEditor.getState().update((d) => editFace(d, idx, (x) => void (x.side = v)))}
    />
  )
}

export function NoFace() {
  const tr = useT()
  const n = useFaceCount()
  const busy = useEditor((s) => s.busy)
  if (n > 0 || busy) return null
  return <div className="card"><b>{tr('Yüz bulunamadı', 'No face found')}</b><div className="note">{tr('Bu araç, fotoğrafta net görünen bir yüz gerektirir. Daha büyük ya da önden çekilmiş bir portre dene.', 'This tool needs a clearly visible face. Try a larger or front-facing portrait.')}</div></div>
}

export function ApplyAll({ group, keys }: { group: 'shape' | 'skin'; keys: string[] }) {
  const tr = useT()
  const n = useFaceCount()
  const f = useFace()
  if (n < 2) return null
  return (
    <button className="btn ghost sm block" onClick={() => { for (const k of keys) if (f[group][k] !== undefined) setFaceValue(group, k, f[group][k], true) }}>
      {tr('Tüm yüzlere uygula', 'Apply to all faces')}
    </button>
  )
}
