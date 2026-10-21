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
  modelStatus: (files: string[]) => invoke('models:status', files),
  downloadModel: (a: unknown) => invoke('models:download', a),
  cancelModel: (f: string) => invoke('models:cancel', f),
  deleteModel: (f: string) => invoke('models:delete', f),
  onModelProgress: (cb: (p: unknown) => void) => {
    const h = (_: unknown, p: unknown) => cb(p)
    ipcRenderer.on('models:progress', h)
    return () => ipcRenderer.removeListener('models:progress', h)
  },
  onnxRun: (a: unknown) => invoke('onnx:run', a),
  onnxRelease: (f: string) => invoke('onnx:release', f),
  engineStatus: () => invoke('engine:status'),
  engineInstall: (part: string) => invoke('engine:install', part),
  engineLocation: () => invoke('engine:location'),
  engineMove: (parent: string) => invoke('engine:move', parent),
  engineRemove: () => invoke('engine:remove'),
  genEdit: (a: unknown) => invoke('engine:edit', a),
  genCancel: () => invoke('engine:cancel'),
  engineFree: () => invoke('engine:free'),
  chat: (a: unknown) => invoke('engine:chat', a),
  log: (level: string, msg: string) => ipcRenderer.send('log:write', { level, msg }),
  openLog: () => invoke('log:open'),
  onBeforeClose: (cb: () => Promise<unknown>) => {
    const h = async () => {
      let r: unknown = null
      try { r = await cb() } catch { /* yine de yanıtla */ }
      ipcRenderer.send('app:close-reply', r)
    }
    ipcRenderer.on('app:before-close', h)
    return () => ipcRenderer.removeListener('app:before-close', h)
  },
  onEngineProgress: (cb: (p: unknown) => void) => {
    const h = (_: unknown, p: unknown) => cb(p)
    ipcRenderer.on('engine:progress', h)
    return () => ipcRenderer.removeListener('engine:progress', h)
  }
}

contextBridge.exposeInMainWorld('isil', api)
export type IsilApi = typeof api
