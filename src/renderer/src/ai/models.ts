// İndirilebilir yerel modeller (açık lisanslı). İlk kullanımda indirilir, sonra çevrimdışı çalışır.
import * as ort from 'onnxruntime-web/webgpu'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import { platform } from '@/lib/platform'
import { useEditor } from '@/store/editor'
import { tNow } from '@/lib/i18n'

export interface ModelDef {
  id: string
  name: [string, string]
  task: [string, string]
  file: string
  url: string
  size: number
  license: string
  extra?: { file: string; url: string; size: number }
}

const HF = 'https://huggingface.co'
export const MODELS: ModelDef[] = [
  { id: 'isnet', name: ['ISNet', 'ISNet'], task: ['Arka plan kesme', 'Background removal'], file: 'isnet_general.onnx', url: `${HF}/imgly/isnet-general-onnx/resolve/main/onnx/model.onnx`, size: 176149806, license: 'MIT' },
  { id: 'birefnet', name: ['BiRefNet lite', 'BiRefNet lite'], task: ['Detaylı kesim (saç teli)', 'Detailed cutout (hair)'], file: 'birefnet_lite_fp16.onnx', url: `${HF}/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model_fp16.onnx`, size: 114538221, license: 'MIT' },
  { id: 'lama', name: ['LaMa', 'LaMa'], task: ['Nesne silme', 'Object removal'], file: 'lama_fp32.onnx', url: `${HF}/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx`, size: 208044816, license: 'Apache-2.0' },
  { id: 'esrgan', name: ['Real-ESRGAN', 'Real-ESRGAN'], task: ['Kalite artırma (4×)', 'Upscale (4×)'], file: 'realesrgan_x4.onnx', url: `${HF}/TheGuy444/Real-ESRGAN-ONNX/resolve/main/onnx/model.onnx`, size: 42443, license: 'BSD-3-Clause', extra: { file: 'model.data', url: `${HF}/TheGuy444/Real-ESRGAN-ONNX/resolve/main/onnx/model.data`, size: 4836096 } },
  { id: 'depth', name: ['Depth Anything V2 Small', 'Depth Anything V2 Small'], task: ['Derinlik (ışık, odak)', 'Depth (relight, focus)'], file: 'depth_anything_v2_small_fp16.onnx', url: `${HF}/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_fp16.onnx`, size: 49642442, license: 'Apache-2.0' },
  { id: 'anime', name: ['AnimeGANv2 (yüz boyama)', 'AnimeGANv2 (face paint)'], task: ['Anime/çizim stili', 'Anime/paint style'], file: 'animegan_face_paint_v2.onnx', url: `${HF}/akhaliq/AnimeGANv2-ONNX/resolve/main/face_paint_512_v2_0.onnx`, size: 8594990, license: 'Kişisel kullanım / personal use' }
]

export const modelById = (id: string) => MODELS.find((m) => m.id === id)!

let configured = false
function configure() {
  if (configured) return
  configured = true
  ort.env.wasm.wasmPaths = { wasm: new URL(ortWasm, document.baseURI).href, mjs: new URL(ortMjs, document.baseURI).href }
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(8, navigator.hardwareConcurrency || 4) : 1
  ort.env.logLevel = 'error'
  ort.env.webgpu.powerPreference = 'high-performance'
}

export async function modelReady(id: string) {
  const m = modelById(id)
  const files = [m.file, ...(m.extra ? [m.extra.file] : [])]
  const st = await platform.modelStatus(files)
  return files.every((f) => st[f] > 0)
}

/** Model yoksa (kullanıcı onayıyla) indir. */
export async function ensureModel(id: string): Promise<boolean> {
  if (await modelReady(id)) return true
  const m = modelById(id)
  const mb = Math.round((m.size + (m.extra?.size ?? 0)) / 1e6)
  const { confirmDialog } = await import('@/components/ui')
  const ok = await confirmDialog({
    title: tNow('Model indirilsin mi?', 'Download the model?'),
    text: tNow(
      `${m.task[0]} için "${m.name[0]}" modeli gerekiyor (${mb} MB, ${m.license}). Bir kez indirilir, sonra internetsiz çalışır.`,
      `"${m.name[1]}" is needed for ${m.task[1].toLowerCase()} (${mb} MB, ${m.license}). It downloads once and then works offline.`
    ),
    confirm: tNow('İndir', 'Download')
  })
  if (!ok) return false
  const st = useEditor.getState()
  const total = m.size + (m.extra?.size ?? 0)
  let doneBytes = 0
  const off = platform.onModelProgress((p) => {
    st.setBusy({ text: tNow(`${m.name[0]} indiriliyor…`, `Downloading ${m.name[1]}…`), progress: (doneBytes + p.got) / total, cancel: () => platform.cancelModel(p.file) })
  })
  try {
    st.setBusy({ text: tNow(`${m.name[0]} indiriliyor…`, `Downloading ${m.name[1]}…`), progress: 0 })
    if (m.extra) {
      await platform.downloadModel({ file: m.extra.file, url: m.extra.url })
      doneBytes += m.extra.size
    }
    await platform.downloadModel({ file: m.file, url: m.url })
    return true
  } catch (e) {
    st.toast('error', tNow('Model indirilemedi: ', 'Model download failed: ') + (e as Error).message)
    return false
  } finally {
    off()
    useEditor.getState().setBusy(null)
  }
}

const sessions = new Map<string, Promise<ort.InferenceSession>>()
const wasmOnly = new Set<string>()
export let lastProvider = ''

/** WebGPU ile oturum; olmazsa WASM. */
export async function getSession(id: string): Promise<ort.InferenceSession> {
  configure()
  let s = sessions.get(id)
  if (!s) {
    const m = modelById(id)
    s = (async () => {
      const buf = new Uint8Array(await (await fetch(platform.modelUrl(m.file))).arrayBuffer())
      const externalData = m.extra ? [{ path: m.extra.file, data: platform.modelUrl(m.extra.file) }] : undefined
      for (const ep of (wasmOnly.has(id) ? ['wasm'] : ['webgpu', 'wasm']) as ('webgpu' | 'wasm')[]) {
        try {
          const sess = await ort.InferenceSession.create(buf, { executionProviders: [ep], graphOptimizationLevel: 'all', externalData })
          lastProvider = ep
          return sess
        } catch (e) {
          console.warn(`${id}: ${ep} başarısız`, e)
        }
      }
      throw new Error('model yüklenemedi')
    })()
    sessions.set(id, s)
    s.catch(() => sessions.delete(id))
  }
  return s
}

/** Çalıştır; WebGPU çalışma anında başarısız olursa (ör. GPU sınırları) WASM ile yeniden dene. */
export async function runModel(id: string, feeds: Record<string, ort.Tensor>): Promise<{ out: ort.InferenceSession.OnnxValueMapType; sess: ort.InferenceSession }> {
  let sess = await getSession(id)
  try {
    return { out: await sess.run(feeds), sess }
  } catch (e) {
    if (wasmOnly.has(id)) throw e
    console.warn(`${id}: WebGPU çalıştırma hatası, WASM'a geçiliyor`, e)
    wasmOnly.add(id)
    await releaseSession(id)
    sess = await getSession(id)
    return { out: await sess.run(feeds), sess }
  }
}

export async function releaseSession(id: string) {
  const s = sessions.get(id)
  sessions.delete(id)
  if (s) (await s.catch(() => null))?.release()
}

export { ort }
