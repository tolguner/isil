import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Download, Pencil, X } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { platform } from '@/lib/platform'
import { ColorRow, Segmented, Slider } from '@/components/ui'
import { encodeCanvas } from '@/engine/session'
import { startEditing } from '@/lib/projects'

type Cell = [number, number, number, number] // x, y, w, h (0..1)
interface Img { bm: ImageBitmap; url: string; ox: number; oy: number; zoom: number }

function grid(c: number, r: number, n: number): Cell[] {
  const out: Cell[] = []
  for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) if (out.length < n) out.push([i / c, j / r, 1 / c, 1 / r])
  // son satır eksikse genişlet
  const last = out.filter((x) => x[1] === (r - 1) / r)
  if (last.length && last.length < c) last.forEach((x, k) => { x[0] = k / last.length; x[2] = 1 / last.length })
  return out
}
function layouts(n: number): Cell[][] {
  const L: Cell[][] = []
  if (n === 1) return [[[0, 0, 1, 1]]]
  if (n === 2) L.push([[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]], [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]], [[0, 0, 0.62, 1], [0.62, 0, 0.38, 1]])
  if (n === 3) L.push(grid(3, 1, 3), grid(1, 3, 3), [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.5], [0.6, 0.5, 0.4, 0.5]], [[0, 0, 1, 0.6], [0, 0.6, 0.5, 0.4], [0.5, 0.6, 0.5, 0.4]])
  if (n === 4) L.push(grid(2, 2, 4), [[0, 0, 1, 0.6], [0, 0.6, 1 / 3, 0.4], [1 / 3, 0.6, 1 / 3, 0.4], [2 / 3, 0.6, 1 / 3, 0.4]], [[0, 0, 0.6, 1], [0.6, 0, 0.4, 1 / 3], [0.6, 1 / 3, 0.4, 1 / 3], [0.6, 2 / 3, 0.4, 1 / 3]], grid(4, 1, 4))
  if (n === 5) L.push(grid(3, 2, 5).reverse().map((c) => [c[0], 1 - c[1] - c[3], c[2], c[3]] as Cell), [[0, 0, 0.5, 1], [0.5, 0, 0.25, 0.5], [0.75, 0, 0.25, 0.5], [0.5, 0.5, 0.25, 0.5], [0.75, 0.5, 0.25, 0.5]], grid(1, 5, 5))
  if (n === 6) L.push(grid(3, 2, 6), grid(2, 3, 6), [[0, 0, 2 / 3, 2 / 3], [2 / 3, 0, 1 / 3, 1 / 3], [2 / 3, 1 / 3, 1 / 3, 1 / 3], [0, 2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 1 / 3, 1 / 3], [2 / 3, 2 / 3, 1 / 3, 1 / 3]])
  if (n >= 7) L.push(grid(3, 3, n), grid(n <= 8 ? 4 : 3, n <= 8 ? 2 : 3, n))
  return L
}

const RATIO: Record<string, number> = { '1:1': 1, '4:5': 0.8, '3:4': 0.75, '9:16': 9 / 16, '16:9': 16 / 9 }

function drawCollage(ctx: CanvasRenderingContext2D, W: number, H: number, imgs: Img[], cells: Cell[], gap: number, radius: number, bg: string) {
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  const g = (gap / 100) * Math.min(W, H) * 0.06
  cells.forEach((c, i) => {
    const im = imgs[i]
    if (!im) return
    const edge = (v: number, outer: boolean) => (outer ? g : g / 2)
    const x = c[0] * W + edge(0, c[0] <= 0.001)
    const y = c[1] * H + edge(0, c[1] <= 0.001)
    const ww = Math.max(1, (c[0] + c[2]) * W - edge(0, c[0] + c[2] >= 0.999) - x)
    const hh = Math.max(1, (c[1] + c[3]) * H - edge(0, c[1] + c[3] >= 0.999) - y)
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(x, y, ww, hh, (radius / 100) * Math.min(ww, hh) * 0.5)
    ctx.clip()
    const s = Math.max(ww / im.bm.width, hh / im.bm.height) * im.zoom
    const dw = im.bm.width * s, dh = im.bm.height * s
    ctx.drawImage(im.bm, x + (ww - dw) / 2 + im.ox * ww, y + (hh - dh) / 2 + im.oy * hh, dw, dh)
    ctx.restore()
  })
}

function drawStitch(imgs: Img[], dir: 'v' | 'h', gap: number, bg: string, base = 1600) {
  const g = (gap / 100) * base * 0.04
  const sizes = imgs.map((im) => (dir === 'v' ? { w: base, h: (im.bm.height * base) / im.bm.width } : { w: (im.bm.width * base) / im.bm.height, h: base }))
  const W = dir === 'v' ? base : sizes.reduce((a, s) => a + s.w, 0) + g * (imgs.length - 1)
  const H = dir === 'v' ? sizes.reduce((a, s) => a + s.h, 0) + g * (imgs.length - 1) : base
  const c = document.createElement('canvas')
  c.width = Math.round(W)
  c.height = Math.round(H)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  let p = 0
  imgs.forEach((im, i) => {
    const s = sizes[i]
    if (dir === 'v') ctx.drawImage(im.bm, 0, p, s.w, s.h)
    else ctx.drawImage(im.bm, p, 0, s.w, s.h)
    p += (dir === 'v' ? s.h : s.w) + g
  })
  return c
}

export function Collage() {
  const tr = useT()
  const [imgs, setImgs] = useState<Img[]>([])
  const [mode, setMode] = useState<'grid' | 'stitch'>('grid')
  const [li, setLi] = useState(0)
  const [ratio, setRatio] = useState('4:5')
  const [gap, setGap] = useState(25)
  const [radius, setRadius] = useState(10)
  const [bg, setBg] = useState('#ffffff')
  const [dir, setDir] = useState<'v' | 'h'>('v')
  const cv = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ i: number; x: number; y: number; ox: number; oy: number } | null>(null)
  const cells = layouts(imgs.length)[Math.min(li, layouts(imgs.length).length - 1)] ?? []

  const pick = async () => {
    const files = await platform.openFiles(true)
    const add: Img[] = []
    for (const f of files.slice(0, 9 - imgs.length)) {
      const b = new Blob([f.bytes as BlobPart])
      add.push({ bm: await createImageBitmap(b, { imageOrientation: 'from-image' }), url: URL.createObjectURL(b), ox: 0, oy: 0, zoom: 1 })
    }
    setImgs((x) => [...x, ...add].slice(0, 9))
  }
  useEffect(() => {
    if (!imgs.length) void pick()
  }, [])

  useEffect(() => {
    const c = cv.current
    if (!c || !imgs.length) return
    if (mode === 'grid') {
      const r = RATIO[ratio]
      c.width = r >= 1 ? 1000 : Math.round(1000 * r)
      c.height = r >= 1 ? Math.round(1000 / r) : 1000
      drawCollage(c.getContext('2d')!, c.width, c.height, imgs, cells, gap, radius, bg)
    } else {
      const s = drawStitch(imgs, dir, gap, bg, 800)
      c.width = s.width
      c.height = s.height
      c.getContext('2d')!.drawImage(s, 0, 0)
    }
  })

  const render = (scale: number) => {
    if (mode === 'stitch') return drawStitch(imgs, dir, gap, bg, 2000)
    const r = RATIO[ratio]
    const W = r >= 1 ? 2400 * scale : Math.round(2400 * r * scale), H = r >= 1 ? Math.round((2400 / r) * scale) : 2400 * scale
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    drawCollage(c.getContext('2d')!, W, H, imgs, cells, gap, radius, bg)
    return c
  }

  const cellAt = (e: React.PointerEvent | React.WheelEvent) => {
    const r = cv.current!.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    return cells.findIndex((c) => x >= c[0] && x <= c[0] + c[2] && y >= c[1] && y <= c[1] + c[3])
  }

  return (
    <div className="editor" style={{ gridTemplateColumns: '1fr var(--l-panel)' }}>
      <div className="stage" style={{ display: 'grid', placeItems: 'center' }}>
        {imgs.length ? (
          <canvas
            ref={cv}
            style={{ maxWidth: '90%', maxHeight: '88%', boxShadow: 'var(--sh-pop)', cursor: mode === 'grid' ? 'grab' : 'default', position: 'static' }}
            onPointerDown={(e) => {
              if (mode !== 'grid') return
              const i = cellAt(e)
              if (i < 0) return
              ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
              drag.current = { i, x: e.clientX, y: e.clientY, ox: imgs[i].ox, oy: imgs[i].oy }
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d) return
              const r = cv.current!.getBoundingClientRect()
              const c = cells[d.i]
              setImgs((xs) => xs.map((im, k) => (k === d.i ? { ...im, ox: d.ox + (e.clientX - d.x) / (r.width * c[2]), oy: d.oy + (e.clientY - d.y) / (r.height * c[3]) } : im)))
            }}
            onPointerUp={() => (drag.current = null)}
            onWheel={(e) => {
              if (mode !== 'grid') return
              const i = cellAt(e)
              if (i < 0) return
              setImgs((xs) => xs.map((im, k) => (k === i ? { ...im, zoom: Math.min(4, Math.max(1, im.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))) } : im)))
            }}
          />
        ) : (
          <div className="empty" style={{ border: 0 }}>
            <p>{tr('Kolaj için 2–9 fotoğraf seç.', 'Pick 2–9 photos for a collage.')}</p>
            <button className="btn primary" onClick={pick}><ImagePlus size={16} /> {tr('Fotoğraf seç', 'Pick photos')}</button>
          </div>
        )}
      </div>
      <aside className="panel">
        <div className="panel-head"><h3>{tr('Kolaj', 'Collage')}</h3></div>
        <div className="panel-body">
          <Segmented items={[{ id: 'grid', label: tr('Yerleşim', 'Layout') }, { id: 'stitch', label: tr('Birleştir', 'Stitch') }]} value={mode} onChange={setMode} />
          <div className="row wrap" style={{ margin: '8px 0' }}>
            {imgs.length < 9 && <button className="btn" style={{ width: 44, height: 44, padding: 0 }} onClick={pick} title={tr('Fotoğraf ekle', 'Add photo')} aria-label={tr('Fotoğraf ekle', 'Add photo')}><ImagePlus size={16} /></button>}
            {imgs.map((im, i) => (
              <span key={im.url} style={{ position: 'relative' }}>
                <img src={im.url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, display: 'block' }} />
                <button className="icon-btn" style={{ position: 'absolute', top: -8, right: -8, width: 20, height: 20, background: 'var(--c-surface-3)', borderRadius: 10 }} onClick={() => setImgs(imgs.filter((_, k) => k !== i))} aria-label={tr('Kaldır', 'Remove')} title={tr('Kaldır', 'Remove')}><X size={12} /></button>
              </span>
            ))}
          </div>
          {mode === 'grid' ? (
            <>
              <div className="group-label">{tr('Yerleşim', 'Layout')}</div>
              {imgs.length === 0 && <p className="note">{tr('Fotoğraf ekleyince sayıya uygun yerleşimler burada çıkar.', 'Layouts for your photo count appear here once you add photos.')}</p>}
              <div className="presets" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {layouts(imgs.length).map((L, i) => (
                  <button key={i} className={'preset' + (i === li ? ' on' : '')} onClick={() => setLi(i)} aria-label={`${i + 1}`}>
                    <span className="pv" style={{ position: 'relative', aspectRatio: '1', background: 'var(--c-bg)' }}>
                      {L.map((c, k) => <span key={k} style={{ position: 'absolute', left: `${c[0] * 100 + 3}%`, top: `${c[1] * 100 + 3}%`, width: `${c[2] * 100 - 6}%`, height: `${c[3] * 100 - 6}%`, background: 'var(--c-surface-3)', borderRadius: 2 }} />)}
                    </span>
                  </button>
                ))}
              </div>
              <div className="group-label">{tr('Oran', 'Ratio')}</div>
              <Segmented items={Object.keys(RATIO).map((k) => ({ id: k, label: k }))} value={ratio} onChange={setRatio} />
              <Slider plain label={tr('Kenar boşluğu', 'Spacing')} value={gap} onChange={setGap} />
              <Slider plain label={tr('Köşe yuvarlama', 'Corner radius')} value={radius} onChange={setRadius} />
              <p className="note">{tr('Hücredeki fotoğrafı sürükleyerek kaydır, tekerlekle yakınlaştır.', 'Drag a photo inside its cell to reposition; scroll to zoom.')}</p>
            </>
          ) : (
            <>
              <Segmented items={[{ id: 'v', label: tr('Dikey', 'Vertical') }, { id: 'h', label: tr('Yatay', 'Horizontal') }]} value={dir} onChange={setDir} />
              <Slider plain label={tr('Aralık', 'Gap')} value={gap} onChange={setGap} />
            </>
          )}
          <div className="group-label">{tr('Zemin', 'Background')}</div>
          <ColorRow value={bg} onChange={setBg} />
        </div>
        <div className="panel-foot">
          <button className="btn" disabled={imgs.length < 1} onClick={async () => {
            const c = render(1)
            const b = await encodeCanvas(c, 'image/png')
            await startEditing({ name: 'kolaj.png', bytes: new Uint8Array(await b.arrayBuffer()) })
          }}><Pencil size={14} /> {tr('Düzenle', 'Edit')}</button>
          <button className="btn primary" disabled={imgs.length < 1} onClick={async () => {
            const c = render(1)
            const b = await encodeCanvas(c, 'image/jpeg', 0.93)
            const p = await platform.exportSave({ bytes: new Uint8Array(await b.arrayBuffer()), ext: 'jpg', suggestedName: 'isil-kolaj' })
            if (p) useEditor.getState().toast('success', tr('Kolaj kaydedildi', 'Collage saved'), platform.isElectron ? { label: tr('Klasörde göster', 'Show in folder'), run: () => platform.reveal(p) } : undefined)
          }}><Download size={14} /> {tr('Kaydet', 'Save')}</button>
        </div>
      </aside>
    </div>
  )
}
