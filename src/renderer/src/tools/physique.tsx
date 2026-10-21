import { MinorGate } from '@/components/MinorGate'
// Karın kası: poz noktalarından ışık-gölgeyle karın kası belirginleştirilir (anlık önizleme); Uygula'da sonuç
// isteğe bağlı olarak yerel FLUX ile gerçekçileştirilir. Yalnız açık ciltte, öndeki kol ve el hariç.
import { useEffect, useRef, useState } from 'react'
import { Dumbbell } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Slider, Switch, ToolFoot } from '@/components/ui'
import { session } from '@/engine/session'
import { commitRaster } from '@/lib/projects'
import { applyBodyLook, refineBodyLook, torsoOk } from '@/ai/bodylook'
import type { PersonParts, Pt } from '@/ai/vision'
import { WorkOverlayImage, useWork, useWorkLifecycle, work, workEmit } from './raster'
import { toCanvas } from '@/ai/ops'
import type { ToolDef } from './types'

const MIN_SKIN = 0.25

function GatedPhysiquePanel() {
  return <MinorGate><PhysiquePanel /></MinorGate>
}

function PhysiquePanel() {
  const tr = useT()
  useWorkLifecycle()
  const w = useWork()
  const [amount, setAmount] = useState(60)
  const [ai, setAi] = useState(true)
  const [ctx, setCtx] = useState<{ pose: Pt[] | null; seg: PersonParts | null } | null>(null)
  const [skin, setSkin] = useState(1)
  const orig = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    void (async () => {
      const st = useEditor.getState()
      st.setBusy({ text: tr('Vücut bulunuyor…', 'Finding the body…') })
      try {
        const [pose, seg] = await Promise.all([session.ensurePose(), session.ensureSeg()])
        setCtx({ pose, seg })
      } finally {
        useEditor.getState().setBusy(null)
      }
    })()
  }, [])
  const ok = !!ctx?.pose && !!ctx.seg && torsoOk(ctx.pose)
  // önizleme: önizleme boyutunda ışık-gölge
  useEffect(() => {
    if (!ok || !w.preview) return
    orig.current ??= toCanvas(w.preview)
    const r = applyBodyLook(orig.current, ctx!.pose!, ctx!.seg!, { abs: amount })
    setSkin(r.skin)
    work.preview = r.skin >= MIN_SKIN && amount > 0 ? r.canvas : orig.current
    work.changed = r.skin >= MIN_SKIN && amount > 0
    workEmit()
  }, [ok, amount, !!w.preview])
  useEffect(() => () => { orig.current = null }, [])
  const usable = ok && skin >= MIN_SKIN
  const apply = async () => {
    const st = useEditor.getState()
    if (!work.full || !ctx?.pose || !ctx.seg) return
    st.setBusy({ text: tr('Uygulanıyor…', 'Applying…') })
    try {
      const full = toCanvas(work.full)
      const r = applyBodyLook(full, ctx.pose, ctx.seg, { abs: amount })
      let out: HTMLCanvasElement | null = r.canvas
      if (ai) out = (await refineBodyLook(full, r.canvas, r.mask, r.box, ['abs'], 0.5)) ?? r.canvas
      await commitRaster(out, 'paint', { tool: 'abs', amount, ai })
      useEditor.getState().closeTool(true)
    } catch (e) {
      st.toast('error', String((e as Error).message ?? e))
    } finally {
      useEditor.getState().setBusy(null)
    }
  }
  return (
    <>
      <p className="note">{tr('Karın kasını ışık ve gölgeyle belirginleştirir; kıl, ten ve doku korunur. Yalnız açık ciltte çalışır, öndeki kol ve el etkilenmez.', 'Defines the abs with light and shadow; hair, skin tone and texture stay. Works only on bare skin; arms and hands in front are left alone.')}</p>
      {ctx && !ok && <div className="card"><b>{tr('Gövde bulunamadı', 'No torso found')}</b><div className="note">{tr('Omuzların ve kalçanın göründüğü bir fotoğraf gerekir.', 'The shoulders and hips need to be visible.')}</div></div>}
      {ok && !usable && <div className="card"><b>{tr('Karın açıkta değil', 'Stomach not visible')}</b><div className="note">{tr('Karın bölgesinde açık cilt bulunamadı; kıyafetin üstüne kas çizilmez.', 'No bare skin was found on the stomach; muscles are not drawn over clothes.')}</div></div>}
      <Slider plain label={tr('Belirginlik', 'Definition')} min={0} max={100} value={amount} onChange={setAmount} disabled={!usable} />
      <div className="setting">
        <div><b>{tr('YZ ile gerçekçileştir', 'Make it realistic with AI')}</b><span>{tr('Uygula sırasında bilgisayarındaki YZ motoruyla işlenir (20–60 sn). Kapalıyken yalnız ışık-gölge uygulanır.', 'Processed by the local AI engine on Apply (20–60 s). When off, only light and shadow are applied.')}</span></div>
        <Switch label={tr('YZ ile gerçekçileştir', 'Make it realistic with AI')} on={ai} onChange={setAi} />
      </div>
      <ToolFoot>
        <button className="btn ghost" onClick={() => useEditor.getState().closeTool(false)}>{tr('İptal', 'Cancel')}</button>
        <button className="btn primary" disabled={!usable || amount === 0} onClick={() => void apply()}>{tr('Uygula', 'Apply')}</button>
      </ToolFoot>
    </>
  )
}

export const PHYSIQUE_TOOL: ToolDef = {
  id: 'abs', label: ['Karın kası', 'Abs'], icon: Dumbbell, Panel: GatedPhysiquePanel, Overlay: WorkOverlayImage,
  sourceSpace: true, noFooter: true, badge: 'YZ', sliders: [{ label: ['Belirginlik', 'Definition'] }]
}
