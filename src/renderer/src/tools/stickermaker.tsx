// Çıkartma yapıcı paneli: bu fotoğraftan ya da bir dosyadan çıkartma üret, kitaplıkta sakla, fotoğrafa ekle.
import { useEffect, useRef, useState } from 'react'
import { Download, ImagePlus, Scissors, X } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Segmented, Switch } from '@/components/ui'
import { platform } from '@/lib/platform'
import { session } from '@/engine/session'
import { blobToDataUrl, deleteSticker, listStickers, makeSticker, saveSticker, type SavedSticker, type StickerStyle } from '@/ai/sticker'
import { busy } from './raster'

const COLORS = ['#ffffff', '#111111', '#ffb547', '#ff6b81', '#5b9bff']

export function StickerMaker({ add }: { add: (dataUrl: string) => void }) {
  const tr = useT()
  const [style, setStyle] = useState<StickerStyle>({ outline: 2, color: '#ffffff', shadow: true })
  const [made, setMade] = useState<HTMLCanvasElement | null>(null)
  const [lib, setLib] = useState<SavedSticker[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const pv = useRef<HTMLDivElement>(null)
  const refresh = async () => {
    const l = await listStickers().catch(() => [])
    setLib(l)
    setUrls((old) => {
      const n: Record<string, string> = {}
      for (const s of l) n[s.id] = old[s.id] ?? URL.createObjectURL(s.png)
      return n
    })
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    const el = pv.current
    if (!el) return
    el.replaceChildren()
    if (made) { made.style.maxWidth = '100%'; made.style.maxHeight = '180px'; el.append(made) }
  }, [made])

  const make = async (from: 'photo' | 'file') => {
    let src: (CanvasImageSource & { width: number; height: number }) | null = null
    if (from === 'photo') src = session.preview
    else {
      const f = await platform.openFiles(false)
      if (!f[0]) return
      src = await createImageBitmap(new Blob([f[0].bytes as BlobPart]))
    }
    if (!src) return
    const c = await busy(tr('Çıkartma hazırlanıyor…', 'Making sticker…'), () => makeSticker(src!, style, { detailed: true, max: 768 }))
    if (!c) {
      useEditor.getState().toast('error', tr('Fotoğrafta belirgin bir konu bulunamadı.', 'No clear subject found in the image.'))
      return
    }
    setMade(c)
  }
  const useIt = async () => {
    if (!made) return
    const s = await saveSticker(made)
    add(await blobToDataUrl(s.png))
    await refresh()
    setMade(null)
  }
  const savePng = async () => {
    if (!made) return
    const blob = await new Promise<Blob>((r) => made.toBlob((b) => r(b!), 'image/png'))
    const p = await platform.exportSave({ bytes: new Uint8Array(await blob.arrayBuffer()), ext: 'png', suggestedName: 'isil-cikartma' })
    if (p) useEditor.getState().toast('success', tr('Çıkartma kaydedildi', 'Sticker saved'))
  }
  return (
    <div className="sticker-maker">
      <div className="group-label">{tr('Çıkartma yap', 'Make a sticker')}</div>
      <p className="note">{tr('Konu yapay zekâyla kesilir, etrafına kenar çizgisi eklenir. Bilgisayarında çalışır.', 'The subject is cut out by AI and outlined. Runs on your computer.')}</p>
      <div className="setting" style={{ padding: '4px 0' }}>
        <div><b>{tr('Kenar', 'Outline')}</b></div>
        <div style={{ width: 210 }}>
          <Segmented items={[{ id: '0', label: tr('Yok', 'None') }, { id: '1', label: tr('İnce', 'Thin') }, { id: '2', label: tr('Kalın', 'Thick') }]} value={String(style.outline)} onChange={(v) => setStyle({ ...style, outline: Number(v) as 0 | 1 | 2 })} />
        </div>
      </div>
      {style.outline > 0 && (
        <div className="row" role="radiogroup" aria-label={tr('Kenar rengi', 'Outline colour')}>
          {COLORS.map((c) => (
            <button key={c} role="radio" aria-checked={style.color === c} aria-label={c} className={'swatch' + (style.color === c ? ' on' : '')} style={{ background: c }} onClick={() => setStyle({ ...style, color: c })} />
          ))}
        </div>
      )}
      <div className="setting" style={{ padding: '4px 0' }}>
        <div><b>{tr('Gölge', 'Shadow')}</b></div>
        <Switch on={style.shadow} onChange={(v) => setStyle({ ...style, shadow: v })} label={tr('Gölge', 'Shadow')} />
      </div>
      <div className="row">
        <button className="btn sm primary" onClick={() => void make('photo')}><Scissors size={14} /> {tr('Bu fotoğraftan', 'From this photo')}</button>
        <button className="btn sm" onClick={() => void make('file')}><ImagePlus size={14} /> {tr('Dosyadan', 'From a file')}</button>
      </div>
      {made && (
        <>
          <div ref={pv} className="sticker-preview" aria-label={tr('Çıkartma önizlemesi', 'Sticker preview')} />
          <div className="row">
            <button className="btn sm primary" onClick={() => void useIt()}>{tr('Fotoğrafa ekle', 'Add to photo')}</button>
            <button className="btn sm" onClick={() => void savePng()}><Download size={14} /> PNG</button>
          </div>
        </>
      )}
      <div className="group-label">{tr('Çıkartmalarım', 'My stickers')}</div>
      {lib.length ? (
        <div className="presets" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {lib.map((s) => (
            <div key={s.id} className="my-sticker">
              <button className="preset" aria-label={tr('Çıkartmayı ekle', 'Add sticker')} onClick={async () => add(await blobToDataUrl(s.png))}>
                <span className="pv"><img src={urls[s.id]} alt="" /></span>
              </button>
              <button className="del" aria-label={tr('Çıkartmayı sil', 'Delete sticker')} onClick={async () => { await deleteSticker(s.id); await refresh() }}><X size={12} /></button>
            </div>
          ))}
        </div>
      ) : <p className="note">{tr('Henüz çıkartma yok.', 'No stickers yet.')}</p>}
    </div>
  )
}
