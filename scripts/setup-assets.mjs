// MediaPipe WASM ve yerleşik küçük modelleri hazırlar: node scripts/setup-assets.mjs
import { cpSync, mkdirSync, existsSync, writeFileSync } from 'fs'
const pub = 'src/renderer/public'
mkdirSync(`${pub}/mediapipe`, { recursive: true })
cpSync('node_modules/@mediapipe/tasks-vision/wasm', `${pub}/mediapipe/wasm`, { recursive: true, filter: (f) => !f.includes('nosimd') })
mkdirSync(`${pub}/models`, { recursive: true })
const base = 'https://storage.googleapis.com/mediapipe-models'
const files = {
  'face_landmarker.task': `${base}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
  'pose_landmarker_lite.task': `${base}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  'selfie_multiclass_256x256.tflite': `${base}/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite`,
  'interactive_segmentation.task': `${base}/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task`
}
for (const [name, url] of Object.entries(files)) {
  const out = `${pub}/models/${name}`
  if (existsSync(out)) continue
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${name}: ${r.status}`)
  writeFileSync(out, Buffer.from(await r.arrayBuffer()))
  console.log('indirildi', name)
}
