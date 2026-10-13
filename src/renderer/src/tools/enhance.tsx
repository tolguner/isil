import { useState } from 'react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Segmented } from '@/components/ui'
import { session } from '@/engine/session'
import { upscale, restoreFaces, toCanvas } from '@/ai/ops'
import { isDesktop } from '@/lib/platform'
import { commitRaster } from '@/lib/projects'

const MAX_OUT = 8192

export function EnhanceTool() {
  const tr = useT()
  const [scale, setScale] = useState<'2' | '4'>('2')
  const [faces, setFaces] = useState(isDesktop)
  const W = session.W, H = session.H
  const k = Number(scale)
  const pre = Math.min(1, MAX_OUT / (Math.max(W, H) * k))
  const outW = Math.round(W * pre * k), outH = Math.round(H * pre * k)

  const run = async () => {
    const st = useEditor.getState()
    const signal = { cancelled: false }
    try {
      st.setBusy({ text: tr('Kalite artırılıyor…', 'Enhancing…'), progress: 0, cancel: () => (signal.cancelled = true) })
      const full = await session.fullBase()
      let src = pre < 1 ? toCanvas(full, W * pre, H * pre) : toCanvas(full)
      full.close()
      if (faces) {
        st.setBusy({ text: tr('Yüzler onarılıyor…', 'Restoring faces…') })
        src = (await restoreFaces(src)) ?? src
      }
      const up = await upscale(src, (p) => useEditor.getState().setBusy({ text: tr('Kalite artırılıyor…', 'Enhancing…'), progress: p, cancel: () => (signal.cancelled = true) }), signal)
      if (!up) return
      const final = k === 4 ? up : toCanvas(up, outW, outH)
      st.setBusy({ text: tr('Kaydediliyor…', 'Saving…') })
      await commitRaster(final, 'upscale', { scale: k })
      st.closeTool(true)
      st.toast('success', tr(`Yeni boyut: ${outW}×${outH}`, `New size: ${outW}×${outH}`))
    } catch (e) {
      console.error(e)
      st.toast('error', tr('Kalite artırma başarısız: ', 'Enhance failed: ') + (e as Error).message)
    } finally {
      useEditor.getState().setBusy(null)
    }
  }

  return (
    <>
      <p className="note">{tr('Yapay zekâ ile çözünürlüğü artırır, bulanık ve gürültülü ayrıntıları netleştirir. Bilgisayarında çalışır.', 'Increases resolution with AI and sharpens blurry, noisy detail. Runs on your computer.')}</p>
      <Segmented items={[{ id: '2', label: '2× HD' }, { id: '4', label: '4× Ultra' }]} value={scale} onChange={setScale} />
      {isDesktop && (
        <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
          <input type="checkbox" checked={faces} onChange={(e) => setFaces(e.target.checked)} />
          <span>{tr('Yüzleri de onar (CodeFormer)', 'Also restore faces (CodeFormer)')}</span>
        </label>
      )}
      <div className="card">
        <div className="muted">{tr('Şimdi', 'Now')}: {W}×{H}</div>
        <div><b>{tr('Sonra', 'After')}: {outW}×{outH}</b></div>
        {pre < 1 && <div className="note">{tr('Çok büyük görsellerde çıktı 8192 px ile sınırlanır.', 'Very large images are capped at 8192 px.')}</div>}
      </div>
      <div className="row">
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => useEditor.getState().closeTool(false)}>{tr('Kapat', 'Close')}</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={run}>{tr('Kaliteyi artır', 'Enhance')}</button>
      </div>
    </>
  )
}
