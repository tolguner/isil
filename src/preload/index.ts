import { contextBridge, ipcRenderer, webUtils } from 'electron'

const invoke = (ch: string, ...args: unknown[]) => ipcRenderer.invoke(ch, ...args)

const api = {
  isElectron: true,
  testMode: () => invoke('app:testMode'),
  openFiles: (multi = false) => invoke('file:open', { multi }),
  readPath: (p: string) => invoke('file:readPath', p),
  pathForFile: (f: File) => webUtils.getPathForFile(f),
  listProjects: () => invoke('project:list'),
  createProject: (a: unknown) => invoke('project:create', a),
  loadProject: (id: string) => invoke('project:load', id),
  saveProject: (a: unknown) => invoke('project:save', a),
  putAsset: (a: unknown) => invoke('project:putAsset', a),
  deleteProjects: (ids: string[]) => invoke('project:delete', ids),
  duplicateProject: (id: string) => invoke('project:duplicate', id),
  exportSave: (a: unknown) => invoke('export:save', a),
  pickDir: () => invoke('export:pickDir'),
  reveal: (p: string) => invoke('shell:reveal', p),
  getSettings: () => invoke('settings:get'),
  setSettings: (s: unknown) => invoke('settings:set', s),
  setSecret: (k: string | null) => invoke('secret:set', k),
  hasSecret: () => invoke('secret:has'),
  modelStatus: (files: string[]) => invoke('models:status', files),
  downloadModel: (a: unknown) => invoke('models:download', a),
  cancelModel: (f: string) => invoke('models:cancel', f),
  deleteModel: (f: string) => invoke('models:delete', f),
  onModelProgress: (cb: (p: unknown) => void) => {
    const h = (_: unknown, p: unknown) => cb(p)
    ipcRenderer.on('models:progress', h)
    return () => ipcRenderer.removeListener('models:progress', h)
  },
  geminiEdit: (a: unknown) => invoke('gemini:edit', a),
  geminiChat: (a: unknown) => invoke('gemini:chat', a)
}

contextBridge.exposeInMainWorld('isil', api)
export type IsilApi = typeof api
