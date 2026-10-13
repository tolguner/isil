// MediaPipe görev sarmalayıcıları (yerel, çevrimdışı). Modeller uygulamayla gelir: public/models.
import {
  FaceLandmarker, FilesetResolver, ImageSegmenter, InteractiveSegmenter, PoseLandmarker,
  type NormalizedLandmark, type BrushMode
} from '@mediapipe/tasks-vision'

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

/** Görüntüdeki tüm yüzler: 478 nokta, normalize (0..1, v=0 üst). Soldan sağa sıralı. */
export async function detectFaces(img: TexImageSource): Promise<Pt[][]> {
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
  const r = (await face).detect(img as HTMLCanvasElement)
  const faces = r.faceLandmarks.map((l: NormalizedLandmark[]) => l.map((p) => ({ x: p.x, y: p.y, z: p.z })))
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
/** Dokun-seç: normalize noktalar (+ ve -) → maske (0..1). */
export async function tapSelect(img: TexImageSource, pos: { x: number; y: number }[], neg: { x: number; y: number }[] = []) {
  inter ??= getFileset().then((fs) =>
    withDelegate((delegate) =>
      InteractiveSegmenter.createFromOptions(fs, {
        baseOptions: { modelAssetPath: asset('models/interactive_segmentation.task'), delegate }
      })
    )
  )
  const seg = await inter
  if (interImage !== img) {
    seg.setImage(img)
    interImage = img
  }
  const strokes = [
    ...pos.map((p) => ({ brushMode: POSITIVE, point: [p], isCompleted: true })),
    ...neg.map((p) => ({ brushMode: NEGATIVE, point: [p], isCompleted: true }))
  ]
  const mask = seg.segment(strokes)
  const out = { w: mask.width, h: mask.height, data: mask.getAsFloat32Array().slice() }
  mask.close()
  return out
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
