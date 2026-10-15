// MediaPipe görev sarmalayıcıları (yerel, çevrimdışı). Modeller uygulamayla gelir: public/models.
import {
  FaceLandmarker, InteractiveSegmenterLegacy, FilesetResolver, ImageSegmenter, InteractiveSegmenter, PoseLandmarker,
  type NormalizedLandmark, type BrushMode
} from '@mediapipe/tasks-vision'
import { detectFaceBoxes, boxIoU, type FaceBox } from './yunet'

// BrushMode çalışma zamanında dışa aktarılmıyor; sayısal değerler (d.ts ile aynı).
const POSITIVE = 1 as BrushMode
const NEGATIVE = 2 as BrushMode

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>
let fileset: Promise<Fileset> | null = null
const asset = (p: string) => new URL(p, document.baseURI).href

function getFileset() {
  fileset ??= FilesetResolver.forVisionTasks(asset('mediapipe/wasm'))
  return fileset
}

async function withDelegate<T>(make: (d: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await make('GPU')
  } catch (e) {
    console.warn('GPU delegesi başarısız, CPU deneniyor', e)
    return make('CPU')
  }
}

let face: Promise<FaceLandmarker> | null = null
let pose: Promise<PoseLandmarker> | null = null
let multi: Promise<ImageSegmenter> | null = null
let inter: Promise<InteractiveSegmenter> | null = null

export type Pt = { x: number; y: number; z: number }

function landmarker() {
  face ??= getFileset().then((fs) =>
    withDelegate((delegate) =>
      FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: asset('models/face_landmarker.task'), delegate },
        runningMode: 'IMAGE',
        numFaces: 8,
        minFaceDetectionConfidence: 0.4,
        minFacePresenceConfidence: 0.4
      })
    )
  )
  return face
}

const dims = (img: TexImageSource) => {
  const o = img as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number }
  return { W: o.videoWidth || o.naturalWidth || o.width || 0, H: o.videoHeight || o.naturalHeight || o.height || 0 }
}

/** Noktaların piksel kutusu. */
function ptsBox(f: Pt[], W: number, H: number): FaceBox {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0
  for (const p of f) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  return { x: x0 * W, y: y0 * H, w: (x1 - x0) * W, h: (y1 - y0) * H, score: 1 }
}

/** YuNet kutusunun büyütülmüş kırpımında 478 nokta; loşsa aydınlatarak. Koordinatlar kaynağa geri taşınır. */
async function landmarksInCrop(lm: FaceLandmarker, img: TexImageSource, b: FaceBox, W: number, H: number): Promise<Pt[] | null> {
  const side = Math.max(b.w, b.h) * 2.4
  const cx0 = b.x + b.w / 2 - side / 2, cy0 = b.y + b.h / 2 - side / 2
  const N = 384
  const c = document.createElement('canvas')
  c.width = c.height = N
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, N, N)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img as CanvasImageSource, cx0, cy0, side, side, 0, 0, N, N)
  // yüz bölgesinin parlaklığı düşükse aydınlat (loş grup fotoğrafları)
  const m = Math.round(N * 0.3)
  const d = ctx.getImageData(m, m, N - 2 * m, N - 2 * m).data
  let sum = 0
  for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  const mean = sum / (d.length / 4)
  if (mean < 90) {
    const t = document.createElement('canvas')
    t.width = t.height = N
    const tc = t.getContext('2d')!
    tc.filter = `brightness(${Math.min(3, 110 / Math.max(mean, 20)).toFixed(2)}) contrast(1.1)`
    tc.drawImage(c, 0, 0)
    ctx.drawImage(t, 0, 0)
  }
  const r = lm.detect(c)
  if (!r.faceLandmarks.length) return null
  // kırpımın ortasına en yakın yüz
  const best = r.faceLandmarks.map((l: NormalizedLandmark[]) => ({ l, d: Math.hypot(l[1].x - 0.5, l[1].y - 0.5) })).sort((p, q) => p.d - q.d)[0]
  if (best.d > 0.25) return null
  return best.l.map((p) => ({ x: (cx0 + p.x * side) / W, y: (cy0 + p.y * side) / H, z: (p.z * side) / W }))
}

/**
 * Görüntüdeki tüm yüzler: 478 nokta, normalize (0..1, v=0 üst). Soldan sağa sıralı.
 * MediaPipe'ın dedektörü küçük/loş yüzleri kaçırdığı için YuNet'in bulduğu ama eşleşmeyen her yüz
 * büyütülmüş kırpımda yeniden aranır (BUG-008).
 */
export async function detectFaces(img: TexImageSource): Promise<Pt[][]> {
  const lm = await landmarker()
  const faces: Pt[][] = lm.detect(img as HTMLCanvasElement).faceLandmarks.map((l: NormalizedLandmark[]) => l.map((p) => ({ x: p.x, y: p.y, z: p.z })))
  const { W, H } = dims(img)
  if (W && H) {
    try {
      const known = faces.map((f) => ptsBox(f, W, H))
      for (const b of await detectFaceBoxes(img as CanvasImageSource & { width: number; height: number })) {
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2
        if (known.some((k) => boxIoU(k, b) > 0.2 || (cx > k.x && cx < k.x + k.w && cy > k.y && cy < k.y + k.h))) continue
        const f = await landmarksInCrop(lm, img, b, W, H)
        if (f) {
          faces.push(f)
          known.push(ptsBox(f, W, H))
        }
        if (faces.length >= 20) break
      }
    } catch (e) {
      console.warn('YuNet çalışmadı; yalnız MediaPipe sonuçları', e)
    }
  }
  return faces.sort((a, b) => a[1].x - b[1].x)
}

/** Vücut pozu: 33 nokta, normalize. İlk kişi. */
export async function detectPose(img: TexImageSource): Promise<Pt[] | null> {
  pose ??= getFileset().then((fs) =>
    withDelegate((delegate) =>
      PoseLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: asset('models/pose_landmarker_lite.task'), delegate },
        runningMode: 'IMAGE',
        numPoses: 1
      })
    )
  )
  const r = (await pose).detect(img as HTMLCanvasElement)
  return r.landmarks[0]?.map((p) => ({ x: p.x, y: p.y, z: p.z })) ?? null
}

export interface PersonParts { w: number; h: number; hair: Float32Array; bodySkin: Float32Array; faceSkin: Float32Array; clothes: Float32Array; background: Float32Array }

/** Kişi bölütleme: saç, vücut derisi, yüz derisi, kıyafet, arka plan güven maskeleri. */
export async function segmentPerson(img: TexImageSource): Promise<PersonParts> {
  multi ??= getFileset().then((fs) =>
    withDelegate((delegate) =>
      ImageSegmenter.createFromOptions(fs, {
        baseOptions: { modelAssetPath: asset('models/selfie_multiclass_256x256.tflite'), delegate },
        runningMode: 'IMAGE',
        outputCategoryMask: false,
        outputConfidenceMasks: true
      })
    )
  )
  const r = (await multi).segment(img as HTMLCanvasElement)
  const m = r.confidenceMasks!
  const get = (i: number) => m[i].getAsFloat32Array().slice()
  const out = { w: m[0].width, h: m[0].height, background: get(0), hair: get(1), bodySkin: get(2), faceSkin: get(3), clothes: get(4) }
  r.close()
  return out
}

let interImage: TexImageSource | null = null
// GPU delegesi bu modelde güvenilmez (hata ya da boş maske); CPU ile başla.
let interMode: 'v2-gpu' | 'v2-cpu' | 'legacy' = 'v2-cpu'
let legacy: Promise<InteractiveSegmenterLegacy> | null = null

function makeV2(delegate: 'GPU' | 'CPU') {
  return getFileset().then((fs) =>
    InteractiveSegmenter.createFromOptions(fs, { baseOptions: { modelAssetPath: asset('models/interactive_segmentation.task'), delegate } })
  )
}

async function tapV2(img: TexImageSource, pos: { x: number; y: number }[], neg: { x: number; y: number }[]) {
  const seg = await inter!
  if (interImage !== img) {
    seg.setImage(img)
    interImage = img
  }
  const strokes = [
    ...pos.map((p) => ({ brushMode: POSITIVE, point: [p], isCompleted: true })),
    ...neg.map((p) => ({ brushMode: NEGATIVE, point: [p], isCompleted: true }))
  ]
  const mask = seg.segment(strokes)
  const out = { w: mask.width, h: mask.height, data: normalize(mask.getAsFloat32Array().slice()) }
  mask.close()
  if (!out.data.some((v) => v > 0.5)) throw new Error('boş maske')
  return out
}

/** Eski magic_touch modeli: tek nokta (son pozitif dokunuş). */
async function tapLegacy(img: TexImageSource, pos: { x: number; y: number }[]) {
  legacy ??= getFileset().then((fs) =>
    InteractiveSegmenterLegacy.createFromOptions(fs, {
      baseOptions: { modelAssetPath: asset('models/magic_touch.tflite'), delegate: 'CPU' },
      outputCategoryMask: false,
      outputConfidenceMasks: true
    })
  )
  const seg = await legacy
  const p = pos[pos.length - 1]
  return new Promise<{ w: number; h: number; data: Float32Array }>((res, rej) => {
    try {
      seg.segment(img as HTMLCanvasElement, { keypoint: { x: p.x, y: p.y } }, (r) => {
        const m = r.confidenceMasks?.[0] ?? r.categoryMask
        if (!m) return rej(new Error('maske yok'))
        res({ w: m.width, h: m.height, data: normalize(m.getAsFloat32Array().slice()) })
      })
    } catch (e) {
      rej(e)
    }
  })
}

/** Bazı modeller 0..255 ya da kategori döndürür; 0..1'e indir. */
function normalize(d: Float32Array) {
  let mx = 0
  for (let i = 0; i < d.length; i += 7) if (d[i] > mx) mx = d[i]
  if (mx > 1.5) for (let i = 0; i < d.length; i++) d[i] /= 255
  return d
}

/** Dokun-seç: normalize noktalar (+ ve -) → maske (0..1). GPU → CPU → eski model sırasıyla dener. */
let canvasFor: { src: TexImageSource; c: HTMLCanvasElement } | null = null
function asCanvas(img: TexImageSource): HTMLCanvasElement {
  if (img instanceof HTMLCanvasElement) return img
  if (canvasFor?.src === img) return canvasFor.c
  const s = img as { width: number; height: number }
  const c = document.createElement('canvas')
  c.width = s.width
  c.height = s.height
  c.getContext('2d')!.drawImage(img as CanvasImageSource, 0, 0)
  canvasFor = { src: img, c }
  return c
}

export async function tapSelect(src: TexImageSource, pos: { x: number; y: number }[], neg: { x: number; y: number }[] = []) {
  const img = asCanvas(src)
  for (;;) {
    try {
      if (interMode === 'legacy') return await tapLegacy(img, pos)
      inter ??= makeV2(interMode === 'v2-gpu' ? 'GPU' : 'CPU')
      return await tapV2(img, pos, neg)
    } catch (e) {
      console.warn(`dokun-seç (${interMode}) başarısız`, e)
      inter = null
      interImage = null
      if (interMode === 'v2-gpu') interMode = 'v2-cpu'
      else if (interMode === 'v2-cpu') interMode = 'legacy'
      else throw e
    }
  }
}

export function resetTapSelect() {
  interImage = null
}

/** Float maske → gri tonlama tuval (R=G=B=değer, A=255). */
export function maskToCanvas(data: Float32Array, w: number, h: number, outW = w, outH = h): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const id = ctx.createImageData(w, h)
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, Math.round(data[i] * 255)))
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v
    id.data[i * 4 + 3] = 255
  }
  ctx.putImageData(id, 0, 0)
  if (outW === w && outH === h) return c
  const o = document.createElement('canvas')
  o.width = outW
  o.height = outH
  const octx = o.getContext('2d')!
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(c, 0, 0, outW, outH)
  return o
}
