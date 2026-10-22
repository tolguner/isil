import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron'
import { createHash, randomUUID } from 'crypto'
import { promises as fs, createWriteStream, existsSync, writeFileSync } from 'fs'
import { join, extname, basename, dirname, normalize, sep } from 'path'
import { pathToFileURL } from 'url'
import { DEFAULT_SETTINGS, type Project, type ProjectMeta, type Settings } from '../shared/schema'
import { registerEngineHandlers } from './engine'
import { installMainLogging, logFile, writeLog } from './log'
import { downloadFile, ensureSpace, knownSize } from './download'

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

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'bmp', 'gif', 'avif']

// Tek pencere: "Işıl ile aç" ya da ikinci açılış yeni pencere başlatmaz, dosya açık pencereye gider
const imageArgs = (argv: string[]) => argv.slice(1).filter((a) => !a.startsWith('-') && IMAGE_EXT.includes(extname(a).slice(1).toLowerCase()) && existsSync(a))
let pendingOpen: string[] = []
if (!TEST_MODE && !app.requestSingleInstanceLock()) app.quit()
else pendingOpen = imageArgs(process.argv)
app.on('second-instance', (_e, argv) => {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
  const files = imageArgs(argv)
  if (files.length) win.webContents.send('app:open-paths', files)
})

const root = () => app.getPath('userData')
const projectsDir = () => join(root(), 'projects')
const modelsDir = () => join(root(), 'models')
const settingsFile = () => join(root(), 'settings.json')


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
  // Kapanmadan önce arayüze sor: bekleyen kaydı tamamlasın, kaydedilmemiş iş varsa kullanıcıya soralım.
  // Arayüz yanıt vermezse (donmuş ya da çökmüşse) 4 sn sonra yine kapanır.
  let closeOk = TEST_MODE, asking = false
  win.on('close', (e) => {
    if (closeOk) return
    e.preventDefault()
    if (asking) return
    asking = true
    const t = setTimeout(() => { closeOk = true; win.close() }, 4000)
    ipcMain.once('app:close-reply', async (_ev, r: { unsaved?: boolean; pending?: boolean; en?: boolean } | null) => {
      clearTimeout(t)
      if (r?.unsaved || r?.pending) {
        const en = !!r.en
        const { response } = await dialog.showMessageBox(win, {
          type: 'warning',
          buttons: en ? ['Quit anyway', 'Cancel'] : ['Yine de çık', 'Vazgeç'],
          defaultId: 1,
          cancelId: 1,
          title: 'Işıl',
          message: r.pending
            ? (en ? 'A tool result has not been applied.' : 'Bir aracın sonucu henüz uygulanmadı.')
            : (en ? 'You have unsaved changes.' : 'Kaydedilmemiş değişikliklerin var.'),
          detail: r.pending
            ? (en ? 'Press Apply in the tool first to keep it.' : "Saklamak için önce araçta Uygula'ya bas.")
            : (en ? 'Turn on autosave in Settings or press Ctrl+S to keep them.' : "Saklamak için Ctrl+S'ye bas ya da Ayarlar'da otomatik kaydı aç.")
        })
        if (response !== 0) { asking = false; return }
      }
      closeOk = true
      win.close()
    })
    win.webContents.send('app:before-close')
  })
  win.on('close', () => {
    if (!closeOk) return
    const b = win.getNormalBounds()
    try {
      writeFileSync(windowFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }))
    } catch {
      /* yoksay */
    }
  })
  // pencere uygulama dışına gidemez (bağlantı tıklaması ya da sürükle-bırak); dış bağlantılar tarayıcıda açılır
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith('isil://') || (process.env['ELECTRON_RENDERER_URL'] && url.startsWith(process.env['ELECTRON_RENDERER_URL']))) return
    e.preventDefault()
    if (url.startsWith('https://')) void shell.openExternal(url)
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
  installMainLogging()
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
  registerEngineHandlers({ root, onnxDir: modelsDir })
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

const EXPORT_EXT = ['jpg', 'png', 'webp', 'gif', 'mp4', 'webm']
const pickedDirs = new Set<string>()

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

  ipcMain.handle('project:save', async (_e, a: { id: string; doc: Project['doc']; name?: string; thumb?: Uint8Array; history?: Project['history'] }) => {
    const file = safeJoin(projectsDir(), a.id, 'project.json')
    const p = await readJSON<Project | null>(file, null)
    if (!p) throw new Error('proje bulunamadı')
    p.doc = a.doc
    if (a.history) p.history = a.history
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
    // arayüzden gelen ad, uzantı ve klasör denetlenir: yalnız bilinen biçimler, ad içinde yol yok, klasör yalnız
    // kullanıcının seçtiği klasörlerden biri
    if (!EXPORT_EXT.includes(a.ext)) throw new Error('desteklenmeyen biçim')
    a.suggestedName = (a.suggestedName || 'isil').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'isil'
    if (a.dir && !TEST_MODE && !pickedDirs.has(normalize(a.dir))) throw new Error('klasör seçilmedi')
    let target: string
    if (a.dir) {
      // klasöre doğrudan yazarken var olan dosyanın üstüne yazma: "ad (2).jpg", "ad (3).jpg"…
      target = join(a.dir, a.suggestedName + '.' + a.ext)
      for (let n = 2; existsSync(target); n++) target = join(a.dir, `${a.suggestedName} (${n}).${a.ext}`)
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
    if (r.canceled || !r.filePaths[0]) return null
    pickedDirs.add(normalize(r.filePaths[0]))
    return r.filePaths[0]
  })

  ipcMain.handle('shell:reveal', (_e, p: string) => shell.showItemInFolder(p))
  ipcMain.handle('app:testMode', () => TEST_MODE)
  ipcMain.handle('app:pendingFiles', () => { const f = pendingOpen; pendingOpen = []; return f })
  // arayüz hataları günlüğe (oran sınırı: dakikada en çok 60 satır, döngüye giren hata dosyayı şişirmesin)
  let logWin = 0, logN = 0
  ipcMain.on('log:write', (_e, a: { level?: string; msg?: string }) => {
    const now = Date.now()
    if (now - logWin > 60000) { logWin = now; logN = 0 }
    if (++logN > 60) return
    writeLog(a?.level === 'warn' ? 'warn' : 'error', 'ui', String(a?.msg ?? ''))
  })
  ipcMain.handle('log:open', async () => {
    writeLog('info', 'main', 'günlük açıldı')
    shell.showItemInFolder(logFile())
  })

  ipcMain.handle('settings:get', loadSettings)
  ipcMain.handle('settings:set', async (_e, s: Partial<Settings>) => {
    const next = { ...(await loadSettings()), ...s }
    await writeJSONAtomic(settingsFile(), next)
    return next
  })


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
  ipcMain.handle('models:download', async (e, a: { file: string; url: string; sha256?: string; extra?: { url: string } }) => {
    const target = safeJoin(modelsDir(), a.file)
    const ac = new AbortController()
    downloads.set(a.file, ac)
    try {
      await ensureSpace(modelsDir(), knownSize(a.url) ?? 0)
      let got = 0, last = 0
      const r = await downloadFile(a.url, target, {
        signal: ac.signal,
        sha256: a.sha256,
        onBytes: (n, total) => {
          got += n
          const now = Date.now()
          if (now - last > 200) { last = now; e.sender.send('models:progress', { file: a.file, got, total }) }
        }
      })
      e.sender.send('models:progress', { file: a.file, got: r.size, total: r.size, done: true })
      return r
    } finally {
      downloads.delete(a.file)
    }
  })
  ipcMain.handle('models:cancel', (_e, file: string) => downloads.get(file)?.abort())
  ipcMain.handle('models:delete', async (_e, file: string) => {
    await fs.rm(safeJoin(modelsDir(), file), { force: true })
    await fs.rm(safeJoin(modelsDir(), file) + '.part', { force: true })
  })
  ipcMain.handle('models:dir', () => modelsDir())
}
