import { create } from 'zustand'
import { emptyDoc, type EditDoc, type Project, type Settings, DEFAULT_SETTINGS } from '@shared/schema'

export type Screen = 'home' | 'editor' | 'settings' | 'collage' | 'batch' | 'stylist' | 'camera'

export type TabId =
  | 'ai' | 'recipes' | 'retouch' | 'filters' | 'adjust' | 'cleanup' | 'effects' | 'draw'
  | 'stickers' | 'text' | 'aifx' | 'cutout' | 'background' | 'reshape' | 'shapes' | 'crop'

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string; action?: { label: string; run: () => void } }

interface State {
  screen: Screen
  settings: Settings
  project: Project | null
  doc: EditDoc
  past: EditDoc[]
  future: EditDoc[]
  toolSnapshot: EditDoc | null
  tab: TabId
  tool: string | null
  selectedFace: number
  compare: boolean
  busy: { text: string; progress?: number; cancel?: () => void } | null
  toasts: Toast[]
  dirty: number
  revision: number // raster/maske değişimlerinde artar (tuval yeniden yükler)

  go(s: Screen): void
  setSettings(s: Settings): void
  openProject(p: Project): void
  closeProject(): void
  setTab(t: TabId): void
  openTool(id: string): void
  closeTool(apply: boolean): void
  update(fn: (d: EditDoc) => void): void
  commit(fn: (d: EditDoc) => void): void
  undo(): void
  redo(): void
  setCompare(v: boolean): void
  setBusy(b: State['busy']): void
  toast(kind: Toast['kind'], text: string, action?: Toast['action']): void
  dismissToast(id: number): void
  selectFace(i: number): void
  bumpRevision(): void
}

const clone = <T>(v: T): T => structuredClone(v)
let toastId = 1

/** Teknik hata iletilerini (bellek, GPU, ağ, disk) kullanıcının anlayacağı bir cümleye çevirir; bilinmeyeni olduğu gibi bırakır. */
export function friendlyError(msg: string, en = false): string {
  const m = msg.replace(/^(Uncaught )?(Error|TypeError|RangeError): /, '').trim()
  const rules: [RegExp, string, string][] = [
    [/out of memory|bad_alloc|allocation fail|OOM|CUDA error: out|not enough memory/i, 'Bellek yetmedi. Daha küçük bir görselle ya da Ayarlar → Dosya kalitesi: Küçük ile yeniden dene.', 'Ran out of memory. Try a smaller image, or Settings → File quality: Small.'],
    [/context lost|CONTEXT_LOST/i, 'Ekran kartı bağlantısı koptu. Uygulamayı yeniden başlatman gerekebilir.', 'The graphics card connection was lost. You may need to restart the app.'],
    [/failed to fetch|network|ENOTFOUND|ECONNRESET|ETIMEDOUT|ERR_INTERNET/i, 'İnternet bağlantısı kurulamadı. Bağlantını kontrol edip yeniden dene.', 'Could not connect to the internet. Check your connection and try again.'],
    [/ENOSPC|no space left|disk full/i, 'Diskte yer kalmadı. Biraz yer açıp yeniden dene.', 'The disk is full. Free some space and try again.'],
    [/EACCES|EPERM|permission denied/i, 'Dosyaya erişim izni yok. Başka bir klasör seçmeyi dene.', 'No permission to access the file. Try another folder.']
  ]
  for (const [re, tr, enText] of rules) if (re.test(m)) return en ? enText : tr
  return m || (en ? 'Something went wrong.' : 'Bir şeyler ters gitti.')
}

export const useEditor = create<State>((set, get) => ({
  screen: 'home',
  settings: DEFAULT_SETTINGS,
  project: null,
  doc: emptyDoc(),
  past: [],
  future: [],
  toolSnapshot: null,
  tab: 'adjust',
  tool: null,
  selectedFace: 0,
  compare: false,
  busy: null,
  toasts: [],
  dirty: 0,
  revision: 0,

  go: (screen) => set({ screen }),
  setSettings: (settings) => set({ settings }),
  openProject: (p) => set({ project: p, doc: clone(p.doc), past: [], future: [], toolSnapshot: null, tool: null, screen: 'editor', selectedFace: 0, revision: get().revision + 1 }),
  closeProject: () => set({ project: null, tool: null, toolSnapshot: null, screen: 'home' }),
  setTab: (tab) => {
    if (get().tool) get().closeTool(true)
    set({ tab })
  },
  openTool: (id) => {
    const s = get()
    if (s.tool === id) return
    if (s.tool) s.closeTool(true)
    set({ tool: id, toolSnapshot: clone(get().doc) })
  },
  closeTool: (apply) => {
    const s = get()
    if (!s.toolSnapshot) return set({ tool: null })
    if (apply) {
      const changed = JSON.stringify(s.toolSnapshot) !== JSON.stringify(s.doc)
      set({
        tool: null,
        toolSnapshot: null,
        past: changed ? [...s.past.slice(-79), s.toolSnapshot] : s.past,
        future: changed ? [] : s.future,
        dirty: changed ? s.dirty + 1 : s.dirty
      })
    } else {
      const rasterChanged = s.toolSnapshot.base !== s.doc.base || s.toolSnapshot.mask !== s.doc.mask
      set({ tool: null, doc: s.toolSnapshot, toolSnapshot: null, revision: rasterChanged ? s.revision + 1 : s.revision })
    }
  },
  update: (fn) => {
    const d = clone(get().doc)
    fn(d)
    set({ doc: d })
  },
  commit: (fn) => {
    const s = get()
    const before = clone(s.doc)
    const d = clone(s.doc)
    fn(d)
    if (s.toolSnapshot) set({ doc: d })
    else set({ doc: d, past: [...s.past.slice(-79), before], future: [], dirty: s.dirty + 1 })
  },
  undo: () => {
    const s = get()
    if (s.tool) return s.closeTool(false)
    const prev = s.past[s.past.length - 1]
    if (!prev) return
    const raster = prev.base !== s.doc.base || prev.mask !== s.doc.mask
    set({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], dirty: s.dirty + 1, revision: raster ? s.revision + 1 : s.revision })
  },
  redo: () => {
    const s = get()
    const next = s.future[0]
    if (!next || s.tool) return
    const raster = next.base !== s.doc.base || next.mask !== s.doc.mask
    set({ doc: next, past: [...s.past, s.doc], future: s.future.slice(1), dirty: s.dirty + 1, revision: raster ? s.revision + 1 : s.revision })
  },
  setCompare: (compare) => set({ compare }),
  setBusy: (busy) => set({ busy }),
  toast: (kind, text, action) => {
    const id = toastId++
    if (kind === 'error') text = friendlyError(text, get().settings.language === 'en')
    set({ toasts: [...get().toasts, { id, kind, text, action }] })
    // hata iletileri okunabilsin diye daha uzun kalır
    setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4500)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  selectFace: (selectedFace) => set({ selectedFace }),
  bumpRevision: () => set({ revision: get().revision + 1 })
}))
