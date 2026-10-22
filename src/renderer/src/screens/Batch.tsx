import { BEAUTY } from '@/tools/retouch'
import { batchRetouch } from '@/lib/batch'
import { normalizePicked } from '@/lib/heic'
import type { FaceEdit } from '@shared/schema'
import { useState } from 'react'
import { ImagePlus, Play, Check, X } from 'lucide-react'
import { emptyDoc, type EditDoc, type ProjectMeta } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { useT, useName } from '@/lib/i18n'
import { platform } from '@/lib/platform'
import { Segmented, Slider } from '@/components/ui'
import { Renderer } from '@/engine/renderer'
import { encodeCanvas, imageDataToCanvas } from '@/engine/session'
import { FILTERS } from '@/engine/presets'
import { RECIPES, applyRecipe } from '@/tools/recipes'

interface Item { name: string; bytes: Uint8Array; url: string; status: 'wait' | 'run' | 'done' | 'err' }

export function Batch() {
  const tr = useT()
  const name = useName()
  const [items, setItems] = useState<Item[]>([])
  const [src, setSrc] = useState<'recipe' | 'filter' | 'project'>('recipe')
  const [recipe, setRecipe] = useState(RECIPES[0].id)
  const [filter, setFilter] = useState(FILTERS[0].id)
  const [amount, setAmount] = useState(80)
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null)
  const [proj, setProj] = useState<string>('')
  const [fmt, setFmt] = useState<'jpeg' | 'png'>('jpeg')
  const [running, setRunning] = useState(false)
  // toplu rötuş: yok, tek dokunuş ön ayarı ya da (projeden kaynakta) projedeki rötuş
  const [retouch, setRetouch] = useState<string>('none')
  const [rAmount, setRAmount] = useState(60)

  const pick = async () => {
    const files = await platform.openFiles(true)
    setItems((x) => [...x, ...files.map((f) => ({ ...f, url: URL.createObjectURL(new Blob([f.bytes as BlobPart])), status: 'wait' as const }))])
  }

  const buildDoc = async (): Promise<EditDoc> => {
    const d = emptyDoc()
    if (src === 'recipe') applyRecipe(d, RECIPES.find((r) => r.id === recipe)!, amount)
    else if (src === 'filter') d.filter = { id: filter, amount }
    else if (proj) {
      const p = await platform.loadProject(proj)
      d.adjust = p.doc.adjust
      d.hsl = p.doc.hsl
      d.curves = p.doc.curves
      d.filter = p.doc.filter
      d.effects = p.doc.effects
    }
    d.layers = d.layers.filter((l) => !(l.props as Record<string, unknown>).recipe)
    return d
  }

  const run = async () => {
    if (!items.length) return
    const dir = await platform.pickDir()
    if (!dir) return
    setRunning(true)
    const doc = await buildDoc()
    let faceTpl: FaceEdit | null = null
    if (retouch === 'project' && proj) faceTpl = (await platform.loadProject(proj)).doc.retouch.faces[0] ?? null
    const doRetouch = retouch !== 'none' && (retouch !== 'project' || !!faceTpl)
    const r = new Renderer(document.createElement('canvas'))
    let ok = 0
    try {
      for (let i = 0; i < items.length; i++) {
        setItems((xs) => xs.map((x, k) => (k === i ? { ...x, status: 'run' } : x)))
        try {
          let b: Blob
          if (doRetouch) b = await batchRetouch((await normalizePicked(items[i])).bytes, items[i].name, doc, faceTpl ?? { preset: retouch, amount: rAmount }, fmt)
          else {
            const bm = await createImageBitmap(new Blob([items[i].bytes as BlobPart]), { imageOrientation: 'from-image' })
            r.setBase(bm)
            bm.close()
            const out = r.render(doc, {})
            const c = imageDataToCanvas(r.read(out.target))
            b = await encodeCanvas(c, fmt === 'png' ? 'image/png' : 'image/jpeg', useEditor.getState().settings.exportQuality / 100)
          }
          await platform.exportSave({ bytes: new Uint8Array(await b.arrayBuffer()), ext: fmt === 'png' ? 'png' : 'jpg', suggestedName: items[i].name.replace(/\.[^.]+$/, '') + '-isil', dir })
          ok++
          setItems((xs) => xs.map((x, k) => (k === i ? { ...x, status: 'done' } : x)))
        } catch (e) {
          console.error(e)
          setItems((xs) => xs.map((x, k) => (k === i ? { ...x, status: 'err' } : x)))
        }
      }
    } finally {
      r.dispose()
      setRunning(false)
    }
    useEditor.getState().toast(ok === items.length ? 'success' : 'error', tr(`${ok}/${items.length} fotoğraf kaydedildi`, `${ok}/${items.length} photos saved`), platform.isElectron ? { label: tr('Klasörü aç', 'Open folder'), run: () => platform.reveal(dir) } : undefined)
  }

  return (
    <div className="editor" style={{ gridTemplateColumns: '1fr var(--l-panel)' }}>
      <div className="stage" style={{ overflow: 'auto', padding: 24 }}>
        {items.length ? (
          <div className="grid-projects">
            {items.map((it, i) => (
              <div key={it.url} className="pcard" style={{ cursor: 'default' }}>
                <span className="thumb" style={{ backgroundImage: `url("${it.url}")` }} />
                <span className="meta">
                  <b title={it.name}>{it.name}</b>
                  <span>{it.status === 'done' ? <><Check size={12} /> {tr('Kaydedildi', 'Saved')}</> : it.status === 'run' ? tr('İşleniyor…', 'Processing…') : it.status === 'err' ? tr('Hata', 'Error') : tr('Sırada', 'Queued')}</span>
                </span>
                {!running && <button className="icon-btn" style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,.5)' }} onClick={() => setItems(items.filter((_, k) => k !== i))} aria-label={tr('Kaldır', 'Remove')}><X size={14} /></button>}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty" style={{ marginTop: 80 }}>
            <p>{tr('Aynı görünümü birçok fotoğrafa tek seferde uygula.', 'Apply one look to many photos at once.')}</p>
            <button className="btn primary" onClick={pick}><ImagePlus size={16} /> {tr('Fotoğraf seç', 'Pick photos')}</button>
          </div>
        )}
      </div>
      <aside className="panel">
        <div className="panel-head"><h3>{tr('Toplu düzenle', 'Batch edit')}</h3></div>
        <div className="panel-body">
          <button className="btn block" onClick={pick} disabled={running}><ImagePlus size={14} /> {tr('Fotoğraf ekle', 'Add photos')} ({items.length})</button>
          <div className="group-label">{tr('Görünüm kaynağı', 'Look source')}</div>
          <Segmented items={[{ id: 'recipe', label: tr('Tarif', 'Recipe') }, { id: 'filter', label: tr('Filtre', 'Look') }, { id: 'project', label: tr('Projeden', 'From project') }]} value={src} onChange={(v) => { setSrc(v); if (v === 'project' && !projects) platform.listProjects().then((p) => { setProjects(p); setProj(p[0]?.id ?? '') }) }} />
          {src === 'recipe' && (
            <select className="select" value={recipe} onChange={(e) => setRecipe(e.target.value)}>
              {RECIPES.map((r) => <option key={r.id} value={r.id}>{tr(r.name[0], r.name[1])}</option>)}
            </select>
          )}
          {src === 'filter' && (
            <select className="select" value={filter} onChange={(e) => setFilter(e.target.value)}>
              {FILTERS.map((f) => <option key={f.id} value={f.id}>{name(f.name)}</option>)}
            </select>
          )}
          {src === 'project' && (
            projects?.length ? (
              <select className="select" value={proj} onChange={(e) => setProj(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : <p className="note">{tr('Ayarları kopyalanacak bir proje yok.', 'No project to copy settings from.')}</p>
          )}
          {src !== 'project' && <Slider plain label={tr('Yoğunluk', 'Intensity')} value={amount} onChange={setAmount} />}
          {src === 'project' && <p className="note">{tr('Projedeki ayar, HSL, eğri, filtre ve efektler kopyalanır. Rötuşu da kopyalamak için aşağıdan "Projedeki rötuş"u seç; katmanlar kopyalanmaz.', 'Adjustments, HSL, curves, looks and effects are copied. To copy the retouch too, pick "Retouch from project" below; layers are not copied.')}</p>}
          <div className="group-label">{tr('Rötuş', 'Retouch')}</div>
          <select className="select" value={retouch} onChange={(e) => setRetouch(e.target.value)} disabled={running}>
            <option value="none">{tr('Rötuş yok', 'No retouch')}</option>
            {BEAUTY.map((b) => <option key={b.id} value={b.id}>{tr('Tek dokunuş: ', 'One-tap: ') + tr(b.label[0], b.label[1])}</option>)}
            {src === 'project' && <option value="project">{tr('Projedeki rötuş', 'Retouch from project')}</option>}
          </select>
          {retouch !== 'none' && retouch !== 'project' && <Slider plain label={tr('Rötuş yoğunluğu', 'Retouch intensity')} value={rAmount} onChange={setRAmount} />}
          {retouch !== 'none' && <p className="note">{tr('Her fotoğraftaki her yüze aynı rötuş uygulanır. Yüz bulma ve maskeler fotoğraf başına yapıldığı için rötuşlu toplu işlem daha yavaştır.', 'The same retouch is applied to every face in every photo. Face detection and masks run per photo, so batch retouching is slower.')}</p>}
          <div className="group-label">{tr('Biçim', 'Format')}</div>
          <Segmented items={[{ id: 'jpeg', label: 'JPG' }, { id: 'png', label: 'PNG' }]} value={fmt} onChange={setFmt} />
        </div>
        <div className="panel-foot">
          <button className="btn primary" disabled={!items.length || running} onClick={run}><Play size={14} /> {running ? tr('İşleniyor…', 'Processing…') : tr('Klasöre kaydet', 'Save to folder')}</button>
        </div>
      </aside>
    </div>
  )
}
