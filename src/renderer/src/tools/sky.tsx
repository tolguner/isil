// Gökyüzü değiştirme: gökyüzü yapay zekâyla ayrılır, hazır gökyüzlerinden biri ya da kendi seçtiğin görsel
// ufka oturtulur; ön plan yeni gökyüzünün rengine hafifçe uyumlanır. Hazır gökyüzleri Işıl'ın yerel modeliyle
// üretildi (public/skies).
import { useEffect, useRef, useState } from 'react'
import { CloudSun, ImagePlus } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Preset, Slider, ToolFoot } from '@/components/ui'
import { platform } from '@/lib/platform'
import { session } from '@/engine/session'
import { commitRaster } from '@/lib/projects'
import { composeSky, skyMask } from '@/ai/sky'
import { toCanvas } from '@/ai/ops'
import { WorkOverlayImage, busy, useWork, useWorkLifecycle, work, workEmit } from './raster'
import type { ToolDef } from './types'

export const SKIES: { id: string; label: [string, string] }[] = [
  { id: 'mavi', label: ['Açık mavi', 'Clear blue'] },
  { id: 'bulut', label: ['Bulutlu', 'Cloudy'] },
  { id: 'gunbatimi', label: ['Gün batımı', 'Sunset'] },
  { id: 'pembe', label: ['Alacakaranlık', 'Twilight'] },
  { id: 'firtina', label: ['Fırtına', 'Storm'] },
  { id: 'gece', label: ['Yıldızlı gece', 'Starry night'] }
]

const loadImg = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src })

function SkyPanel() {
  const tr = useT()
  useWorkLifecycle()
  const w = useWork()
  const [mk, setMk] = useState<Awaited<ReturnType<typeof skyMask>>>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [opts, setOpts] = useState({ brightness: 0, harmony: 50, shift: 0 })
  const sky = useRef<HTMLImageElement | ImageBitmap | null>(null)
  const orig = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!w.preview || mk) return
    orig.current = toCanvas(w.preview)
    void busy(tr('Gökyüzü aranıyor…', 'Finding the sky…'), async () => setMk(await skyMask(w.preview!, await session.ensureSeg().catch(() => null))))
  }, [!!w.preview])
  // önizleme: önizleme boyutunda bileşim
  useEffect(() => {
    if (!mk || !sky.current || !orig.current) return
    work.preview = composeSky(orig.current, sky.current, mk, opts)
    work.changed = true
    workEmit()
  }, [mk, sel, opts])
  const pick = async (id: string) => {
    sky.current = await loadImg(`skies/${id}.jpg`)
    setSel(id)
  }
  const own = async () => {
    const f = await platform.openFiles(false)
    if (!f[0]) return
    sky.current = await createImageBitmap(new Blob([f[0].bytes as BlobPart]))
    setSel('own')
  }
  const none = mk && mk.share < 0.03
  const apply = () => void busy(tr('Uygulanıyor…', 'Applying…'), async () => {
    if (!work.full || !mk || !sky.current) return
    await commitRaster(composeSky(work.full, sky.current, mk, opts), 'paint', { tool: 'sky', sky: sel, ...opts })
    useEditor.getState().closeTool(true)
  })
  return (
    <>
      <p className="note">{tr('Gökyüzü yapay zekâyla ayrılır ve yenisiyle değiştirilir; ön plan yeni ışığa uyumlanır. Bilgisayarında çalışır.', 'The sky is found by AI and replaced; the foreground adapts to the new light. Runs on your computer.')}</p>
      {none && <div className="card"><b>{tr('Gökyüzü bulunamadı', 'No sky found')}</b><div className="note">{tr('Bu fotoğrafta değiştirilecek kadar gökyüzü yok.', 'There is not enough sky in this photo to replace.')}</div></div>}
      <div className="presets">
        {SKIES.map((s) => (
          <Preset key={s.id} label={tr(s.label[0], s.label[1])} on={sel === s.id} onClick={() => void pick(s.id)}>
            <img src={`skies/${s.id}.jpg`} alt="" draggable={false} />
          </Preset>
        ))}
        <Preset label={tr('Görsel seç', 'Pick image')} on={sel === 'own'} onClick={() => void own()}><ImagePlus size={22} /></Preset>
      </div>
      <Slider plain label={tr('Gökyüzü parlaklığı', 'Sky brightness')} min={-50} max={50} def={0} value={opts.brightness} onChange={(v) => setOpts({ ...opts, brightness: v })} disabled={!sel} />
      <Slider plain label={tr('Ufuk konumu', 'Horizon position')} min={-50} max={50} def={0} value={opts.shift} onChange={(v) => setOpts({ ...opts, shift: v })} disabled={!sel} />
      <Slider plain label={tr('Renk uyumu', 'Color harmony')} value={opts.harmony} onChange={(v) => setOpts({ ...opts, harmony: v })} disabled={!sel} />
      <ToolFoot>
        <button className="btn ghost" onClick={() => useEditor.getState().closeTool(false)}>{tr('İptal', 'Cancel')}</button>
        <button className="btn primary" disabled={!sel || !mk || !!none} onClick={apply}>{tr('Uygula', 'Apply')}</button>
      </ToolFoot>
    </>
  )
}

export const SKY_TOOL: ToolDef = {
  id: 'sky', label: ['Gökyüzü', 'Sky'], icon: CloudSun, Panel: SkyPanel, Overlay: WorkOverlayImage,
  sourceSpace: true, noFooter: true, badge: 'YZ', sliders: [{ label: ['Gökyüzü parlaklığı', 'Sky brightness'] }, { label: ['Renk uyumu', 'Color harmony'] }]
}
