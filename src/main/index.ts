import { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, shell } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { promises as fs, createWriteStream, existsSync, writeFileSync } from 'fs'
import { join, extname, basename, dirname, normalize, sep } from 'path'
import { pathToFileURL } from 'url'
import { DEFAULT_SETTINGS, type Project, type ProjectMeta, type Settings } from '../shared/schema'
import { registerAiHandlers } from './ai'

// Dizüstünde harici GPU (ör. RTX) tercih edilsin; WebGPU/WebGL performansı için.
app.commandLine.appendSwitch('force_high_performance_gpu')
app.commandLine.appendSwitch('enable-unsafe-webgpu')

const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'Access-Control-Allow-Origin': '*'
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'isil', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
])

// Test modu: ayrı veri klasörü (kullanıcının projelerine dokunmaz)
if (process.env.ISIL_USERDATA) app.setPath('userData', process.env.ISIL_USERDATA)
const TEST_MODE = process.env.ISIL_TEST === '1'

const root = () => app.getPath('userData')
const projectsDir = () => join(root(), 'projects')
const modelsDir = () => join(root(), 'models')
const settingsFile = () => join(root(), 'settings.json')
const secretFile = () => join(root(), 'secret.bin')

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'avif']

function safeJoin(base: string, ...parts: string[]): string {
  const p = normalize(join(base, ...parts))
  if (!p.startsWith(normalize(base) + sep) && p !== normalize(base)) throw new Error('geçersiz yol')
  return p
}

async function readJSON<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

async function writeJSONAtomic(file: string, data: unknown) {
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data))
  await fs.rename(tmp, file)
}

const windowFile = () => join(root(), 'window.json')

async function createWindow() {
  const st = await readJSON<{ x?: number; y?: number; width: number; height: number; maximized?: boolean }>(windowFile(), { width: 1440, height: 900, maximized: true })
  const win = new BrowserWindow({
    x: st.x,
    y: st.y,
    width: st.width,
    height: st.height,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0e0f12',
    title: 'Işıl',
    icon: join(__dirname, '../renderer/icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#0e0f12', symbolColor: '#a3a9b4', height: 40 },
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => {
    if (st.maximized) win.maximize()
    win.show()
  })
  win.on('close', () => {
    const b = win.getNormalBounds()
    try {
      writeFileSync(windowFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }))
    } catch {
      /* yoksay */
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadURL('isil://app/index.html')
  return win
}

app.whenReady().then(async () => {
  await fs.mkdir(projectsDir(), { recursive: true })
  await fs.mkdir(modelsDir(), { recursive: true })

  // isil://project/<id>/<file>  ve  isil://model/<file>
  protocol.handle('isil', async (req) => {
    const u = new URL(req.url)
    const parts = decodeURIComponent(u.pathname).split('/').filter(Boolean)
    let file: string
    if (u.host === 'app') file = safeJoin(join(__dirname, '../renderer'), ...(parts.length ? parts : ['index.html']))
    else if (u.host === 'project') file = safeJoin(projectsDir(), ...parts)
    else if (u.host === 'model') file = safeJoin(modelsDir(), ...parts)
    else return new Response('not found', { status: 404 })
    if (!existsSync(file)) return new Response('not found', { status: 404 })
    const res = await net.fetch(pathToFileURL(file).toString())
    const headers = new Headers(res.headers)
    for (const [k, v] of Object.entries(ISOLATION_HEADERS)) headers.set(k, v)
    if (file.endsWith('.mjs') || file.endsWith('.js')) headers.set('Content-Type', 'text/javascript')
    if (file.endsWith('.wasm')) headers.set('Content-Type', 'application/wasm')
    return new Response(res.body, { status: res.status, headers })
  })

  registerIpc()
  registerAiHandlers({ getSecret: readSecret, settings: loadSettings })
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

async function loadSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await readJSON<Partial<Settings>>(settingsFile(), {})) }
}

async function readSecret(): Promise<string | null> {
  try {
    const buf = await fs.readFile(secretFile())
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(buf) : null
  } catch {
    return null
  }
}

function registerIpc() {
  const stateFile = () => join(root(), 'state.json')
  ipcMain.handle('file:open', async (e, opts: { multi?: boolean } = {}) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const state = await readJSON<{ lastDir?: string }>(stateFile(), {})
    const defaultPath = state.lastDir && existsSync(state.lastDir) ? state.lastDir : app.getPath('pictures')
    const r = await dialog.showOpenDialog(win, {
      defaultPath,
      properties: opts.multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: [{ name: 'Görseller', extensions: IMAGE_EXT }]
    })
    if (r.canceled) return []
    if (r.filePaths[0]) await writeJSONAtomic(stateFile(), { ...state, lastDir: dirname(r.filePaths[0]) })
    return Promise.all(r.filePaths.map(async (p) => ({ name: basename(p), bytes: new Uint8Array(await fs.readFile(p)) })))
  })

  ipcMain.handle('file:readPath', async (_e, p: string) => {
    const ext = extname(p).slice(1).toLowerCase()
    if (!IMAGE_EXT.includes(ext)) throw new Error('desteklenmeyen dosya')
    return { name: basename(p), bytes: new Uint8Array(await fs.readFile(p)) }
  })

  ipcMain.handle('project:list', async () => {
    const ids = await fs.readdir(projectsDir()).catch(() => [] as string[])
    const metas: ProjectMeta[] = []
    for (const id of ids) {
      const p = await readJSON<Project | null>(join(projectsDir(), id, 'project.json'), null)
      if (!p) continue
      const { doc: _d, sourceFile: _s, version: _v, ...meta } = p
      const hasThumb = existsSync(join(projectsDir(), id, 'thumb.jpg'))
      metas.push({ ...meta, thumb: hasThumb ? `isil://project/${id}/thumb.jpg?v=${encodeURIComponent(p.updatedAt)}` : null })
    }
    return metas.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  })

  ipcMain.handle('project:create', async (_e, a: { name: string; bytes: Uint8Array; width: number; height: number; doc: Project['doc'] }) => {
    const id = randomUUID()
    const dir = join(projectsDir(), id)
    await fs.mkdir(join(dir, 'raster'), { recursive: true })
    const ext = (extname(a.name).slice(1).toLowerCase() || 'jpg').replace('jpeg', 'jpg')
    const sourceFile = `source.${ext}`
    await fs.writeFile(join(dir, sourceFile), a.bytes)
    const now = new Date().toISOString()
    const project: Project = {
      id, name: a.name.replace(/\.[^.]+$/, ''), createdAt: now, updatedAt: now,
      width: a.width, height: a.height, thumb: null, sourceFile, doc: a.doc, version: 1
    }
    await writeJSONAtomic(join(dir, 'project.json'), project)
    return project
  })

  ipcMain.handle('project:load', async (_e, id: string) => {
    const p = await readJSON<Project | null>(safeJoin(projectsDir(), id, 'project.json'), null)
    if (!p) throw new Error('proje bulunamadı')
    return p
  })

  ipcMain.handle('project:save', async (_e, a: { id: string; doc: Project['doc']; name?: string; thumb?: Uint8Array }) => {
    const file = safeJoin(projectsDir(), a.id, 'project.json')
    const p = await readJSON<Project | null>(file, null)
    if (!p) throw new Error('proje bulunamadı')
    p.doc = a.doc
    if (a.name) p.name = a.name
    p.updatedAt = new Date().toISOString()
    if (a.thumb) await fs.writeFile(safeJoin(projectsDir(), a.id, 'thumb.jpg'), a.thumb)
    await writeJSONAtomic(file, p)
    return p.updatedAt
  })

  ipcMain.handle('project:putAsset', async (_e, a: { id: string; name: string; bytes: Uint8Array }) => {
    const file = safeJoin(projectsDir(), a.id, 'raster', a.name)
    await fs.writeFile(file, a.bytes)
    return `raster/${a.name}`
  })

  ipcMain.handle('project:delete', async (_e, ids: string[]) => {
    for (const id of ids) await shell.trashItem(safeJoin(projectsDir(), id))
    return true
  })

  ipcMain.handle('project:duplicate', async (_e, id: string) => {
    const nid = randomUUID()
    await fs.cp(safeJoin(projectsDir(), id), join(projectsDir(), nid), { recursive: true })
    const file = join(projectsDir(), nid, 'project.json')
    const p = await readJSON<Project>(file, null as unknown as Project)
    p.id = nid
    p.name = p.name + ' (kopya)'
    p.createdAt = p.updatedAt = new Date().toISOString()
    await writeJSONAtomic(file, p)
    return nid
  })

  ipcMain.handle('export:save', async (e, a: { bytes: Uint8Array; ext: string; suggestedName: string; dir?: string }) => {
    let target: string
    if (a.dir) {
      target = join(a.dir, a.suggestedName + '.' + a.ext)
    } else {
      const win = BrowserWindow.fromWebContents(e.sender)!
      const r = await dialog.showSaveDialog(win, {
        defaultPath: join(app.getPath('pictures'), a.suggestedName + '.' + a.ext),
        filters: [{ name: a.ext.toUpperCase(), extensions: [a.ext] }]
      })
      if (r.canceled || !r.filePath) return null
      target = r.filePath
    }
    await fs.writeFile(target, a.bytes)
    return target
  })

  ipcMain.handle('export:pickDir', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)!
    const r = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('shell:reveal', (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('app:testMode', () => TEST_MODE)

  ipcMain.handle('settings:get', loadSettings)
  ipcMain.handle('settings:set', async (_e, s: Partial<Settings>) => {
    const next = { ...(await loadSettings()), ...s }
    await writeJSONAtomic(settingsFile(), next)
    return next
  })

  ipcMain.handle('secret:set', async (_e, key: string | null) => {
    if (!key) {
      await fs.rm(secretFile(), { force: true })
      return false
    }
    if (!safeStorage.isEncryptionAvailable()) throw new Error('şifreleme kullanılamıyor')
    await fs.writeFile(secretFile(), safeStorage.encryptString(key))
    return true
  })
  ipcMain.handle('secret:has', async () => (await readSecret()) !== null)

  // Yerel model dosyaları: indir, doğrula, listele
  ipcMain.handle('models:status', async (_e, files: string[]) => {
    const out: Record<string, number> = {}
    for (const f of files) {
      try {
        out[f] = (await fs.stat(safeJoin(modelsDir(), f))).size
      } catch {
        out[f] = 0
      }
    }
    return out
  })

  const downloads = new Map<string, AbortController>()
  ipcMain.handle('models:download', async (e, a: { file: string; url: string; sha256?: string }) => {
    const target = safeJoin(modelsDir(), a.file)
    const tmp = target + '.part'
    const ac = new AbortController()
    downloads.set(a.file, ac)
    try {
      const res = await net.fetch(a.url, { signal: ac.signal })
      if (!res.ok || !res.body) throw new Error(`indirme başarısız: ${res.status}`)
      const total = Number(res.headers.get('content-length') || 0)
      const hash = createHash('sha256')
      const out = createWriteStream(tmp)
      let got = 0
      let last = 0
      const reader = res.body.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        hash.update(value)
        got += value.length
        if (!out.write(value)) await new Promise((r) => out.once('drain', r))
        const now = Date.now()
        if (now - last > 200) {
          last = now
          e.sender.send('models:progress', { file: a.file, got, total })
        }
      }
      await new Promise<void>((r, j) => out.end((err?: Error) => (err ? j(err) : r())))
      const digest = hash.digest('hex')
      if (a.sha256 && digest !== a.sha256) {
        await fs.rm(tmp, { force: true })
        throw new Error('dosya doğrulaması başarısız')
      }
      await fs.rename(tmp, target)
      e.sender.send('models:progress', { file: a.file, got, total: got, done: true })
      return { size: got, sha256: digest }
    } finally {
      downloads.delete(a.file)
    }
  })
  ipcMain.handle('models:cancel', (_e, file: string) => downloads.get(file)?.abort())
  ipcMain.handle('models:delete', async (_e, file: string) => fs.rm(safeJoin(modelsDir(), file), { force: true }))
  ipcMain.handle('models:dir', () => modelsDir())
}
