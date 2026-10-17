import { useEffect, useRef, useState } from 'react'
import { Camera as CamIcon, FlipHorizontal2, Timer } from 'lucide-react'
import { emptyDoc, type EditDoc } from '@shared/schema'
import { useT } from '@/lib/i18n'
import { Renderer } from '@/engine/renderer'
import { encodeCanvas, imageDataToCanvas } from '@/engine/session'
import { FILTERS } from '@/engine/presets'
import { startEditing } from '@/lib/projects'
import { Preset, Slider } from '@/components/ui'
import { detectFacesFast, type Pt } from '@/ai/vision'
import { FaceGeo, buildMasks, faceUniforms, faceOps, buildField, contourPairs, addMlsField } from '@/engine/face'

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
  // canlı güzellik: pürüzsüz, aydınlat, incelt, göz (0..100)
  const [beauty, setBeauty] = useState({ smooth: 40, whiten: 15, slim: 0, eyeSize: 0 })
  const beautyRef = useRef(beauty)
  beautyRef.current = beauty

  const docFor = () => {
    const d = emptyDoc()
    const l = LOOKS.find((x) => x.id === lookRef.current)!
    if (l.filter) d.filter = { id: l.filter, amount: 85 }
    if (l.effect) d.effects = [{ id: l.effect, amount: 70 }]
    d.crop.flipH = mirrorRef.current
    const b = beautyRef.current
    d.retouch.faces = [{ index: 0, side: 'both', shape: { slim: b.slim, eyeSize: b.eyeSize }, skin: { smooth: b.smooth, whiten: b.whiten, blemish: Math.round(b.smooth * 0.8), undereye: Math.round(b.smooth * 0.5), texture: Math.round(b.smooth * 0.3) }, makeup: {} }]
    return d
  }

  /**
   * Canlı rötuş: yüz noktaları ~6 kez/sn güncellenir; maskeler ve bükme alanı her güncellemede yeniden kurulur,
   * aradaki karelerde son değerler kullanılır. Hepsi yerel (MediaPipe + WebGL).
   */
  const live = useRef<{ faces: Pt[][]; busy: boolean; last: number; W: number; H: number; masksFor: Pt[][] | null }>({ faces: [], busy: false, last: 0, W: 0, H: 0, masksFor: null })
  const prepareFaces = (r: Renderer, v: HTMLVideoElement, d: EditDoc) => {
    const L = live.current
    const W = v.videoWidth, H = v.videoHeight
    const now = performance.now()
    if (!L.busy && now - L.last > 160) {
      L.busy = true
      L.last = now
      void detectFacesFast(v).then((f) => { L.faces = f; L.W = W; L.H = H }).catch(() => {}).finally(() => { L.busy = false })
    }
    const b = beautyRef.current
    const on = b.smooth || b.whiten || b.slim || b.eyeSize
    if (!L.faces.length || !on) { r.faces = null; r.setWarp(null); return }
    const geos = L.faces.slice(0, 1).map((f) => new FaceGeo(f, W, H))
    if (L.masksFor !== L.faces) {
      const m = buildMasks(geos, W, H, null, false)
      r.setFaceMasks(m.a, m.b, m.c)
      L.masksFor = L.faces
    }
    r.faces = faceUniforms(d.retouch.faces, geos.length)
    const e = d.retouch.faces[0]
    const ops = faceOps(geos[0], e.shape, 'both')
    let field = buildField(ops, W, H, null, 96, Math.max(16, Math.round((96 * H) / W)))
    const pr = contourPairs(geos[0], e.shape, 'both')
    if (pr) {
      field ??= { field: new Float32Array(96 * Math.max(16, Math.round((96 * H) / W)) * 2), gw: 96, gh: Math.max(16, Math.round((96 * H) / W)) }
      addMlsField(field.field, field.gw, field.gh, W, H, pr)
    }
    r.setWarp(field?.field ?? null, field?.gw, field?.gh)
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
            const d = docFor()
            prepareFaces(r, v, d)
            r.present(r.render(d, { maxSide: 1280 }))
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
      const d = docFor()
      prepareFaces(r, v, d)
      const out = r.render(d, {})
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
          <p className="note">{tr('Rötuş ve görünüm canlı uygulanır; çektiğin fotoğraf düzenleyicide açılır.', 'Retouch and looks apply live; your shot opens in the editor.')}</p>
          <div className="group-label">{tr('Canlı güzellik', 'Live beauty')}</div>
          <Slider label={tr('Pürüzsüz', 'Smooth')} value={beauty.smooth} onChange={(v) => setBeauty({ ...beauty, smooth: v })} />
          <Slider label={tr('Aydınlat', 'Brighten')} value={beauty.whiten} onChange={(v) => setBeauty({ ...beauty, whiten: v })} />
          <Slider label={tr('Yüzü incelt', 'Slim face')} value={beauty.slim} onChange={(v) => setBeauty({ ...beauty, slim: v })} />
          <Slider label={tr('Göz', 'Eyes')} value={beauty.eyeSize} onChange={(v) => setBeauty({ ...beauty, eyeSize: v })} />
          <div className="group-label">{tr('Görünüm', 'Look')}</div>
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
