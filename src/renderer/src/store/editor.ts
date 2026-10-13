import { create } from 'zustand'
import { emptyDoc, type EditDoc, type Project, type Settings, DEFAULT_SETTINGS } from '@shared/schema'

export type Screen = 'home' | 'editor' | 'projects' | 'settings' | 'collage' | 'batch' | 'stylist' | 'camera'

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
    set({ toasts: [...get().toasts, { id, kind, text, action }] })
    setTimeout(() => get().dismissToast(id), 4500)
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  selectFace: (selectedFace) => set({ selectedFace }),
  bumpRevision: () => set({ revision: get().revision + 1 })
}))
