import { resetGenerated } from '@/lib/aiflag'
// Raster araçları için ortak çalışma görüntüsü: tam çözünürlük + önizleme, art arda işlemler, uygula/iptal.
import { useEffect, useRef, useState } from 'react'
import { useEditor } from '@/store/editor'
import { session } from '@/engine/session'
import { commitRaster } from '@/lib/projects'
import { useT } from '@/lib/i18n'
import { ToolFoot } from '@/components/ui'
import { toCanvas } from '@/ai/ops'
import type { RasterOpType } from '@shared/schema'
import type { View } from './types'
import { PaintMask } from './brush'

export const work = {
  full: null as HTMLCanvasElement | null,
  preview: null as HTMLCanvasElement | null,
  mask: null as PaintMask | null,
  changed: false,
  v: 0,
  key: ''
}
const listeners = new Set<() => void>()
export const workEmit = () => {
  work.v++
  listeners.forEach((f) => f())
}
export function useWork() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    listeners.add(h)
    return () => void listeners.delete(h)
  }, [])
  return work
}

/** Aracı açarken çağrılır: tam çözünürlüklü çalışma kopyası. */
export async function initWork() {
  const full = await session.fullBase()
  work.full = toCanvas(full)
  full.close()
  const pv = session.preview!
  work.preview = toCanvas(work.full, pv.width, pv.height)
  work.mask = new PaintMask(pv.width, pv.height)
  work.changed = false
  work.key = session.baseKey
  workEmit()
}
export function disposeWork() {
  work.full = work.preview = null
  work.mask = null
  work.changed = false
}
export function setWorkResult(full: HTMLCanvasElement) {
  work.full = full
  const pv = session.preview!
  work.preview = toCanvas(full, pv.width, pv.height)
  work.changed = true
  work.mask?.clear()
  workEmit()
}
/** Önizleme boyutundaki maskeyi tam boyuta ölçekle (gri). */
export function fullMask(): HTMLCanvasElement {
  const g = work.mask!.toGray()
  return toCanvas(g, work.full!.width, work.full!.height)
}

export function useWorkLifecycle() {
  const tr = useT()
  useEffect(() => {
    const st = useEditor.getState()
    resetGenerated() // önceki aracın kullanılmayan YZ sonucu bu aracın adımına yazılmasın
    st.setBusy({ text: tr('Hazırlanıyor…', 'Preparing…') })
    initWork().finally(() => useEditor.getState().setBusy(null))
    return () => disposeWork()
  }, [])
}

export function WorkOverlayImage({ view }: { view: View }) {
  const w = useWork()
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !w.preview || !w.changed) return
    c.width = w.preview.width
    c.height = w.preview.height
    c.getContext('2d')!.drawImage(w.preview, 0, 0)
  }, [w.v])
  if (!w.preview || !w.changed) return null
  const tl = view.toScreen(0, 0)
  return <canvas ref={ref} style={{ position: 'absolute', left: tl.x, top: tl.y, width: view.size.w, height: view.size.h, pointerEvents: 'none' }} />
}

export function WorkFooter({ type, params }: { type: RasterOpType; params?: Record<string, unknown> }) {
  const tr = useT()
  const w = useWork()
  return (
    <ToolFoot>
      <button className="btn ghost" style={{ flex: 1 }} onClick={() => useEditor.getState().closeTool(false)}>{tr('İptal', 'Cancel')}</button>
      <button className="btn primary" style={{ flex: 1 }} disabled={!w.changed} onClick={async () => {
        const st = useEditor.getState()
        if (!work.full) return
        st.setBusy({ text: tr('Kaydediliyor…', 'Saving…') })
        try {
          await commitRaster(work.full, type, params)
          useEditor.getState().closeTool(true)
        } catch (e) {
          st.toast('error', String((e as Error).message))
        } finally {
          useEditor.getState().setBusy(null)
        }
      }}>{tr('Uygula', 'Apply')}</button>
    </ToolFoot>
  )
}

/** İşlemi meşgul göstergesiyle çalıştır. */
export async function busy<T>(text: string, fn: () => Promise<T>): Promise<T | null> {
  const st = useEditor.getState()
  st.setBusy({ text })
  try {
    return await fn()
  } catch (e) {
    console.error(e)
    st.toast('error', String((e as Error).message ?? e))
    return null
  } finally {
    useEditor.getState().setBusy(null)
  }
}
