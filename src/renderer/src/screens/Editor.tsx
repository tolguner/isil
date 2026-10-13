import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Download, Eye, Maximize, Minus, Plus, ChevronDown, Sparkles } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { session } from '@/engine/session'
import { drawLayers } from '@/engine/layers'
import { useT } from '@/lib/i18n'
import { platform } from '@/lib/platform'
import { saveNow, scheduleSave } from '@/lib/projects'
import { TABS } from '@/tools'
import type { ToolDef, View } from '@/tools/types'
import { Tile, Segmented, Slider } from '@/components/ui'

export function Editor() {
  const tab = useEditor((s) => s.tab)
  const tool = useEditor((s) => s.tool)
  const tabDef = TABS.find((t) => t.id === tab) ?? TABS[0]
  const toolDef = tabDef.tools.find((t) => t.id === tool) ?? null

  // tek araçlı sekmeler sekmeye girince otomatik açılır (uygulandıktan sonra sonucu görmek için açılmaz)
  useEffect(() => {
    if (tabDef.auto && !useEditor.getState().tool && tabDef.tools[0]) useEditor.getState().openTool(tabDef.tools[0].id)
  }, [tab])

  // otomatik kayıt
  useEffect(() => useEditor.subscribe((s, p) => {
    if (s.dirty !== p.dirty && s.settings.autosave) scheduleSave()
  }), [])

  // klavye kısayolları
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const st = useEditor.getState()
      const typing = (e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')
      if (typing) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); st.undo() }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); st.redo() }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void saveNow().then(() => st.toast('success', st.settings.language === 'en' ? 'Saved' : 'Kaydedildi')) }
      else if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); document.getElementById('export-btn')?.click() }
      else if (e.key === '\\' && !st.compare) st.setCompare(true)
      else if (e.key === 'Escape' && st.tool && !TABS.find((t) => t.id === st.tab)?.auto) st.closeTool(false)
      else if (e.key === 'Enter' && st.tool && !(e.target as HTMLElement)?.closest('button')) st.closeTool(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === '\\') useEditor.getState().setCompare(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  return (
    <div className="editor">
      <Rail />
      <Stage toolDef={toolDef} />
      <Panel />
    </div>
  )
}

function Rail() {
  const tab = useEditor((s) => s.tab)
  const lang = useEditor((s) => s.settings.language)
  const setTab = useEditor((s) => s.setTab)
  return (
    <nav className="rail" aria-label="Araç grupları">
      {TABS.map((t) => (
        <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)} aria-current={tab === t.id}>
          <t.icon size={20} />
          <span>{lang === 'en' ? t.label[1] : t.label[0]}</span>
        </button>
      ))}
    </nav>
  )
}

function Panel() {
  const tab = useEditor((s) => s.tab)
  const tool = useEditor((s) => s.tool)
  const doc = useEditor((s) => s.doc)
  const lang = useEditor((s) => s.settings.language)
  const tr = useT()
  const tabDef = TABS.find((t) => t.id === tab) ?? TABS[0]
  const toolDef = tabDef.tools.find((t) => t.id === tool)
  const L = (l: [string, string]) => (lang === 'en' ? l[1] : l[0])
  return (
    <aside className="panel" aria-label={L(tabDef.label)}>
      <div className="panel-head">
        <h3>{toolDef && !tabDef.auto ? L(toolDef.label) : L(tabDef.label)}</h3>
      </div>
      <div className="panel-body">
        {tabDef.intro && !tool && <p className="note">{L(tabDef.intro)}</p>}
        {!tabDef.auto && tabDef.tools.length > 1 && (
          <div className="tiles" role="toolbar">
            {tabDef.tools.map((t) => (
              <Tile key={t.id} icon={<t.icon size={20} />} label={L(t.label)} on={tool === t.id} badge={t.badge} applied={t.applied?.(doc)} onClick={() => useEditor.getState().openTool(t.id)} />
            ))}
          </div>
        )}
        {toolDef && <toolDef.Panel key={toolDef.id} />}
        {!toolDef && !tabDef.auto && <p className="muted">{tr('Bir araç seç.', 'Pick a tool.')}</p>}
        {!toolDef && tabDef.auto && tabDef.tools[0] && (
          <div className="card" style={{ textAlign: 'center' }}>
            <p className="muted">{tr('Değişiklikler uygulandı.', 'Changes applied.')}</p>
            <button className="btn primary" onClick={() => useEditor.getState().openTool(tabDef.tools[0].id)}>{tr('Düzenlemeye devam et', 'Keep editing')}</button>
          </div>
        )}
      </div>
      {toolDef && !toolDef.noFooter && (
        <div className="panel-foot">
          <button className="btn ghost" onClick={() => useEditor.getState().closeTool(false)}>{tr('İptal', 'Cancel')}</button>
          <button className="btn primary" onClick={() => useEditor.getState().closeTool(true)}>{tr('Uygula', 'Apply')}</button>
        </div>
      )}
    </aside>
  )
}

function Stage({ toolDef }: { toolDef: ToolDef | null }) {
  const wrap = useRef<HTMLDivElement>(null)
  const glRef = useRef<HTMLCanvasElement>(null)
  const ovRef = useRef<HTMLCanvasElement>(null)
  const [out, setOut] = useState({ w: 1, h: 1 })
  const [view, setView] = useState({ s: 1, ox: 0, oy: 0, fit: true })
  const [box, setBox] = useState({ w: 1, h: 1 })
  const [err, setErr] = useState<string | null>(null)
  const project = useEditor((s) => s.project)
  const tr = useT()
  const raf = useRef(0)
  const drawing = useRef(false)
  const again = useRef(false)
  const toolRef = useRef(toolDef)
  toolRef.current = toolDef
  const firstSaved = useRef(false)

  const draw = useCallback(async () => {
    if (drawing.current) {
      again.current = true
      return
    }
    drawing.current = true
    try {
      const st = useEditor.getState()
      if (!st.project || !glRef.current) return
      await session.sync(st.project, st.doc)
      const src = !!toolRef.current?.sourceSpace
      const vd = toolRef.current?.viewDoc ? toolRef.current.viewDoc(st.doc) : st.doc
      const o = session.draw(vd, { compare: st.compare, skipGeometry: src, skipBackground: src })
      if (o) {
        if (!firstSaved.current) {
          firstSaved.current = true
          scheduleSave()
        }
        setOut((p) => (p.w === o.w && p.h === o.h ? p : { w: o.w, h: o.h }))
        const ov = ovRef.current
        if (ov) {
          if (ov.width !== o.w || ov.height !== o.h) {
            ov.width = o.w
            ov.height = o.h
          }
          const ctx = ov.getContext('2d')!
          ctx.clearRect(0, 0, o.w, o.h)
          if (!src && !st.compare) drawLayers(ctx, vd.layers, o.w, o.h, () => schedule())
        }
      }
      setErr(null)
    } catch (e) {
      console.error(e)
      setErr(String((e as Error).message ?? e))
    } finally {
      drawing.current = false
      if (again.current) {
        again.current = false
        schedule()
      }
    }
  }, [])

  const schedule = useCallback(() => {
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => void draw())
  }, [draw])

  useEffect(() => {
    if (!glRef.current) return
    try {
      session.attach(glRef.current)
    } catch (e) {
      setErr(String((e as Error).message))
    }
    schedule()
    const unsub = useEditor.subscribe((s, p) => {
      if (s.doc !== p.doc || s.compare !== p.compare || s.revision !== p.revision || s.tool !== p.tool) schedule()
    })
    const unsub2 = session.onChange(schedule)
    return () => {
      unsub()
      unsub2()
      session.detach()
    }
  }, [project?.id])

  // analizler
  useEffect(() => {
    const needs = toolDef?.needs ?? []
    if (!needs.length) return
    const st = useEditor.getState()
    let cancelled = false
    ;(async () => {
      try {
        if (!st.project) return
        await session.sync(st.project, st.doc)
        if (needs.includes('faces')) {
          st.setBusy({ text: tr('Yüzler algılanıyor…', 'Detecting faces…') })
          const f = await session.ensureFaces()
          if (!cancelled && !f.length) st.toast('info', tr('Bu fotoğrafta yüz bulunamadı.', 'No face found in this photo.'))
        }
        if (needs.includes('seg')) {
          st.setBusy({ text: tr('Kişi bölütleniyor…', 'Segmenting person…') })
          await session.ensureSeg()
        }
        if (needs.includes('pose')) {
          st.setBusy({ text: tr('Vücut algılanıyor…', 'Detecting body…') })
          const p = await session.ensurePose()
          if (!cancelled && !p) st.toast('info', tr('Bu fotoğrafta vücut bulunamadı.', 'No body found in this photo.'))
        }
      } catch (e) {
        console.error(e)
        st.toast('error', tr('Analiz başarısız oldu: ', 'Analysis failed: ') + (e as Error).message)
      } finally {
        useEditor.getState().setBusy(null)
        schedule()
      }
    })()
    return () => {
      cancelled = true
    }
  }, [toolDef?.id])

  // kapsayıcı boyutu
  useLayoutEffect(() => {
    const el = wrap.current!
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // sığdır
  useEffect(() => {
    if (!view.fit) return
    const pad = 48
    const s = Math.min((box.w - pad * 2) / out.w, (box.h - pad * 2 - 40) / out.h, 4)
    setView({ s, ox: (box.w - out.w * s) / 2, oy: (box.h - out.h * s) / 2 - 16, fit: true })
  }, [box.w, box.h, out.w, out.h, view.fit])

  const zoomAt = (factor: number, cx = box.w / 2, cy = box.h / 2) => {
    setView((v) => {
      const s = Math.min(16, Math.max(0.05, v.s * factor))
      const k = s / v.s
      return { s, ox: cx - (cx - v.ox) * k, oy: cy - (cy - v.oy) * k, fit: false }
    })
  }

  const space = useRef(false)
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return
      if (e.code === 'Space') { space.current = true; e.preventDefault() }
      if (e.key === 'f' || e.key === 'F') setView((v) => ({ ...v, fit: true }))
      if (e.key === '1') setView((v) => ({ s: 1, ox: (box.w - out.w) / 2, oy: (box.h - out.h) / 2, fit: false }))
      if (e.key === '+' || e.key === '=') zoomAt(1.25)
      if (e.key === '-') zoomAt(0.8)
    }
    const u = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false
    }
    window.addEventListener('keydown', d)
    window.addEventListener('keyup', u)
    return () => {
      window.removeEventListener('keydown', d)
      window.removeEventListener('keyup', u)
    }
  }, [box, out])

  const pan = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 1 || (e.button === 0 && (space.current || !toolDef?.Overlay))) {
      pan.current = { x: e.clientX, y: e.clientY, ox: view.ox, oy: view.oy }
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
      e.preventDefault()
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pan.current
    if (!p) return
    setView((v) => ({ ...v, ox: p.ox + e.clientX - p.x, oy: p.oy + e.clientY - p.y, fit: false }))
  }

  const v: View = {
    toNorm: (cx, cy) => {
      const r = wrap.current!.getBoundingClientRect()
      return { x: (cx - r.left - view.ox) / view.s / out.w, y: (cy - r.top - view.oy) / view.s / out.h }
    },
    toScreen: (x, y) => ({ x: view.ox + x * out.w * view.s, y: view.oy + y * out.h * view.s }),
    size: { w: out.w * view.s, h: out.h * view.s },
    outW: out.w,
    outH: out.h,
    scale: view.s,
    redraw: schedule
  }
  const style = { transform: `translate(${view.ox}px, ${view.oy}px) scale(${view.s})` }

  return (
    <div
      className="stage"
      ref={wrap}
      onWheel={(e) => {
        const r = wrap.current!.getBoundingClientRect()
        zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX - r.left, e.clientY - r.top)
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (pan.current = null)}
      style={{ cursor: pan.current ? 'grabbing' : !toolDef?.Overlay ? 'grab' : undefined }}
    >
      <canvas ref={glRef} className="gl" style={style} />
      <canvas ref={ovRef} className="overlay" style={style} />
      {toolDef?.Overlay && <toolDef.Overlay view={v} />}
      <CompareFlag />
      {err && <div className="hint" style={{ color: 'var(--c-danger)' }}>{tr('Görüntü çizilemedi: ', 'Render failed: ')}{err}</div>}
      <div className="hud">
        <button className="icon-btn" onClick={() => zoomAt(0.8)} aria-label={tr('Uzaklaştır', 'Zoom out')}><Minus size={16} /></button>
        <span className="zoom">{Math.round(view.s * 100 * (session.W ? out.w / session.W : 1))}%</span>
        <button className="icon-btn" onClick={() => zoomAt(1.25)} aria-label={tr('Yakınlaştır', 'Zoom in')}><Plus size={16} /></button>
        <button className="icon-btn" onClick={() => setView((x) => ({ ...x, fit: true }))} title={tr('Sığdır (F)', 'Fit (F)')} aria-label={tr('Sığdır', 'Fit')}><Maximize size={16} /></button>
        <CompareButton />
      </div>
    </div>
  )
}

function CompareFlag() {
  const compare = useEditor((s) => s.compare)
  const tr = useT()
  return compare ? <div className="hint">{tr('Orijinal', 'Original')}</div> : null
}

function CompareButton() {
  const set = useEditor((s) => s.setCompare)
  const on = useEditor((s) => s.compare)
  const tr = useT()
  return (
    <button
      className={'icon-btn' + (on ? ' on' : '')}
      onPointerDown={(e) => { e.stopPropagation(); set(true) }}
      onPointerUp={() => set(false)}
      onPointerLeave={() => set(false)}
      title={tr('Basılı tut: orijinal (\\)', 'Hold: original (\\)')}
      aria-label={tr('Orijinalle karşılaştır', 'Compare with original')}
    >
      <Eye size={16} />
    </button>
  )
}

export function EditorTopActions() {
  const tr = useT()
  const settings = useEditor((s) => s.settings)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState<'original' | 'hd'>('original')
  const [fmt, setFmt] = useState(settings.exportFormat)
  const [quality, setQuality] = useState(settings.exportQuality)
  const [maxSide, setMaxSide] = useState(settings.exportMaxSide)

  const doExport = async () => {
    const st = useEditor.getState()
    if (st.tool) st.closeTool(true)
    setOpen(false)
    try {
      st.setBusy({ text: tr('Dışa aktarılıyor…', 'Exporting…') })
      await saveNow()
      const doc = useEditor.getState().doc
      const { blob } = await session.exportBlob(doc, { exportFormat: fmt, exportQuality: quality, exportMaxSide: maxSide })
      const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'
      const name = (st.project?.name || 'isil') + '-isil'
      const path = await platform.exportSave({ bytes: new Uint8Array(await blob.arrayBuffer()), ext, suggestedName: name })
      if (path) st.toast('success', tr('Kaydedildi: ', 'Saved: ') + path.split(/[\\/]/).pop(), platform.isElectron ? { label: tr('Klasörde göster', 'Show in folder'), run: () => platform.reveal(path) } : undefined)
      void platform.setSettings({ exportFormat: fmt, exportQuality: quality, exportMaxSide: maxSide }).then(st.setSettings)
    } catch (e) {
      console.error(e)
      st.toast('error', tr('Dışa aktarma başarısız: ', 'Export failed: ') + (e as Error).message)
    } finally {
      useEditor.getState().setBusy(null)
    }
  }

  return (
    <div className="row" style={{ position: 'relative' }}>
      <button className="btn sm" onClick={() => { const st = useEditor.getState(); st.setTab('adjust'); st.openTool('enhance'); setQ('hd') }} title={tr('Kaliteyi artır', 'Enhance quality')}>
        <Sparkles size={14} /> {q === 'hd' ? 'HD' : tr('Kalite', 'Quality')}
      </button>
      <button id="export-btn" className="btn primary sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Download size={14} /> {tr('Dışa aktar', 'Export')} <ChevronDown size={14} />
      </button>
      {open && (
        <div className="menu" role="dialog" aria-label={tr('Dışa aktarma', 'Export')}>
          <Segmented items={[{ id: 'jpeg', label: 'JPG' }, { id: 'png', label: 'PNG' }, { id: 'webp', label: 'WebP' }]} value={fmt} onChange={setFmt} />
          {fmt !== 'png' && <Slider label={tr('Kalite', 'Quality')} value={quality} min={50} max={100} onChange={setQuality} />}
          <div className="field">
            <span>{tr('Boyut', 'Size')}</span>
            <select className="select" value={maxSide} onChange={(e) => setMaxSide(Number(e.target.value))}>
              <option value={0}>{tr('Orijinal', 'Original')}</option>
              <option value={4096}>4096 px</option>
              <option value={2048}>2048 px</option>
              <option value={1080}>1080 px</option>
            </select>
          </div>
          <button className="btn primary block" onClick={doExport}>{tr('Kaydet', 'Save')}</button>
        </div>
      )}
    </div>
  )
}
