// Dövme ekle: hazır çizgi dövmeler ya da kendi görselin mürekkebe çevrilip cilde "çarp" karıştırmayla konur.
import { useState } from 'react'
import { ImagePlus } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { platform } from '@/lib/platform'
import { TATTOO_DESIGNS, designDataUrl, toInk } from '@/ai/tattoo'

const INKS = ['#1b1b1f', '#1f2a44', '#5a1f1f', '#1f3d2a']

export function TattooPanel({ add }: { add: (dataUrl: string) => void }) {
  const tr = useT()
  const [ink, setInk] = useState(INKS[0])
  const put = async (src: string) => add(await toInk(src, ink))
  return (
    <div className="sticker-maker">
      <p className="note">{tr('Dövme cilde karışacak şekilde konur: cildin dokusu ve ışığı içinden görünür. Tuvalde taşı, döndür, büyüt.', 'The tattoo blends into the skin so its texture and light show through. Move, rotate and scale it on the canvas.')}</p>
      <div className="row" role="radiogroup" aria-label={tr('Mürekkep rengi', 'Ink colour')}>
        {INKS.map((c) => <button key={c} role="radio" aria-checked={ink === c} aria-label={c} className={'swatch' + (ink === c ? ' on' : '')} style={{ background: c }} onClick={() => setInk(c)} />)}
      </div>
      <div className="presets" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <button className="preset" onClick={async () => {
          const f = await platform.openFiles(false)
          if (!f[0]) return
          const url = await new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(new Blob([f[0].bytes as BlobPart])) })
          await put(url)
        }}><span className="pv"><ImagePlus size={20} /></span>{tr('Kendi çizimin', 'Your design')}</button>
        {TATTOO_DESIGNS.map((d) => (
          <button key={d.id} className="preset" aria-label={tr(d.label[0], d.label[1])} onClick={() => void put(designDataUrl(d.svg))}>
            <span className="pv" style={{ background: '#e9d7c8', borderRadius: 8 }}><img src={designDataUrl(d.svg)} alt="" style={{ width: '70%', height: '70%' }} /></span>{tr(d.label[0], d.label[1])}
          </button>
        ))}
      </div>
      <p className="note">{tr('Kendi çiziminde beyaz ya da açık zemin otomatik olarak saydam olur.', 'A white or light background in your design becomes transparent automatically.')}</p>
    </div>
  )
}
