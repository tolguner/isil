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
import { saveNow } from './lib/projects'

export function App() {
  const screen = useEditor((s) => s.screen)
  const project = useEditor((s) => s.project)
  const go = useEditor((s) => s.go)
  const tr = useT()

  useEffect(() => {
    platform.getSettings().then((s) => useEditor.getState().setSettings(s))
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
          <span className="brand-dot" aria-hidden />
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
        {screen === 'home' && <Home />}
        {screen === 'editor' && <Editor />}
        {screen === 'settings' && <SettingsPage />}
        {screen === 'stylist' && <Stylist />}
        {screen === 'collage' && <Collage />}
        {screen === 'batch' && <Batch />}
        {screen === 'camera' && <Camera />}
      </div>
      <Busy />
      <Toasts />
      <ConfirmHost />
    </div>
  )
}

function UndoRedo() {
  const canUndo = useEditor((s) => s.past.length > 0 || !!s.tool)
  const canRedo = useEditor((s) => s.future.length > 0 && !s.tool)
  const tr = useT()
  return (
    <>
      <button className="icon-btn" disabled={!canUndo} onClick={() => useEditor.getState().undo()} title={tr('Geri al (Ctrl+Z)', 'Undo (Ctrl+Z)')} aria-label={tr('Geri al', 'Undo')}>
        <Undo2 size={18} />
      </button>
      <button className="icon-btn" disabled={!canRedo} onClick={() => useEditor.getState().redo()} title={tr('Yinele (Ctrl+Y)', 'Redo (Ctrl+Y)')} aria-label={tr('Yinele', 'Redo')}>
        <Redo2 size={18} />
      </button>
    </>
  )
}
