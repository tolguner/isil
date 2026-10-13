import { useEffect, useRef, useState } from 'react'
import { Camera as CamIcon, FlipHorizontal2, Timer } from 'lucide-react'
import { emptyDoc } from '@shared/schema'
import { useT } from '@/lib/i18n'
import { Renderer } from '@/engine/renderer'
import { encodeCanvas, imageDataToCanvas } from '@/engine/session'
import { FILTERS } from '@/engine/presets'
import { startEditing } from '@/lib/projects'
import { Preset } from '@/components/ui'

const LOOKS: { id: string; filter?: string; effect?: string; name: [string, string] }[] = [
  { id: 'none', name: ['Doğal', 'Natural'] },
  { id: 'digicam', filter: 'dijikam', effect: 'dijikam', name: ['Dijikam', 'Digicam'] },
  { id: 'flash', filter: 'temiz', effect: 'flas', name: ['Flaş', 'Flash'] },
  { id: 'film', filter: 'kodak-sicak', effect: 'toz', name: ['Film', 'Film'] },
  { id: 'y2k', filter: 'y2k', name: ['2000’ler', 'Y2K'] },
  { id: 'night', filter: 'gece-mavi', effect: 'vhs', name: ['Gece kaseti', 'Night tape'] },
  { id: 'golden', filter: 'altin-saat', name: ['Altın', 'Golden'] },
  { id: 'mono', filter: 'sb-klasik', name: ['S/B', 'B&W'] },
  { id: 'dream', filter: 'pamuk', effect: 'ruya', name: ['Rüya', 'Dreamy'] },
  { id: 'peep', effect: 'kaleydoskop', name: ['Kaleydoskop', 'Kaleidoscope'] }
]

export function Camera() {
  const tr = useT()
  const video = useRef<HTMLVideoElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [look, setLook] = useState('digicam')
  const [mirror, setMirror] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [count, setCount] = useState<number | null>(null)
  const [timer, setTimer] = useState(false)
  const lookRef = useRef(look)
  lookRef.current = look
  const mirrorRef = useRef(mirror)
  mirrorRef.current = mirror

  const docFor = () => {
    const d = emptyDoc()
    const l = LOOKS.find((x) => x.id === lookRef.current)!
    if (l.filter) d.filter = { id: l.filter, amount: 85 }
    if (l.effect) d.effects = [{ id: l.effect, amount: 70 }]
    d.crop.flipH = mirrorRef.current
    return d
  }

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let r: Renderer | null = null
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        const v = video.current!
        v.srcObject = stream
        await v.play()
        r = new Renderer(canvas.current!)
        const loop = () => {
          if (v.readyState >= 2 && r) {
            r.setBase(v)
            r.present(r.render(docFor(), { maxSide: 1280 }))
          }
          raf = requestAnimationFrame(loop)
        }
        loop()
      } catch (e) {
        setErr(String((e as Error).message ?? e))
      }
    })()
    return () => {
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      r?.dispose()
    }
  }, [])

  const shoot = async () => {
    const v = video.current!
    const r = new Renderer(document.createElement('canvas'))
    try {
      r.setBase(v)
      const out = r.render(docFor(), {})
      const c = imageDataToCanvas(r.read(out.target))
      const b = await encodeCanvas(c, 'image/jpeg', 0.95)
      await startEditing({ name: `kamera-${Date.now()}.jpg`, bytes: new Uint8Array(await b.arrayBuffer()) })
    } finally {
      r.dispose()
    }
  }
  const press = () => {
    if (!timer) return void shoot()
    let n = 3
    setCount(n)
    const t = setInterval(() => {
      n--
      if (n <= 0) {
        clearInterval(t)
        setCount(null)
        void shoot()
      } else setCount(n)
    }, 1000)
  }

  return (
    <div className="editor" style={{ gridTemplateColumns: '1fr var(--l-panel)' }}>
      <div className="stage" style={{ display: 'grid', placeItems: 'center' }}>
        <video ref={video} muted playsInline style={{ display: 'none' }} />
        {err ? (
          <div className="empty" style={{ border: 0 }}>
            <CamIcon size={28} />
            <p>{tr('Kameraya erişilemedi. Bir kamera bağlı olduğundan ve izin verildiğinden emin ol.', 'Could not access the camera. Make sure one is connected and allowed.')}</p>
            <p className="note">{err}</p>
          </div>
        ) : (
          <canvas ref={canvas} style={{ maxWidth: '92%', maxHeight: '86%', position: 'static', borderRadius: 12 }} />
        )}
        {count !== null && <div style={{ position: 'absolute', fontSize: 120, fontWeight: 800, color: '#fff', textShadow: '0 4px 30px rgba(0,0,0,.6)' }}>{count}</div>}
        {!err && (
          <div className="hud" style={{ gap: 12, padding: 8 }}>
            <button className={'icon-btn' + (mirror ? ' on' : '')} onClick={() => setMirror(!mirror)} aria-label={tr('Ayna', 'Mirror')}><FlipHorizontal2 size={18} /></button>
            <button className="btn primary" style={{ borderRadius: 999, width: 56, height: 56 }} onClick={press} aria-label={tr('Çek', 'Shoot')}><CamIcon size={22} /></button>
            <button className={'icon-btn' + (timer ? ' on' : '')} onClick={() => setTimer(!timer)} aria-label={tr('3 sn zamanlayıcı', '3s timer')}><Timer size={18} /></button>
          </div>
        )}
      </div>
      <aside className="panel">
        <div className="panel-head"><h3>{tr('Kamera', 'Camera')}</h3></div>
        <div className="panel-body">
          <p className="note">{tr('Görünüm canlı uygulanır; çektiğin fotoğraf düzenleyicide açılır.', 'Looks apply live; your shot opens in the editor.')}</p>
          <div className="presets">
            {LOOKS.map((l) => (
              <Preset key={l.id} label={tr(l.name[0], l.name[1])} on={look === l.id} onClick={() => setLook(l.id)} bg={(() => { const f = FILTERS.find((x) => x.id === l.filter); return f ? `linear-gradient(160deg, ${f.swatch[0]}, ${f.swatch[1]})` : 'var(--c-surface-2)' })()} />
            ))}
          </div>
        </div>
      </aside>
    </div>
  )
}
