// İndirilebilir yerel modeller (açık lisanslı). İlk kullanımda indirilir, sonra çevrimdışı çalışır.
import * as ort from 'onnxruntime-web/webgpu'
import ortWasm from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url'
import ortMjs from 'onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs?url'
import { platform, isDesktop } from '@/lib/platform'
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
  /** YZ motorunda (Python + CUDA) çalışır; motor kurulu değilse yerine fallback (tarayıcıda çalışan model) kullanılır */
  native?: boolean
  fallback?: string
  /** ayarlar listesinde gösterme (aynı dosyanın başka çalıştırma yolu) */
  hidden?: boolean
  /** ticari kullanıma kapalı lisans: yalnız Ayarlar'da "kişisel kullanım modelleri" açıksa kullanılır */
  nc?: boolean
}

const HF = 'https://huggingface.co'
export const MODELS: ModelDef[] = [
  { id: 'isnet', name: ['ISNet', 'ISNet'], task: ['Arka plan kesme', 'Background removal'], file: 'isnet_general.onnx', url: `${HF}/imgly/isnet-general-onnx/resolve/main/onnx/model.onnx`, size: 176149806, license: 'MIT' },
  // BiRefNet lite tarayıcıda çalışmıyor (WebGPU 16 depolama tamponu sınırı, WASM'da bellek biter ve
  // sonraki tüm modellerin yüklenmesini bozar); detaylı kesim yalnız YZ motoruyla.
  { id: 'birefnet', name: ['BiRefNet', 'BiRefNet'], task: ['Detaylı kesim (saç teli)', 'Detailed cutout (hair)'], file: 'birefnet_fp16.onnx', url: `${HF}/onnx-community/BiRefNet-ONNX/resolve/main/onnx/model_fp16.onnx`, size: 489666272, license: 'MIT', native: true },
  { id: 'lama', name: ['LaMa', 'LaMa'], task: ['Nesne silme', 'Object removal'], file: 'lama_fp32.onnx', url: `${HF}/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx`, size: 208044816, license: 'Apache-2.0' },
  // aynı dosya, motorda CUDA ile (tarayıcıda 15–35 sn, motorda < 1 sn); ayarlarda ayrı gösterilmez
  { id: 'lama-gpu', name: ['LaMa (GPU)', 'LaMa (GPU)'], task: ['Nesne silme', 'Object removal'], file: 'lama_fp32.onnx', url: `${HF}/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx`, size: 208044816, license: 'Apache-2.0', native: true, fallback: 'lama', hidden: true },
  { id: 'ultrasharp', nc: true, name: ['4x-UltraSharp V2', '4x-UltraSharp V2'], task: ['Kalite artırma (4×)', 'Upscale (4×)'], file: 'ultrasharp_v2.onnx', url: `${HF}/Eric111/huggingworld_onnx-image-models/resolve/main/4x-UltraSharpV2_fp32_op17.onnx`, size: 51800517, license: 'CC BY-NC-SA 4.0 (kişisel / personal)', native: true, fallback: 'esrgan' },
  { id: 'esrgan', name: ['Real-ESRGAN', 'Real-ESRGAN'], task: ['Kalite artırma (tarayıcı)', 'Upscale (browser)'], file: 'realesrgan_x4.onnx', url: `${HF}/TheGuy444/Real-ESRGAN-ONNX/resolve/main/onnx/model.onnx`, size: 42443, license: 'BSD-3-Clause', extra: { file: 'model.data', url: `${HF}/TheGuy444/Real-ESRGAN-ONNX/resolve/main/onnx/model.data`, size: 4836096 } },
  // yüz onarma adayları (Aşama 2 ölçümü; FaceFusion model deposu) — ayarlarda gösterilmez
  // yüz onarma: GFPGAN 1.4 (Aşama 2: görsel eleştirmen + kimlik ölçümünde en tutarlı; CodeFormer kişiyi değiştiriyordu)
  { id: 'gfpgan', name: ['GFPGAN 1.4', 'GFPGAN 1.4'], task: ['Yüz onarma', 'Face restoration'], file: 'gfpgan_1.4.onnx', url: `${HF}/facefusion/models-3.0.0/resolve/main/gfpgan_1.4.onnx`, size: 340299087, license: 'Apache-2.0', native: true },
  // ölçüm adayları (ayarlarda gösterilmez)
  { id: 'codeformer-w', name: ['CodeFormer (sadakat ayarlı)', 'CodeFormer (fidelity)'], task: ['Yüz onarma', 'Face restoration'], file: 'codeformer_w.onnx', url: `${HF}/facefusion/models-3.0.0/resolve/main/codeformer.onnx`, size: 376951650, license: 'S-Lab 1.0 (kişisel / personal)', native: true, hidden: true },
  { id: 'gpen', name: ['GPEN-BFR 512', 'GPEN-BFR 512'], task: ['Yüz onarma', 'Face restoration'], file: 'gpen_bfr_512.onnx', url: `${HF}/facefusion/models-3.0.0/resolve/main/gpen_bfr_512.onnx`, size: 284340240, license: 'kişisel / personal', native: true, hidden: true },
  { id: 'restoreformer', name: ['RestoreFormer++', 'RestoreFormer++'], task: ['Yüz onarma', 'Face restoration'], file: 'restoreformer_plus_plus.onnx', url: `${HF}/facefusion/models-3.0.0/resolve/main/restoreformer_plus_plus.onnx`, size: 294264232, license: 'Apache-2.0', native: true, hidden: true },
  { id: 'depth', nc: true, name: ['Depth Anything V2 Base', 'Depth Anything V2 Base'], task: ['Derinlik (ışık, odak)', 'Depth (relight, focus)'], file: 'depth_anything_v2_base_fp16.onnx', url: `${HF}/onnx-community/depth-anything-v2-base/resolve/main/onnx/model_fp16.onnx`, size: 194570657, license: 'CC BY-NC 4.0 (kişisel / personal)', native: true, fallback: 'depth-small' },
  { id: 'depth-small', name: ['Depth Anything V2 Small', 'Depth Anything V2 Small'], task: ['Derinlik (tarayıcı)', 'Depth (browser)'], file: 'depth_anything_v2_small_fp16.onnx', url: `${HF}/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_fp16.onnx`, size: 49642442, license: 'Apache-2.0' },
  { id: 'textdet', name: ['Yazı algılama (PP-OCRv4)', 'Text detection (PP-OCRv4)'], task: ['Metin silme', 'Text removal'], file: 'ppocr_det_v4.onnx', url: `${HF}/SWHL/RapidOCR/resolve/main/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx`, size: 4745517, license: 'Apache-2.0' },
  { id: 'skyseg', name: ['Gökyüzü bölütleme (U²-Net)', 'Sky segmentation (U²-Net)'], task: ['Gökyüzü değiştirme', 'Sky replacement'], file: 'skyseg.onnx', url: `${HF}/JianyuanWang/skyseg/resolve/main/skyseg.onnx`, size: 175997079, license: 'MIT' },
  // üretken çıktı denetimi (kötüye kullanım koruması): yalnız YZ motoruyla birlikte, motor içinde çalışır
  { id: 'nsfw', name: ['Çıplaklık denetimi (ViT)', 'Nudity check (ViT)'], task: ['Üretken çıktı denetimi', 'Generative output check'], file: 'nsfw_vit_int8.onnx', url: `${HF}/AdamCodd/vit-base-nsfw-detector/resolve/main/onnx/model_quantized.onnx`, size: 88500985, license: 'Apache-2.0', native: true },
  { id: 'anime', nc: true, name: ['AnimeGANv2 (yüz boyama)', 'AnimeGANv2 (face paint)'], task: ['Anime/çizim stili', 'Anime/paint style'], file: 'animegan_face_paint_v2.onnx', url: `${HF}/akhaliq/AnimeGANv2-ONNX/resolve/main/face_paint_512_v2_0.onnx`, size: 8594990, license: 'Kişisel kullanım / personal use' }
]

/** YZ motoru (Python + PyTorch CUDA) kurulu mu? Kuruluysa ağır modeller GPU'da onunla çalışır. */
export async function nativeReady(): Promise<boolean> {
  if (!isDesktop) return false
  try {
    return !!(await platform.engineStatus()).installed.runtime
  } catch {
    return false
  }
}

/** Bu ortamda kullanılacak model: motor kuruluysa güçlü model, değilse tarayıcıda çalışan yedeği. */
export async function pickModel(id: string): Promise<string> {
  const m = modelById(id)
  if (m.nc && !personalAllowed()) return m.fallback ?? id
  return m.native && m.fallback && !(await nativeReady()) ? m.fallback : id
}
/** Kullanıcı ticari olmayan (kişisel kullanım) modellere izin verdi mi? */
export const personalAllowed = () => !!useEditor.getState().settings.personalModels
/** Ayarlar ekranında gösterilecekler (tarayıcı modunda motor modelleri, izin yoksa kişisel kullanım modelleri gizli). */
export const visibleModels = () => MODELS.filter((m) => !m.hidden && (isDesktop || !m.native) && (!m.nc || personalAllowed()))

export const modelById = (id: string) => MODELS.find((m) => m.id === id)!

let configured = false
export function configureOrt() {
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
export async function ensureModel(id: string, ask = true): Promise<boolean> {
  if (await modelReady(id)) return true
  const m = modelById(id)
  const mb = Math.round((m.size + (m.extra?.size ?? 0)) / 1e6)
  const { confirmDialog } = await import('@/components/ui')
  const ok = !ask || await confirmDialog({
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

// ---------- GPU paylaşımı ----------
// 6 GB'lık kartta tarayıcıdaki WebGPU modelleri ile YZ motoru (CUDA) aynı belleği paylaşıyor; ikisi birden
// dolu kalınca ikisi de yavaşlıyor ya da modeller yüklenemiyor. GPU'yu sırayla kullanırlar.
// Motor ONNX oturumlarının arenasını her çalıştırmadan sonra küçültüyor; asıl yer kaplayanlar motorun sohbet
// modeli (≈3 GB) ve FLUX'un çalışırkenki belleği. Bu yüzden: tarayıcı modeli öncesi motordan sohbet modelini
// bırakmasını iste; FLUX/sohbet öncesi tarayıcı oturumlarını bırak (heavy). Sık bırak-yükle döngüsü WASM
// belleğini parçaladığı için hafif motor işlerinde tarayıcı oturumlarına dokunulmaz.
let engineHeavy = false
let browserLoaded = false
export async function claimGpu(who: 'browser' | 'engine', heavy = false) {
  if (who === 'browser') {
    if (engineHeavy) await platform.engineFree().catch(() => {})
    engineHeavy = false
    browserLoaded = true
  } else {
    if (heavy && browserLoaded) await Promise.all([...sessions.keys()].map((id) => releaseSession(id)))
    if (heavy) {
      engineHeavy = true
      browserLoaded = false
    }
  }
}
const wasmOnly = new Set<string>()
export let lastProvider = ''

/** WebGPU ile oturum; olmazsa WASM. */
export async function getSession(id: string): Promise<ort.InferenceSession> {
  configureOrt()
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
export async function runModel(id: string, feeds: Record<string, ort.Tensor>): Promise<{ out: ort.InferenceSession.OnnxValueMapType; sess: Pick<ort.InferenceSession, 'outputNames'> }> {
  const def = modelById(id)
  if (def.native) {
    await claimGpu('engine')
    const raw: Record<string, { data: Float32Array; dims: number[]; dtype?: string }> = {}
    for (const [k, t] of Object.entries(feeds)) raw[k] = { data: t.data as Float32Array, dims: [...t.dims], dtype: t.type }
    const r = await platform.onnxRun({ file: def.file, feeds: raw })
    lastProvider = r.provider ?? 'native'
    const out: Record<string, ort.Tensor> = {}
    for (const [k, v] of Object.entries(r.outputs)) out[k] = new ort.Tensor('float32', v.data, v.dims)
    return { out, sess: { outputNames: r.outputNames } }
  }
  await claimGpu('browser')
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
  const def = modelById(id)
  if (def.native) return platform.onnxRelease(def.file)
  const s = sessions.get(id)
  sessions.delete(id)
  if (s) (await s.catch(() => null))?.release()
}

export { ort }
