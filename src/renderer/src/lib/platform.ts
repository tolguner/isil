// Platform katmanı: Electron'da IPC, tarayıcıda (geliştirme/test) IndexedDB + indirme bağlantısı.
import { DEFAULT_SETTINGS, type EditDoc, type Project, type ProjectMeta, type Settings } from '@shared/schema'

export interface PickedFile { name: string; bytes: Uint8Array }
export interface EngineStatus {
  available: boolean            // bu platformda yerel motor çalışabilir mi
  installed: Record<string, boolean> // parça → kurulu mu (runtime, flux-fast, flux-best, vlm)
  running: boolean
  device?: string
  blocked?: string              // ör. Windows Uygulama Denetimi engeli
}
export interface EngineProgress { stage: 'download' | 'load' | 'generate' | 'chat'; part?: string; got?: number; total?: number; step?: number; steps?: number; text?: string }
export interface GenEditArgs { image: Uint8Array; prompt: string; refs?: Uint8Array[]; mask?: Uint8Array | null; width: number; height: number; quality: 'fast' | 'best'; seed?: number }
export interface ModelProgress { file: string; got: number; total: number; done?: boolean }

export interface Platform {
  isElectron: boolean
  openFiles(multi?: boolean): Promise<PickedFile[]>
  readDropped(f: File): Promise<PickedFile>
  listProjects(): Promise<ProjectMeta[]>
  createProject(a: { name: string; bytes: Uint8Array; width: number; height: number; doc: EditDoc }): Promise<Project>
  loadProject(id: string): Promise<Project>
  saveProject(a: { id: string; doc: EditDoc; name?: string; thumb?: Uint8Array }): Promise<string>
  putAsset(a: { id: string; name: string; bytes: Uint8Array }): Promise<string>
  getFile(id: string, rel: string): Promise<Blob>
  deleteProjects(ids: string[]): Promise<void>
  duplicateProject(id: string): Promise<string>
  exportSave(a: { bytes: Uint8Array; ext: string; suggestedName: string; dir?: string }): Promise<string | null>
  pickDir(): Promise<string | null>
  reveal(p: string): void
  getSettings(): Promise<Settings>
  setSettings(s: Partial<Settings>): Promise<Settings>
  modelUrl(file: string): string
  modelStatus(files: string[]): Promise<Record<string, number>>
  downloadModel(a: { file: string; url: string; sha256?: string }): Promise<unknown>
  cancelModel(file: string): Promise<void>
  deleteModel(file: string): Promise<void>
  onModelProgress(cb: (p: ModelProgress) => void): () => void
  onnxRun(a: { file: string; feeds: Record<string, { data: Float32Array; dims: number[]; dtype?: string }> }): Promise<{ outputs: Record<string, { data: Float32Array; dims: number[] }>; outputNames: string[]; provider?: string }>
  onnxRelease(file: string): Promise<void>
  engineStatus(): Promise<EngineStatus>
  engineInstall(part: string): Promise<void>
  genEdit(a: GenEditArgs): Promise<Uint8Array>
  genCancel(): Promise<void>
  /** motor GPU belleğini bıraksın (tarayıcı modelleri çalışmadan önce) */
  engineFree(): Promise<void>
  chat(a: { messages: { role: 'user' | 'assistant'; text: string; image?: Uint8Array }[]; system: string }): Promise<string>
  onEngineProgress(cb: (p: EngineProgress) => void): () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const w = window as any

function electronPlatform(): Platform {
  const api = w.isil
  return {
    isElectron: true,
    openFiles: (multi) => api.openFiles(multi),
    readDropped: async (f) => {
      const p = api.pathForFile(f)
      if (p) return api.readPath(p)
      return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }
    },
    listProjects: () => api.listProjects(),
    createProject: (a) => api.createProject(a),
    loadProject: (id) => api.loadProject(id),
    saveProject: (a) => api.saveProject(a),
    putAsset: (a) => api.putAsset(a),
    getFile: async (id, rel) => {
      const r = await fetch(`isil://project/${id}/${rel}`)
      if (!r.ok) throw new Error('dosya okunamadı: ' + rel)
      return r.blob()
    },
    deleteProjects: (ids) => api.deleteProjects(ids),
    duplicateProject: (id) => api.duplicateProject(id),
    exportSave: (a) => api.exportSave(a),
    pickDir: () => api.pickDir(),
    reveal: (p) => api.reveal(p),
    getSettings: () => api.getSettings(),
    setSettings: (s) => api.setSettings(s),
    modelUrl: (file) => `isil://model/${file}`,
    modelStatus: (files) => api.modelStatus(files),
    downloadModel: (a) => api.downloadModel(a),
    cancelModel: (f) => api.cancelModel(f),
    deleteModel: (f) => api.deleteModel(f),
    onModelProgress: (cb) => api.onModelProgress(cb),
    onnxRun: (a) => api.onnxRun(a),
    onnxRelease: (f) => api.onnxRelease(f),
    engineStatus: () => api.engineStatus(),
    engineInstall: (part) => api.engineInstall(part),
    genEdit: (a) => api.genEdit(a),
    genCancel: () => api.genCancel(),
    engineFree: () => api.engineFree(),
    chat: (a) => api.chat(a),
    onEngineProgress: (cb) => api.onEngineProgress(cb)
  }
}

// ---- Tarayıcı yedeği (IndexedDB) ----
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open('isil', 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('projects')
      r.result.createObjectStore('files')
      r.result.createObjectStore('kv')
    }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  const db = await idb()
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    const req = fn(s)
    t.oncomplete = () => res(req ? (req.result as T) : (undefined as T))
    t.onerror = () => rej(t.error)
  })
}

function webPlatform(): Platform {
  const pick = (multi: boolean) =>
    new Promise<PickedFile[]>((res) => {
      const i = document.createElement('input')
      i.type = 'file'
      i.accept = 'image/*'
      i.multiple = multi
      i.onchange = async () => {
        const files = Array.from(i.files ?? [])
        res(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))))
      }
      i.click()
    })
  const thumbs = new Map<string, string>()
  const p: Platform = {
    isElectron: false,
    openFiles: (multi = false) => pick(multi),
    readDropped: async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }),
    listProjects: async () => {
      const all = (await tx<Project[]>('projects', 'readonly', (s) => s.getAll())) ?? []
      const metas: ProjectMeta[] = []
      for (const pr of all) {
        let thumb = thumbs.get(pr.id + pr.updatedAt) ?? null
        if (!thumb) {
          const b = await tx<Blob | undefined>('files', 'readonly', (s) => s.get(`${pr.id}/thumb.jpg`))
          if (b) {
            thumb = URL.createObjectURL(b)
            thumbs.set(pr.id + pr.updatedAt, thumb)
          }
        }
        const { doc: _d, sourceFile: _s, version: _v, ...meta } = pr
        metas.push({ ...meta, thumb })
      }
      return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    createProject: async (a) => {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const project: Project = {
        id, name: a.name.replace(/\.[^.]+$/, ''), createdAt: now, updatedAt: now,
        width: a.width, height: a.height, thumb: null, sourceFile: 'source', doc: a.doc, version: 1
      }
      await tx('files', 'readwrite', (s) => s.put(new Blob([a.bytes as BlobPart]), `${id}/source`))
      await tx('projects', 'readwrite', (s) => s.put(project, id))
      return project
    },
    loadProject: async (id) => {
      const pr = await tx<Project | undefined>('projects', 'readonly', (s) => s.get(id))
      if (!pr) throw new Error('proje bulunamadı')
      return pr
    },
    saveProject: async (a) => {
      const pr = await p.loadProject(a.id)
      pr.doc = a.doc
      if (a.name) pr.name = a.name
      pr.updatedAt = new Date().toISOString()
      if (a.thumb) await tx('files', 'readwrite', (s) => s.put(new Blob([a.thumb as BlobPart], { type: 'image/jpeg' }), `${a.id}/thumb.jpg`))
      await tx('projects', 'readwrite', (s) => s.put(pr, a.id))
      return pr.updatedAt
    },
    putAsset: async (a) => {
      await tx('files', 'readwrite', (s) => s.put(new Blob([a.bytes as BlobPart]), `${a.id}/raster/${a.name}`))
      return `raster/${a.name}`
    },
    getFile: async (id, rel) => {
      const b = await tx<Blob | undefined>('files', 'readonly', (s) => s.get(`${id}/${rel}`))
      if (!b) throw new Error('dosya yok: ' + rel)
      return b
    },
    deleteProjects: async (ids) => {
      for (const id of ids) await tx('projects', 'readwrite', (s) => s.delete(id))
    },
    duplicateProject: async (id) => {
      const pr = await p.loadProject(id)
      const nid = crypto.randomUUID()
      const src = await p.getFile(id, pr.sourceFile)
      await tx('files', 'readwrite', (s) => s.put(src, `${nid}/source`))
      for (const op of pr.doc.rasterOps) {
        const b = await p.getFile(id, op.file).catch(() => null)
        if (b) await tx('files', 'readwrite', (s) => s.put(b, `${nid}/${op.file}`))
      }
      if (pr.doc.mask) {
        const b = await p.getFile(id, pr.doc.mask).catch(() => null)
        if (b) await tx('files', 'readwrite', (s) => s.put(b, `${nid}/${pr.doc.mask}`))
      }
      const now = new Date().toISOString()
      await tx('projects', 'readwrite', (s) => s.put({ ...pr, id: nid, name: pr.name + ' (kopya)', createdAt: now, updatedAt: now }, nid))
      return nid
    },
    exportSave: async (a) => {
      const blob = new Blob([a.bytes as BlobPart])
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${a.suggestedName}.${a.ext}`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
      return link.download
    },
    pickDir: async () => 'İndirilenler',
    reveal: () => {},
    getSettings: async () => ({ ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem('isil.settings') || '{}') as Partial<Settings>) }),
    setSettings: async (s) => {
      const next = { ...(await p.getSettings()), ...s }
      localStorage.setItem('isil.settings', JSON.stringify(next))
      return next
    },
    modelUrl: (file) => `/models/${file}`,
    modelStatus: async (files) => {
      const out: Record<string, number> = {}
      for (const f of files) {
        const r = await fetch(`/models/${f}`, { method: 'HEAD' }).catch(() => null)
        out[f] = r?.ok && !(r.headers.get('content-type') || '').includes('text/html') ? Number(r.headers.get('content-length') || 1) : 0
      }
      return out
    },
    downloadModel: async () => {
      throw new Error('Tarayıcı modunda model indirilemez')
    },
    cancelModel: async () => {},
    deleteModel: async () => {},
    onModelProgress: () => () => {},
    onnxRun: async () => {
      throw new Error('NATIVE_ONNX_UNAVAILABLE')
    },
    onnxRelease: async () => {},
    engineStatus: async () => ({ available: false, installed: {}, running: false }),
    engineInstall: async () => {
      throw new Error('Tarayıcı modunda yerel motor yok')
    },
    genEdit: async () => {
      throw new Error('Tarayıcı modunda yerel motor yok')
    },
    genCancel: async () => {},
    engineFree: async () => {},
    chat: async () => {
      throw new Error('Tarayıcı modunda yerel motor yok')
    },
    onEngineProgress: () => () => {}
  }
  return p
}

export const platform: Platform = w.isil ? electronPlatform() : webPlatform()
/** Masaüstü uygulaması mı (main süreç: DirectML ONNX, yerel motor)? */
export const isDesktop = !!w.isil
