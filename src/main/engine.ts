// Yerel üretken YZ motoru: gömülü Python + PyTorch (CUDA) + diffusers yan süreci.
// Kurulum parçaları userData/engine altına iner; sunucu (engine/server.py) ilk kullanımda başlar.
// Neden Python: hazır llama.cpp / stable-diffusion.cpp ikilileri imzasız olduğu için
// Windows Akıllı Uygulama Denetimi onları engelliyor; python.org ve PyPI paketleri çalışıyor.
import { app, ipcMain, net, type WebContents } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { promises as fs, createWriteStream, existsSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { createInterface } from 'readline'

const PY_VERSION = '3.12.10'
const PIP_PACKAGES = [
  'diffusers==0.41.0',
  'transformers==5.19.0',
  'accelerate==1.15.0',
  'gguf==0.19.0',
  'bitsandbytes==0.50.2',
  'onnxruntime-gpu==1.23.2', // CUDA 12 derlemesi (torch cu128 ile aynı DLL'ler)
  'safetensors',
  'pillow'
]
const TORCH = ['torch==2.11.0', 'torchvision==0.26.0', '--index-url', 'https://download.pytorch.org/whl/cu128']

const HF = 'https://huggingface.co'
const hf = (repo: string, file: string, to = file) => ({ url: `${HF}/${repo}/resolve/main/${file}`, to })
const KLEIN = 'black-forest-labs/FLUX.2-klein-4B'
const QWEN_TOK = ['added_tokens.json', 'chat_template.jinja', 'merges.txt', 'special_tokens_map.json', 'tokenizer.json', 'tokenizer_config.json', 'vocab.json']

interface FileSpec { url: string; to: string }
interface PartSpec { dir: string; files: FileSpec[]; needs?: string[] }

/** Parça → indirilecek dosyalar (yol models/<dir>/ altına göre). */
const PARTS: Record<string, PartSpec> = {
  // FLUX.2 ortak: zamanlayıcı, belirteçleyici, VAE, temel yapılandırma (Apache-2.0, 4B deposundan)
  'flux-common': {
    dir: 'flux-common',
    files: [
      hf(KLEIN, 'model_index.json'),
      hf(KLEIN, 'LICENSE.md'),
      hf(KLEIN, 'scheduler/scheduler_config.json'),
      hf(KLEIN, 'transformer/config.json'),
      hf(KLEIN, 'vae/config.json'),
      hf(KLEIN, 'vae/diffusion_pytorch_model.safetensors'),
      ...QWEN_TOK.map((f) => hf(KLEIN, 'tokenizer/' + f))
    ]
  },
  'flux-fast': {
    dir: 'flux-fast',
    needs: ['flux-common'],
    files: [
      hf('unsloth/FLUX.2-klein-4B-GGUF', 'flux-2-klein-4b-Q5_K_M.gguf'),
      ...['config.json', 'generation_config.json', 'model.safetensors'].map((f) => hf('unsloth/Qwen3-4B-bnb-4bit', f, 'te/' + f))
    ]
  },
  'flux-best': {
    dir: 'flux-best',
    needs: ['flux-common'],
    files: [
      hf('unsloth/FLUX.2-klein-9B-GGUF', 'flux-2-klein-9b-Q4_K_M.gguf'),
      ...['config.json', 'generation_config.json', 'model.safetensors'].map((f) => hf('unsloth/Qwen3-8B-bnb-4bit', f, 'te/' + f))
    ]
  },
  vlm: {
    dir: 'vlm',
    files: ['config.json', 'generation_config.json', 'model.safetensors', 'preprocessor_config.json', 'video_preprocessor_config.json', ...QWEN_TOK].map((f) =>
      hf('unsloth/Qwen3-VL-4B-Instruct-bnb-4bit', f)
    )
  }
}

type Progress = { stage: 'download' | 'load' | 'generate' | 'chat'; part?: string; got?: number; total?: number; step?: number; steps?: number; text?: string }

export function registerEngineHandlers({ root, onnxDir }: { root: () => string; onnxDir: () => string }) {
  const engineDir = () => process.env.ISIL_ENGINE_DIR || join(root(), 'engine')
  const modelsDir = () => join(engineDir(), 'models')
  const pyDir = () => join(engineDir(), 'python')
  const pythonExe = () => process.env.ISIL_PYTHON || join(pyDir(), 'python.exe')
  const serverPy = () => (app.isPackaged ? join(process.resourcesPath, 'engine', 'server.py') : join(app.getAppPath(), 'engine', 'server.py'))
  const supported = process.platform === 'win32' && process.arch === 'x64'

  const runtimeOk = () => (process.env.ISIL_PYTHON ? existsSync(process.env.ISIL_PYTHON) : existsSync(join(pyDir(), '.ok')))
  const partOk = (p: string) => (p === 'runtime' ? runtimeOk() : existsSync(join(modelsDir(), PARTS[p]?.dir ?? p, '.ok')))

  // ---------- indirme ----------
  let installAbort: AbortController | null = null
  let device: string | undefined

  async function download(url: string, target: string, onBytes: (n: number, total: number) => void, signal: AbortSignal) {
    await fs.mkdir(dirname(target), { recursive: true })
    const tmp = target + '.part'
    const res = await net.fetch(url, { signal })
    if (!res.ok || !res.body) throw new Error(`indirme başarısız (${res.status}): ${url.split('/').pop()}`)
    const total = Number(res.headers.get('content-length') || 0)
    const out = createWriteStream(tmp)
    const reader = res.body.getReader()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!out.write(value)) await new Promise((r) => out.once('drain', r))
        onBytes(value.length, total)
      }
    } finally {
      await new Promise<void>((r) => out.end(() => r()))
    }
    await fs.rename(tmp, target)
  }

  async function installPart(part: string, send: (p: Progress) => void, signal: AbortSignal) {
    const spec = PARTS[part]
    for (const dep of spec.needs ?? []) if (!partOk(dep)) await installPart(dep, send, signal)
    const dir = join(modelsDir(), spec.dir)
    // toplam boyut için önce HEAD (yönlendirmeleri izler)
    const sizes = await Promise.all(
      spec.files.map(async (f) => {
        if (existsSync(join(dir, f.to))) return 0
        const r = await net.fetch(f.url, { method: 'HEAD', signal }).catch(() => null)
        return Number(r?.headers.get('content-length') || 0)
      })
    )
    const total = sizes.reduce((a, b) => a + b, 0)
    let got = 0
    let last = 0
    for (const f of spec.files) {
      const target = join(dir, f.to)
      if (existsSync(target)) continue
      await download(f.url, target, (n) => {
        got += n
        const now = Date.now()
        if (now - last > 250) {
          last = now
          send({ stage: 'download', part, got, total })
        }
      }, signal)
    }
    await fs.writeFile(join(dir, '.ok'), new Date().toISOString())
  }

  function run(cmd: string, args: string[], onLine: (l: string) => void, signal: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const p = spawn(cmd, args, { windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONNOUSERSITE: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' } })
      const kill = () => p.kill()
      signal.addEventListener('abort', kill)
      let tail = ''
      const feed = (d: Buffer) => {
        const s = d.toString()
        tail = (tail + s).slice(-2000)
        s.split(/\r?\n|\r/).forEach((l) => l.trim() && onLine(l.trim()))
      }
      p.stdout.on('data', feed)
      p.stderr.on('data', feed)
      p.on('error', reject)
      p.on('close', (code) => {
        signal.removeEventListener('abort', kill)
        if (signal.aborted) reject(new Error('cancelled'))
        else if (code === 0) resolve()
        else reject(new Error(`${cmd.split(/[\\/]/).pop()} ${code}: ${tail.split('\n').slice(-4).join(' ')}`))
      })
    })
  }

  async function installRuntime(send: (p: Progress) => void, signal: AbortSignal) {
    if (process.env.ISIL_PYTHON) return
    const dir = pyDir()
    await fs.rm(dir, { recursive: true, force: true })
    await fs.mkdir(dir, { recursive: true })
    const zip = join(dir, 'python.zip')
    let got = 0
    send({ stage: 'download', part: 'runtime', text: 'Python indiriliyor…' })
    await download(`https://www.python.org/ftp/python/${PY_VERSION}/python-${PY_VERSION}-embed-amd64.zip`, zip, (n, t) => {
      got += n
      send({ stage: 'download', part: 'runtime', got, total: t })
    }, signal)
    // Windows'un kendi tar'ı zip açabilir
    await run(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dir], () => {}, signal)
    await fs.rm(zip)
    // gömülü Python site-packages'ı yüklesin
    const pth = (await fs.readdir(dir)).find((f) => f.endsWith('._pth'))
    if (pth) {
      const s = await fs.readFile(join(dir, pth), 'utf8')
      await fs.writeFile(join(dir, pth), s.replace(/^#\s*import site/m, 'import site') + '\nLib\\site-packages\n')
    }
    await download('https://bootstrap.pypa.io/get-pip.py', join(dir, 'get-pip.py'), () => {}, signal)
    const py = join(dir, 'python.exe')
    const pipLine = (l: string) => {
      const m = l.match(/^(Collecting|Downloading|Installing collected packages|Successfully installed)\s*(.*)$/)
      if (m) send({ stage: 'download', part: 'runtime', text: `${m[1]} ${m[2].slice(0, 80)}` })
    }
    await run(py, [join(dir, 'get-pip.py'), '--no-warn-script-location'], pipLine, signal)
    await run(py, ['-m', 'pip', 'install', '--no-warn-script-location', ...TORCH], pipLine, signal)
    await run(py, ['-m', 'pip', 'install', '--no-warn-script-location', ...PIP_PACKAGES], pipLine, signal)
    await run(py, ['-c', 'import torch, diffusers, transformers, bitsandbytes; print(torch.cuda.is_available())'], () => {}, signal)
    await fs.rm(join(dir, 'get-pip.py'), { force: true })
    await fs.writeFile(join(dir, '.ok'), new Date().toISOString())
  }

  // ---------- sunucu süreci ----------
  let proc: ChildProcessWithoutNullStreams | null = null
  let ready: Promise<void> | null = null
  let nextId = 1
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; progress?: (p: Progress) => void }>()

  // iptal bayrağı: sunucu her adımda bu dosyaya bakar (bkz. server.py)
  const cancelFile = join(tmpdir(), 'isil-engine', `cancel-${process.pid}`)

  function start() {
    if (ready) return ready
    ready = new Promise<void>((resolve, reject) => {
      const p = spawn(pythonExe(), ['-u', serverPy()], {
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONNOUSERSITE: '1',
          ISIL_ENGINE_MODELS: modelsDir(),
          ISIL_ENGINE_CANCEL: cancelFile,
          HF_HUB_OFFLINE: '1',
          HF_HUB_DISABLE_TELEMETRY: '1',
          TRANSFORMERS_VERBOSITY: 'error',
          DIFFUSERS_VERBOSITY: 'error'
        }
      })
      proc = p
      let errTail = ''
      p.stderr.on('data', (d: Buffer) => {
        errTail = (errTail + d.toString()).slice(-4000)
        if (!app.isPackaged) process.stderr.write(d)
      })
      createInterface({ input: p.stdout }).on('line', (line) => {
        let m: { event?: string; id?: number; ok?: boolean; result?: unknown; error?: string; progress?: Progress }
        try {
          m = JSON.parse(line)
        } catch {
          return
        }
        if (m.event === 'ready') return resolve()
        const job = m.id != null ? pending.get(m.id) : undefined
        if (!job) return
        if (m.progress) return job.progress?.(m.progress)
        pending.delete(m.id!)
        if (m.ok) job.resolve(m.result)
        else job.reject(new Error(m.error || 'engine error'))
      })
      p.on('error', (e) => reject(e))
      p.on('close', (code) => {
        proc = null
        ready = null
        const err = new Error(code === 0 ? 'engine stopped' : `motor kapandı (${code}): ${errTail.split('\n').filter(Boolean).slice(-3).join(' | ')}`)
        reject(err)
        for (const j of pending.values()) j.reject(err)
        pending.clear()
      })
    })
    return ready
  }

  async function call<T>(cmd: string, args: Record<string, unknown>, progress?: (p: Progress) => void): Promise<T> {
    await start()
    await fs.rm(cancelFile, { force: true })
    const id = nextId++
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject, progress })
      proc!.stdin.write(JSON.stringify({ id, cmd, ...args }) + '\n')
    })
  }

  app.on('before-quit', () => proc?.kill())

  const tmp = () => join(tmpdir(), 'isil-engine')
  async function putTmp(bytes: Uint8Array) {
    await fs.mkdir(tmp(), { recursive: true })
    const f = join(tmp(), randomUUID() + '.png')
    await fs.writeFile(f, bytes)
    return f
  }
  const sender = (wc: WebContents) => (p: Progress) => {
    if (!wc.isDestroyed()) wc.send('engine:progress', p)
  }

  // ---------- IPC ----------
  ipcMain.handle('engine:status', async () => {
    const installed: Record<string, boolean> = {}
    for (const p of ['runtime', 'flux-fast', 'flux-best', 'vlm']) installed[p] = partOk(p)
    return { available: supported || !!process.env.ISIL_PYTHON, installed, running: !!proc, device }
  })

  ipcMain.handle('engine:install', async (e, part: string) => {
    if (installAbort) throw new Error('başka bir kurulum sürüyor')
    installAbort = new AbortController()
    const send = sender(e.sender)
    try {
      if (part === 'runtime') await installRuntime(send, installAbort.signal)
      else if (PARTS[part]) await installPart(part, send, installAbort.signal)
      else throw new Error('bilinmeyen parça: ' + part)
    } catch (err) {
      if (installAbort.signal.aborted) throw new Error('cancelled')
      throw err
    } finally {
      installAbort = null
    }
  })

  ipcMain.handle('engine:cancel', () => {
    installAbort?.abort()
    proc?.stdin.write(JSON.stringify({ cmd: 'cancel' }) + '\n')
  })

  ipcMain.handle('engine:edit', async (e, a: { image: Uint8Array; prompt: string; refs?: Uint8Array[]; mask?: Uint8Array | null; width: number; height: number; quality: 'fast' | 'best'; seed?: number; strength?: number }) => {
    const files: string[] = []
    try {
      const image = await putTmp(a.image)
      const refs = await Promise.all((a.refs ?? []).map(putTmp))
      const mask = a.mask ? await putTmp(a.mask) : null
      const out = join(tmp(), randomUUID() + '.png')
      files.push(image, ...refs, out, ...(mask ? [mask] : []))
      if (!device) device = (await call<{ device: string }>('info', {}).catch(() => null))?.device
      await call('edit', { model: a.quality === 'best' ? 'flux-best' : 'flux-fast', image, refs, mask, prompt: a.prompt, width: a.width, height: a.height, seed: a.seed, strength: a.strength, out }, sender(e.sender))
      return new Uint8Array(await fs.readFile(out))
    } finally {
      for (const f of files) void fs.rm(f, { force: true })
    }
  })

  // Ağır ONNX modelleri motorda CUDA ile çalışır. Tensörler geçici .bin dosyalarıyla taşınır.
  ipcMain.handle('onnx:run', async (_e, a: { file: string; feeds: Record<string, { data: Float32Array; dims: number[]; dtype?: string }> }) => {
    if (!runtimeOk()) throw new Error('ENGINE_RUNTIME_MISSING')
    await fs.mkdir(tmp(), { recursive: true })
    const files: string[] = []
    try {
      const feeds: Record<string, { path: string; dims: number[]; dtype?: string }> = {}
      for (const [k, v] of Object.entries(a.feeds)) {
        const f = join(tmp(), randomUUID() + '.bin')
        files.push(f)
        await fs.writeFile(f, Buffer.from(v.data.buffer, v.data.byteOffset, v.data.byteLength))
        feeds[k] = { path: f, dims: v.dims, dtype: v.dtype }
      }
      const out = join(tmp(), randomUUID() + '.bin')
      files.push(out)
      const r = await call<{ outputs: Record<string, { path: string; dims: number[] }>; outputNames: string[]; provider: string }>('onnx', { model: join(onnxDir(), a.file), feeds, out })
      const outputs: Record<string, { data: Float32Array; dims: number[] }> = {}
      for (const [k, v] of Object.entries(r.outputs)) {
        const b = await fs.readFile(v.path)
        outputs[k] = { data: new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4), dims: v.dims }
      }
      return { outputs, outputNames: r.outputNames, provider: r.provider }
    } finally {
      for (const f of files) void fs.rm(f, { force: true })
    }
  })
  // arayüz GPU'yu WebGPU modelleri için istiyor: motor elindeki ONNX/sohbet belleğini bıraksın
  ipcMain.handle('engine:free', async () => {
    if (proc) await call('free', {}).catch(() => {})
  })
  ipcMain.handle('onnx:release', async (_e, file: string) => {
    if (proc) await call('onnx_release', { model: join(onnxDir(), file) }).catch(() => {})
  })

  ipcMain.handle('engine:chat', async (e, a: { messages: { role: 'user' | 'assistant'; text: string; image?: Uint8Array }[]; system: string }) => {
    const files: string[] = []
    try {
      const messages = await Promise.all(a.messages.map(async (m) => {
        if (!m.image) return { role: m.role, text: m.text }
        const f = await putTmp(m.image)
        files.push(f)
        return { role: m.role, text: m.text, image: f }
      }))
      const r = await call<{ text: string }>('chat', { messages, system: a.system }, sender(e.sender))
      return r.text
    } finally {
      for (const f of files) void fs.rm(f, { force: true })
    }
  })
}
