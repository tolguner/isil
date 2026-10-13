import { useEffect, useState } from 'react'
import { Waves } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Slider, Switch } from '@/components/ui'
import { session } from '@/engine/session'
import { Renderer } from '@/engine/renderer'
import { commitRaster } from '@/lib/projects'
import type { ToolDef, View } from './types'
import { BrushOverlay } from './brush'
import { busy } from './raster'

type Mode = 'push' | 'ccw' | 'cw' | 'pinch' | 'bloat' | 'restore'
const st = { mode: 'push' as Mode, size: 0.12, strength: 60, protect: false, subject: null as Float32Array | null, sw: 0, sh: 0, touched: false }

function field() {
  if (!session.liveField) {
    const gw = 192, gh = Math.max(16, Math.round((192 * session.H) / session.W))
    session.liveField = { field: new Float32Array(gw * gh * 2), gw, gh }
  }
  return session.liveField
}

function stroke(p: { x: number; y: number }, last: { x: number; y: number }) {
  const f = field()
  const { gw, gh } = f
  const W = session.W, H = session.H
  const R = (st.size * Math.min(W, H)) / 2
  const k = st.strength / 100
  const cx = p.x * W, cy = p.y * H
  const dx = (p.x - last.x) * W, dy = (p.y - last.y) * H
  const i0 = Math.max(0, Math.floor(((cx - R) / W) * gw)), i1 = Math.min(gw - 1, Math.ceil(((cx + R) / W) * gw))
  const j0 = Math.max(0, Math.floor(((cy - R) / H) * gh)), j1 = Math.min(gh - 1, Math.ceil(((cy + R) / H) * gh))
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const px = ((i + 0.5) / gw) * W, py = ((j + 0.5) / gh) * H
      const d = Math.hypot(px - cx, py - cy)
      if (d >= R) continue
      const t = d / R
      let w = (1 - t * t) ** 2
      if (st.protect && st.subject) {
        const sx = Math.min(st.sw - 1, Math.floor((px / W) * st.sw)), sy = Math.min(st.sh - 1, Math.floor((py / H) * st.sh))
        w *= 0.15 + 0.85 * st.subject[sy * st.sw + sx]
      }
      const idx = (j * gw + i) * 2
      let ox = 0, oy = 0
      if (st.mode === 'push') { ox = -dx * w * k; oy = -dy * w * k }
      else if (st.mode === 'cw' || st.mode === 'ccw') {
        const a = (st.mode === 'cw' ? 1 : -1) * 0.06 * w * k
        const rx = px - cx, ry = py - cy
        ox = rx * Math.cos(a) - ry * Math.sin(a) - rx
        oy = rx * Math.sin(a) + ry * Math.cos(a) - ry
      } else if (st.mode === 'pinch' || st.mode === 'bloat') {
        const s = (st.mode === 'pinch' ? 1 : -1) * 0.04 * w * k
        ox = (px - cx) * s
        oy = (py - cy) * s
      } else {
        f.field[idx] *= 1 - 0.25 * w * k
        f.field[idx + 1] *= 1 - 0.25 * w * k
        continue
      }
      f.field[idx] += ox / W
      f.field[idx + 1] += oy / H
    }
  }
  st.touched = true
  session.emit()
}

function ReshapePanel() {
  const tr = useT()
  const [, f] = useState(0)
  const r = () => f((x) => x + 1)
  useEffect(() => {
    session.liveField = null
    st.touched = false
    return () => {
      session.liveField = null
      session.emit()
    }
  }, [])
  const modes: [Mode, string, string][] = [['push', 'İt', 'Push'], ['ccw', 'Sola döndür', 'Twirl left'], ['cw', 'Sağa döndür', 'Twirl right'], ['pinch', 'Daralt', 'Pinch'], ['bloat', 'Genişlet', 'Bloat'], ['restore', 'Geri yükle', 'Restore']]
  const apply = async () => {
    if (!st.touched || !session.liveField) return useEditor.getState().closeTool(false)
    await busy(tr('Uygulanıyor…', 'Applying…'), async () => {
      const full = await session.fullBase()
      const r2 = new Renderer(document.createElement('canvas'))
      try {
        r2.setBase(full)
        const lf = session.liveField!
        r2.setWarp(lf.field, lf.gw, lf.gh)
        const img = r2.bakeWarp()
        session.liveField = null
        await commitRaster(img, 'liquify')
      } finally {
        full.close()
        r2.dispose()
      }
    })
    useEditor.getState().closeTool(true)
  }
  return (
    <>
      <p className="note">{tr('Fotoğrafın üzerinde sürükleyerek şekillendir. Yüz ve vücut için Rötuş sekmesindeki otomatik araçlar daha doğal sonuç verir.', 'Drag on the photo to reshape. For faces and bodies, the automatic Retouch tools look more natural.')}</p>
      <div className="presets">
        {modes.map(([m, a, b]) => (
          <button key={m} className={'btn sm' + (st.mode === m ? ' primary' : '')} onClick={() => { st.mode = m; r() }}>{tr(a, b)}</button>
        ))}
      </div>
      <Slider label={tr('Boyut', 'Size')} min={2} max={50} value={Math.round(st.size * 100)} onChange={(v) => { st.size = v / 100; r() }} />
      <Slider label={tr('Yoğunluk', 'Strength')} min={5} max={100} value={st.strength} onChange={(v) => { st.strength = v; r() }} />
      <div className="setting">
        <div><b>{tr('Arka planı koru', 'Protect background')}</b><span>{tr('Bükme yalnızca kişiye uygulanır', 'Warp only affects the person')}</span></div>
        <Switch label="protect" on={st.protect} onChange={async (v) => {
          st.protect = v
          r()
          if (v && !st.subject) {
            const seg = await busy(tr('Kişi bölütleniyor…', 'Segmenting person…'), () => session.ensureSeg())
            if (seg) {
              st.sw = seg.w
              st.sh = seg.h
              st.subject = seg.background.map((b) => 1 - b)
            }
          }
        }} />
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn ghost" style={{ flex: 1 }} onClick={() => { session.liveField = null; session.emit(); useEditor.getState().closeTool(false) }}>{tr('İptal', 'Cancel')}</button>
        <button className="btn primary" style={{ flex: 1 }} onClick={apply}>{tr('Uygula', 'Apply')}</button>
      </div>
    </>
  )
}

function ReshapeOverlay({ view }: { view: View }) {
  const [, f] = useState(0)
  useEffect(() => {
    const t = setInterval(() => f((x) => x + 1), 300)
    return () => clearInterval(t)
  }, [])
  return <BrushOverlay view={view} brush={{ size: st.size, hardness: 0.2, erase: false }} onMove={(p, last) => stroke(p, last)} onStart={(p) => { if (st.mode !== 'push') stroke(p, p) }} />
}

export const RESHAPE_TOOLS: ToolDef[] = [{ id: 'reshape', label: ['Şekillendir', 'Reshape'], icon: Waves, Panel: ReshapePanel, Overlay: ReshapeOverlay, sourceSpace: true, noFooter: true }]
