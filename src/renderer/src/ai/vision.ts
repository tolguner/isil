// MediaPipe görev sarmalayıcıları (yerel, çevrimdışı). Modeller uygulamayla gelir: public/models.
import {
  FaceLandmarker, InteractiveSegmenterLegacy, FilesetResolver, ImageSegmenter, InteractiveSegmenter, ObjectDetector, PoseLandmarker,
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
  // farklı kırpım genişlikleri: sakal, pipo gibi yüzü uzatan ögelerde dedektör bazı ölçeklerde yüzü kaçırıyor
  // (çeşitli fotoğraf turu: piposu ve uzun sakalı olan yaşlı adam yalnız sıkı ve küçük kırpımda bulundu)
  for (const [k, N] of [[2.4, 384], [1.7, 256], [1.3, 256], [3.2, 384]]) {
    const r = await landmarksInCropAt(lm, img, b, W, H, k, N)
    if (r) return r
  }
  return null
}

async function landmarksInCropAt(lm: FaceLandmarker, img: TexImageSource, b: FaceBox, W: number, H: number, k: number, N: number): Promise<Pt[] | null> {
  const side = Math.max(b.w, b.h) * k
  const cx0 = b.x + b.w / 2 - side / 2, cy0 = b.y + b.h / 2 - side / 2
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

/** Hızlı yüz noktaları (canlı kamera için): yalnız MediaPipe, YuNet ek taraması yok. */
export async function detectFacesFast(img: TexImageSource): Promise<Pt[][]> {
  const lm = await landmarker()
  return lm.detect(img as HTMLCanvasElement).faceLandmarks.map((l: NormalizedLandmark[]) => l.map((p) => ({ x: p.x, y: p.y, z: p.z })))
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
  const model = await multi
  // model yüklenirken proje değişirse önizleme bitmap'i kapanır (0×0); MediaPipe'a verme, konsola hata düşer
  const { width, height } = img as { width: number; height: number }
  if (!width || !height) throw new Error('görüntü kapandı')
  const r = model.segment(img as HTMLCanvasElement)
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

// ---- Kişi bulma (yoldan geçenleri silme) ----
let objdet: Promise<ObjectDetector> | null = null
function objectDetector() {
  objdet ??= getFileset().then((fs) =>
    withDelegate((delegate) =>
      ObjectDetector.createFromOptions(fs, {
        baseOptions: { modelAssetPath: asset('models/efficientdet_lite2.tflite'), delegate },
        runningMode: 'IMAGE',
        categoryAllowlist: ['person'],
        scoreThreshold: 0.22,
        maxResults: 60
      })
    )
  )
  return objdet
}

export interface PersonBox { x: number; y: number; w: number; h: number; score: number } // normalize 0..1

const iou = (a: PersonBox, b: PersonBox) => {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h)
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0)
  return i / (a.w * a.h + b.w * b.h - i || 1)
}

/**
 * Kişi kutuları: tüm görüntü + örtüşen 2×2 karo (küçük/uzaktaki kişiler için), sonra NMS.
 * EfficientDet-Lite2 (COCO "person", Apache-2.0), MediaPipe ile yerel.
 */
export async function detectPeople(img: TexImageSource): Promise<PersonBox[]> {
  const det = await objectDetector()
  const { W, H } = dims(img)
  if (!W || !H) return []
  const all: PersonBox[] = []
  const run = (sx: number, sy: number, sw: number, sh: number) => {
    const c = document.createElement('canvas')
    const sc = Math.min(1, 1024 / Math.max(sw, sh))
    c.width = Math.round(sw * sc)
    c.height = Math.round(sh * sc)
    c.getContext('2d')!.drawImage(img as CanvasImageSource, sx, sy, sw, sh, 0, 0, c.width, c.height)
    for (const d of det.detect(c).detections) {
      const b = d.boundingBox
      if (!b) continue
      all.push({ x: (sx + b.originX / sc) / W, y: (sy + b.originY / sc) / H, w: b.width / sc / W, h: b.height / sc / H, score: d.categories[0]?.score ?? 0 })
    }
  }
  run(0, 0, W, H)
  // 3×3 örtüşen karo: uzaktaki küçük kişiler tam görüntüde dedektörün çözünürlüğünün altında kalıyor
  const tw = W * 0.45, th = H * 0.45
  for (const fy of [0, 0.5, 1]) for (const fx of [0, 0.5, 1]) run(fx * (W - tw), fy * (H - th), tw, th)
  // karo kenarında kesilmiş kutular tam görüntüdekilerle birleşsin: NMS + içerme
  all.sort((a, b) => b.score - a.score)
  const keep: PersonBox[] = []
  for (const b of all) {
    // aynı kişi: yüksek örtüşme ya da biri ötekinin büyük kısmını içeriyor (karo kenarında kesilmiş kutu)
    const k = keep.find((k) => {
      if (iou(k, b) > 0.35) return true
      const ix = Math.max(0, Math.min(k.x + k.w, b.x + b.w) - Math.max(k.x, b.x)) * Math.max(0, Math.min(k.y + k.h, b.y + b.h) - Math.max(k.y, b.y))
      const small = Math.min(b.w * b.h, k.w * k.h), big = Math.max(b.w * b.h, k.w * k.h)
      return ix / small > 0.7 && small > big * 0.3
    })
    if (!k) { keep.push({ ...b }); continue }
    // birleşim: kesilmiş kutu tam boyuna (ör. sudaki bacaklar) uzasın
    const x1 = Math.max(k.x + k.w, b.x + b.w), y1 = Math.max(k.y + k.h, b.y + b.h)
    k.x = Math.min(k.x, b.x); k.y = Math.min(k.y, b.y); k.w = x1 - k.x; k.h = y1 - k.y
  }
  return keep
}

/** Bir kişi kutusu için ayrıntılı maske: kutu çevresi kırpılıp çok sınıflı bölütleyiciden geçirilir. */
export async function personMaskInBox(img: TexImageSource, b: PersonBox, outW: number, outH: number): Promise<Float32Array> {
  const { W, H } = dims(img)
  const pad = 0.15
  const x0 = Math.max(0, (b.x - b.w * pad) * W), y0 = Math.max(0, (b.y - b.h * pad) * H)
  const x1 = Math.min(W, (b.x + b.w * (1 + pad)) * W), y1 = Math.min(H, (b.y + b.h * (1 + pad)) * H)
  const c = document.createElement('canvas')
  const sc = Math.min(4, 512 / Math.max(x1 - x0, y1 - y0))
  c.width = Math.max(8, Math.round((x1 - x0) * sc))
  c.height = Math.max(8, Math.round((y1 - y0) * sc))
  c.getContext('2d')!.drawImage(img as CanvasImageSource, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height)
  const parts = await segmentPerson(c)
  const out = new Float32Array(outW * outH)
  const ox0 = Math.floor((x0 / W) * outW), ox1 = Math.ceil((x1 / W) * outW), oy0 = Math.floor((y0 / H) * outH), oy1 = Math.ceil((y1 / H) * outH)
  // kutunun dışına taşan komşu kişileri alma: kutu (+%5) dışını sıfırla
  const bx0 = (b.x - b.w * 0.05) * outW, bx1 = (b.x + b.w * 1.05) * outW, by0 = (b.y - b.h * 0.05) * outH, by1 = (b.y + b.h * 1.05) * outH
  for (let y = oy0; y < oy1; y++) {
    if (y < by0 || y > by1) continue
    const sy = Math.min(parts.h - 1, Math.max(0, Math.floor(((y - oy0) / Math.max(1, oy1 - oy0)) * parts.h)))
    for (let x = ox0; x < ox1; x++) {
      if (x < bx0 || x > bx1) continue
      const sx = Math.min(parts.w - 1, Math.max(0, Math.floor(((x - ox0) / Math.max(1, ox1 - ox0)) * parts.w)))
      out[y * outW + x] = 1 - parts.background[sy * parts.w + sx]
    }
  }
  return out
}
