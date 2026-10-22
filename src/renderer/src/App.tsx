import { History } from 'lucide-react'
import { useRef, useState } from 'react'
import { describeStep } from './lib/history'
import { useEffect } from 'react'
import { Home as HomeIcon, Settings as Gear, Undo2, Redo2 } from 'lucide-react'
import { useEditor } from './store/editor'
import { platform } from './lib/platform'
import { useT } from './lib/i18n'
import { Home } from './screens/Home'
import { Editor, EditorTopActions } from './screens/Editor'
import { SettingsPage } from './screens/Settings'
import { Stylist } from './screens/Stylist'
import { Collage } from './screens/Collage'
import { Batch } from './screens/Batch'
import { Camera } from './screens/Camera'
import { Busy, ConfirmHost, Toasts, confirmDialog } from './components/ui'
import { beforeClose, saveNow, startEditing } from './lib/projects'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Shortcuts, Welcome } from './components/Welcome'

export function App() {
  const screen = useEditor((s) => s.screen)
  const project = useEditor((s) => s.project)
  const go = useEditor((s) => s.go)
  const tr = useT()

  useEffect(() => {
    platform.getSettings().then((s) => useEditor.getState().setSettings(s))
  }, [])
  useEffect(() => platform.onBeforeClose(beforeClose), [])

  // "Işıl ile aç" (Gezgin'de sağ tık ya da çift tık): gelen fotoğraf yeni proje olarak açılır
  useEffect(() => {
    const open = async (paths: string[]) => {
      if (!paths[0]) return
      try {
        const st = useEditor.getState()
        if (st.tool) st.closeTool(true)
        await saveNow()
        await startEditing(await platform.readPath(paths[0]))
      } catch (e) {
        useEditor.getState().toast('error', tr('Dosya açılamadı: ', 'Could not open the file: ') + (e as Error).message)
      }
    }
    void platform.pendingFiles().then(open)
    return platform.onOpenPaths(open)
  }, [])

  useEffect(() => {
    document.documentElement.lang = useEditor.getState().settings.language
  })

  const leaveEditor = async () => {
    const st = useEditor.getState()
    if (st.tool) {
      const ok = await confirmDialog({ title: tr('Araç açık', 'Tool is open'), text: tr('Açık aracın değişiklikleri uygulansın mı?', 'Apply the changes of the open tool?'), confirm: tr('Uygula', 'Apply') })
      st.closeTool(ok)
    }
    await saveNow()
    useEditor.getState().closeProject()
  }

  return (
    <div className="app">
      <header className="titlebar">
        <div className="brand">
          <img src="icon.png" alt="" width={20} height={20} style={{ borderRadius: 5 }} />
          <span>Işıl</span>
        </div>
        {screen !== 'home' && (
          <button className="icon-btn" title={tr('Ana sayfa', 'Home')} aria-label={tr('Ana sayfa', 'Home')} onClick={() => (screen === 'editor' ? leaveEditor() : go('home'))}>
            <HomeIcon size={18} />
          </button>
        )}
        {screen === 'editor' && project && <span className="crumb" title={project.name}>{project.name}</span>}
        {screen === 'editor' && <UndoRedo />}
        <div className="grow" />
        {screen === 'editor' && <EditorTopActions />}
        {screen !== 'settings' && (
          <button className="icon-btn" title={tr('Ayarlar', 'Settings')} aria-label={tr('Ayarlar', 'Settings')} onClick={() => (screen === 'editor' ? leaveEditor().then(() => go('settings')) : go('settings'))}>
            <Gear size={18} />
          </button>
        )}
      </header>
      <div className="main">
        <ErrorBoundary key={screen} onHome={screen === 'home' ? undefined : () => { useEditor.getState().closeTool(false); useEditor.getState().closeProject() }}>
        {screen === 'home' && <Home />}
        {screen === 'editor' && <Editor />}
        {screen === 'settings' && <SettingsPage />}
        {screen === 'stylist' && <Stylist />}
        {screen === 'collage' && <Collage />}
        {screen === 'batch' && <Batch />}
        {screen === 'camera' && <Camera />}
        </ErrorBoundary>
      </div>
      <Busy />
      <Toasts />
      <ConfirmHost />
      <Welcome />
      <Shortcuts />
    </div>
  )
}

function UndoRedo() {
  const canUndo = useEditor((s) => s.past.length > 0 || !!s.tool)
  const canRedo = useEditor((s) => (s.tool ? s.toolFuture.length > 0 : s.future.length > 0))
  const tr = useT()
  return (
    <>
      <button className="icon-btn" disabled={!canUndo} onClick={() => useEditor.getState().undo()} title={tr('Geri al (Ctrl+Z)', 'Undo (Ctrl+Z)')} aria-label={tr('Geri al', 'Undo')}>
        <Undo2 size={18} />
      </button>
      <button className="icon-btn" disabled={!canRedo} onClick={() => useEditor.getState().redo()} title={tr('Yinele (Ctrl+Y)', 'Redo (Ctrl+Y)')} aria-label={tr('Yinele', 'Redo')}>
        <Redo2 size={18} />
      </button>
      <HistoryButton />
    </>
  )
}

/** Geçmiş paneli: uygulanan adımlar adlarıyla; birine tıklayınca o hale dönülür (sonrakiler yinelenebilir kalır). */
function HistoryButton() {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const past = useEditor((s) => s.past)
  const future = useEditor((s) => s.future)
  const doc = useEditor((s) => s.doc)
  const n = past.length + future.length
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])
  const name = (a: [string, string]) => tr(a[0], a[1])
  // durumlar: past[0..], şimdiki, future[0..]; her satır önceki durumdan bu duruma geçen adımı adlandırır
  const states = [...past, doc, ...future]
  const cur = past.length
  const go = (k: number) => {
    const st = useEditor.getState()
    if (k < cur) st.jumpTo(k)
    else for (let i = cur; i < k; i++) useEditor.getState().redo()
  }
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" disabled={!n} aria-expanded={open} onClick={() => setOpen((o) => !o)} title={tr('Geçmiş', 'History')} aria-label={tr('Geçmiş', 'History')}>
        <History size={18} />
      </button>
      {open && (
        <div className="menu history" role="dialog" aria-label={tr('Geçmiş', 'History')} style={{ left: 0, right: 'auto' }}>
          <ol>
            {states.map((d, k) => (
              <li key={k}>
                <button className={'history-row' + (k === cur ? ' on' : k > cur ? ' future' : '')} aria-current={k === cur ? 'step' : undefined} onClick={() => { go(k); }}>
                  {k === 0 ? tr('Başlangıç', 'Start') : name(describeStep(states[k - 1], d))}
                </button>
              </li>
            ))}
          </ol>
          <p className="note">{tr('Geçmiş projeyle birlikte saklanır (en çok 30 adım).', 'History is saved with the project (up to 30 steps).')}</p>
        </div>
      )}
    </div>
  )
}
