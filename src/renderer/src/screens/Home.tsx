import { useEffect, useState } from 'react'
import { Camera, Eraser, ImagePlus, LayoutGrid, Layers, MessageCircleHeart, Scissors, Sparkles, Trash2, Copy, CheckSquare, FolderOpen, Check, Wand2, Smile, PersonStanding, ZoomIn, UserMinus } from 'lucide-react'
import type { ProjectMeta } from '@shared/schema'
import { useEditor, type TabId } from '@/store/editor'
import { platform } from '@/lib/platform'
import { useT, useName } from '@/lib/i18n'
import { openExisting, startEditing } from '@/lib/projects'
import { confirmDialog } from '@/components/ui'
import { MOODS, filterById } from '@/engine/presets'
import { cutRequest } from '@/tools/cutout'
import { TEMPLATES, TemplateCard, applyTemplateById } from '@/tools/templates'

async function pickAndEdit(tab?: TabId, tool?: string, after?: () => void) {
  const files = await platform.openFiles(false)
  if (!files[0]) return
  await startEditing(files[0])
  const st = useEditor.getState()
  if (st.screen !== 'editor') return
  if (tab) st.setTab(tab)
  if (tool) st.openTool(tool)
  after?.()
}

export function Home() {
  const tr = useT()
  const name = useName()
  const go = useEditor((s) => s.go)
  const lang = useEditor((s) => s.settings.language)
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null)
  const [over, setOver] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [sel, setSel] = useState<Set<string>>(new Set())

  // toplu düzenlemenin geçici projeleri listede görünmez
  const refresh = () => platform.listProjects().then((p) => setProjects(p.filter((x) => !x.name.startsWith('~toplu-')))).catch(() => setProjects([]))
  useEffect(() => {
    refresh()
  }, [])

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setOver(false)
    const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/') || /\.(heic|heif)$/i.test(x.name))
    if (!f) {
      useEditor.getState().toast('error', tr('Lütfen bir görsel dosyası bırakın.', 'Please drop an image file.'))
      return
    }
    await startEditing(await platform.readDropped(f))
  }

  const quick: { icon: React.ReactNode; title: string; sub: string; run: () => void }[] = [
    { icon: <ImagePlus size={20} />, title: tr('Fotoğraf düzenle', 'Edit a photo'), sub: tr('Tüm araçlar', 'All tools'), run: () => pickAndEdit() },
    { icon: <Wand2 size={20} />, title: tr('Yapay zekâ editörü', 'AI editor'), sub: tr('Yazarak düzenle', 'Edit by typing'), run: () => pickAndEdit('ai') },
    { icon: <Scissors size={20} />, title: tr('Arka planı kaldır', 'Remove background'), sub: tr('Tek tıkla kes', 'One-click cutout'), run: () => { cutRequest.auto = true; void pickAndEdit('cutout', 'cutout') } },
    { icon: <Eraser size={20} />, title: tr('Sihirli silgi', 'Magic eraser'), sub: tr('İstenmeyeni sil', 'Remove objects'), run: () => pickAndEdit('cleanup', 'erase') },
    // görev kısayolları (rakip incelemesi: PicsArt "önce görev, sonra fotoğraf")
    { icon: <ZoomIn size={20} />, title: tr('Kalite artır', 'Enhance quality'), sub: tr('4× netleştir', 'Upscale 4×'), run: () => pickAndEdit('adjust', 'enhance') },
    { icon: <Smile size={20} />, title: tr('Yüz rötuşu', 'Face retouch'), sub: tr('Tek dokunuş güzellik', 'One-tap beauty'), run: () => pickAndEdit('retouch', 'beauty') },
    { icon: <PersonStanding size={20} />, title: tr('Vücut şekillendir', 'Reshape body'), sub: tr('İncelt, bacak uzat', 'Slim, longer legs'), run: () => pickAndEdit('retouch', 'body') },
    { icon: <UserMinus size={20} />, title: tr('Yoldan geçenler', 'Passers-by'), sub: tr('Kalabalığı temizle', 'Clear the crowd'), run: () => pickAndEdit('cleanup', 'passersby') },
    { icon: <LayoutGrid size={20} />, title: tr('Kolaj', 'Collage'), sub: tr('2–9 fotoğraf', '2–9 photos'), run: () => go('collage') },
    { icon: <Layers size={20} />, title: tr('Toplu düzenle', 'Batch edit'), sub: tr('Aynı ayar, çok foto', 'One look, many photos'), run: () => go('batch') },
    { icon: <MessageCircleHeart size={20} />, title: tr('Stil danışmanı', 'Style advisor'), sub: tr('Güzellik ve stil sohbeti', 'Beauty & style chat'), run: () => go('stylist') },
    { icon: <Camera size={20} />, title: tr('Kamera', 'Camera'), sub: tr('Canlı güzellik ve filtre', 'Live beauty and looks'), run: () => go('camera') }
  ]

  const toggle = (id: string) => {
    const n = new Set(sel)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setSel(n)
  }
  const del = async () => {
    const ok = await confirmDialog({
      title: tr('Projeler silinsin mi?', 'Delete projects?'),
      text: tr(`${sel.size} proje Geri Dönüşüm Kutusu'na taşınacak.`, `${sel.size} project(s) will be moved to the Recycle Bin.`),
      confirm: tr('Sil', 'Delete'),
      danger: true
    })
    if (!ok) return
    await platform.deleteProjects([...sel])
    setSel(new Set())
    setSelecting(false)
    refresh()
  }
  const dup = async () => {
    for (const id of sel) await platform.duplicateProject(id)
    setSel(new Set())
    setSelecting(false)
    refresh()
  }

  return (
    <div className="home" onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={onDrop}>
      <div className="home-inner">
        <section className="hero">
          <div>
            <h1>{tr('Fotoğraflarına ışıltı kat.', 'Make your photos glow.')}</h1>
            <p>{tr('Rötuş, filtre, arka plan ve yapay zekâ araçları; hepsi bilgisayarında, ücretsiz ve çevrimdışı.', 'Retouch, looks, backgrounds and AI tools — all on your computer, free and offline.')}</p>
            <div className="row">
              <button className="btn primary lg" onClick={() => pickAndEdit()}>
                <ImagePlus size={18} /> {tr('Fotoğraf aç', 'Open photo')}
              </button>
              <span className="muted">{tr('ya da sürükleyip bırak', 'or drag & drop')}</span>
            </div>
          </div>
          <div className={'dropzone' + (over ? ' over' : '')} aria-hidden>
            <FolderOpen size={36} />
            <div style={{ marginTop: 8 }}>{tr('Görseli buraya bırak', 'Drop an image here')}</div>
            <div className="note">JPG · PNG · WebP · AVIF</div>
          </div>
        </section>

        <div className="section-title"><h2>{tr('Hızlı başla', 'Quick start')}</h2></div>
        <div className="quick">
          {quick.map((q) => (
            <button key={q.title} onClick={q.run}>
              <span className="qi">{q.icon}</span>
              <b>{q.title}</b>
              <span>{q.sub}</span>
            </button>
          ))}
        </div>

        <div className="section-title"><h2>{tr('Şablonlar', 'Templates')}</h2></div>
        <div className="tpl-row">
          {['polaroid', 'story-pastel', 'event', 'gallery', 'story-night', 'invite'].map((id) => TEMPLATES.find((t) => t.id === id)!).map((t) => (
            <button key={t.id} className="tpl" onClick={() => pickAndEdit('recipes', 'templates', () => void applyTemplateById(t.id))}>
              <TemplateCard t={t} en={lang === 'en'} />
              <span className="tpl-name">{tr(t.name[0], t.name[1])}</span>
            </button>
          ))}
        </div>

        <div className="section-title"><h2>{tr('Tek dokunuşla ruh hali', 'One-tap moods')}</h2></div>
        <div className="recipes">
          {MOODS.map((m) => {
            const f = filterById(m.filter)
            const bg = f ? `linear-gradient(160deg, ${f.swatch[0]}, ${f.swatch[1]})` : 'linear-gradient(160deg,#ffe3b0,#5a3b1c)'
            return (
              <button key={m.id} className="recipe" onClick={() => pickAndEdit('filters', undefined, () => applyMood(m.id))}>
                <div className="sw" style={{ background: bg }} />
                <b>{name(m.name)}</b>
              </button>
            )
          })}
        </div>

        <div className="section-title">
          <h2>{tr('Projelerim', 'My projects')}</h2>
          {!!projects?.length && (
            <div className="row">
              {selecting ? (
                <>
                  <span className="muted">{tr(`${sel.size} seçili`, `${sel.size} selected`)}</span>
                  <button className="btn sm" disabled={!sel.size} onClick={dup}><Copy size={14} /> {tr('Çoğalt', 'Duplicate')}</button>
                  <button className="btn sm danger" disabled={!sel.size} onClick={del}><Trash2 size={14} /> {tr('Sil', 'Delete')}</button>
                  <button className="btn sm ghost" onClick={() => { setSelecting(false); setSel(new Set()) }}>{tr('Bitti', 'Done')}</button>
                </>
              ) : (
                <button className="btn sm ghost" onClick={() => setSelecting(true)}><CheckSquare size={14} /> {tr('Seç', 'Select')}</button>
              )}
            </div>
          )}
        </div>
        {projects === null ? (
          <div className="grid-projects" aria-busy="true">
            {[0, 1, 2, 3].map((i) => <div key={i} className="pcard" style={{ aspectRatio: '4/5.6', opacity: 0.4 }} />)}
          </div>
        ) : projects.length === 0 ? (
          <div className="empty">
            <Sparkles size={28} />
            <div>{tr('Henüz proje yok. İlk fotoğrafını aç, otomatik kaydedilir.', 'No projects yet. Open your first photo — it saves automatically.')}</div>
          </div>
        ) : (
          <div className="grid-projects">
            {projects.map((p) => (
              <button
                key={p.id}
                className={'pcard' + (sel.has(p.id) ? ' selected' : '')}
                onClick={() => (selecting ? toggle(p.id) : openExisting(p.id))}
                aria-pressed={selecting ? sel.has(p.id) : undefined}
              >
                <span className="thumb" style={{ backgroundImage: p.thumb ? `url("${p.thumb}")` : undefined }} />
                {selecting && <span className="check">{sel.has(p.id) && <Check size={14} />}</span>}
                <span className="meta">
                  <b title={p.name}>{p.name}</b>
                  <span>{new Date(p.updatedAt).toLocaleString()} · {p.width}×{p.height}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function applyMood(id: string) {
  const m = MOODS.find((x) => x.id === id)
  if (!m) return
  useEditor.getState().commit((d) => {
    for (const [k, v] of Object.entries(m.adjust)) (d.adjust as Record<string, number>)[k] = Math.round((v ?? 0) * 100)
    if (m.filter) d.filter = { id: m.filter, amount: 80 }
    if (m.effect && !d.effects.find((e) => e.id === m.effect)) d.effects.push({ id: m.effect, amount: 60 })
  })
}
