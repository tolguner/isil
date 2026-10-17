// 3B hareketli fotoğraf: derinlik haritasıyla (Depth Anything) paralaks. Yakın bölgeler kamerayla daha çok
// kayar; gölgelendirici her pikselde derinlik boyunca ışın yürüterek (paralaks kapatma) örnekler. Sonuç kısa
// bir döngü video olarak (MP4, olmazsa WebM) kaydedilir. Belge değişmez.
import { useEffect, useRef, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Slider, ToolFoot } from '@/components/ui'
import { depthMap } from '@/ai/ops'
import { session } from '@/engine/session'
import { platform } from '@/lib/platform'
import type { ToolDef, View } from './types'

export type MotionKind = 'circle' | 'sway' | 'zoom' | 'rise'
export const motion = { kind: 'circle' as MotionKind, amount: 50, focus: 50, seconds: 4, img: null as ImageBitmap | null, depth: null as HTMLCanvasElement | null, v: 0 }
const L = new Set<() => void>()
const emit = () => { motion.v++; L.forEach((f) => f()) }
function useMotion() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    L.add(h)
    return () => void L.delete(h)
  }, [])
  return motion
}

const VS = `#version 300 es
in vec2 p; out vec2 vUv;
void main(){ vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`
const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform sampler2D uImg, uDepth;
uniform vec2 uOff;     // kamera kayması (uv)
uniform float uZoom;   // ileri itme miktarı
uniform float uFocus;  // bu derinlik sabit kalır
uniform float uScale;  // kenarlar görünmesin diye hafif büyütme
void main(){
  vec2 uv = 0.5 + (vUv - 0.5) / uScale;
  // derinlik t'deki bir nokta ekranda (t - odak) kadar kayar; yakından uzağa yürü, ilk kesişmeyi al
  vec2 dir = uOff + (uv - 0.5) * uZoom;
  const int N = 40;
  float prevT = 1.0, prevD = 0.0;
  vec2 hit = uv;
  for (int i = 0; i <= N; i++) {
    float t = 1.0 - float(i) / float(N);
    vec2 p = uv - dir * (t - uFocus);
    float d = texture(uDepth, p).r;
    if (d >= t) {
      // önceki adımla doğrusal ara değer: basamak izi kalmasın
      float a = (prevT - prevD) / max((prevT - prevD) - (t - d), 1e-4);
      float tt = mix(prevT, t, clamp(a, 0.0, 1.0));
      hit = uv - dir * (tt - uFocus);
      break;
    }
    prevT = t; prevD = d;
    hit = p;
  }
  o = vec4(texture(uImg, clamp(hit, 0.0, 1.0)).rgb, 1.0);
}`

/** Belirli bir zamandaki (0..1 döngü) kamera durumu. */
export function cameraAt(kind: MotionKind, amount: number, phase: number) {
  const a = (amount / 100) * 0.045
  const w = phase * Math.PI * 2
  if (kind === 'circle') return { off: [Math.cos(w) * a, Math.sin(w) * a * 0.6] as [number, number], zoom: 0 }
  if (kind === 'sway') return { off: [Math.sin(w) * a, 0] as [number, number], zoom: 0 }
  if (kind === 'rise') return { off: [0, Math.sin(w) * a * 0.8] as [number, number], zoom: 0 }
  return { off: [0, 0] as [number, number], zoom: (0.5 - 0.5 * Math.cos(w)) * a * 3.2 }
}

/** Paralaks çizici: kendi WebGL2 bağlamı olan bir tuval. */
export class MotionRenderer {
  gl: WebGL2RenderingContext
  prog: WebGLProgram
  constructor(public canvas: HTMLCanvasElement | OffscreenCanvas, img: TexImageSource, depth: TexImageSource) {
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, premultipliedAlpha: false }) as WebGL2RenderingContext | null
    if (!gl) throw new Error('WebGL2 yok')
    this.gl = gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(p)
    this.prog = p
    gl.useProgram(p)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(p, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const tex = (unit: number, src: TexImageSource, name: string) => {
      const t = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
      gl.uniform1i(gl.getUniformLocation(p, name), unit)
    }
    tex(0, img, 'uImg')
    tex(1, depth, 'uDepth')
  }
  draw(kind: MotionKind, amount: number, focus: number, phase: number) {
    const gl = this.gl
    const c = cameraAt(kind, amount, phase)
    const a = (amount / 100) * 0.045
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.uniform2f(gl.getUniformLocation(this.prog, 'uOff'), c.off[0], c.off[1])
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uZoom'), c.zoom)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uFocus'), focus / 100)
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uScale'), 1 + a * 1.6)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
  dispose() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/**
 * Derinliği hazırla: ön plan kenarlarını biraz genişlet (en büyük süzgeç) ve yumuşat. Böylece kayma sırasında
 * ön planın kenarı arka plana yayılır, tersi olmaz (yüz kenarında yırtılma azalır).
 */
export function prepareDepth(d: HTMLCanvasElement): HTMLCanvasElement {
  const W = d.width, H = d.height
  const src = d.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  const R = Math.max(2, Math.round(Math.min(W, H) * 0.008))
  const tmp = new Uint8ClampedArray(W * H), out = new Uint8ClampedArray(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = 0
    for (let k = -R; k <= R; k++) { const xx = Math.min(W - 1, Math.max(0, x + k)); const v = src[(y * W + xx) * 4]; if (v > m) m = v }
    tmp[y * W + x] = m
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let m = 0
    for (let k = -R; k <= R; k++) { const yy = Math.min(H - 1, Math.max(0, y + k)); const v = tmp[yy * W + x]; if (v > m) m = v }
    out[y * W + x] = m
  }
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const id = new ImageData(W, H)
  for (let i = 0; i < W * H; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = out[i]; id.data[i * 4 + 3] = 255 }
  const t = document.createElement('canvas')
  t.width = W
  t.height = H
  t.getContext('2d')!.putImageData(id, 0, 0)
  const ctx = c.getContext('2d')!
  ctx.filter = `blur(${Math.max(1, R * 0.6)}px)`
  ctx.drawImage(t, 0, 0)
  return c
}

/** Düzenlenmiş fotoğrafı (tüm ayarlar, katmanlar dahil) ve derinliğini hazırla. */
async function prepare(tr: (a: string, b: string) => string) {
  const st = useEditor.getState()
  st.setBusy({ text: tr('Derinlik hesaplanıyor…', 'Estimating depth…') })
  try {
    const { blob } = await session.exportBlob(st.doc, { exportFormat: 'png', exportQuality: 100, exportMaxSide: 1280 })
    const img = await createImageBitmap(blob)
    const d = await depthMap(img)
    if (!d) throw new Error(tr('Derinlik modeli yüklenemedi.', 'The depth model could not be loaded.'))
    motion.img?.close()
    motion.img = img
    motion.depth = prepareDepth(d)
    emit()
  } catch (e) {
    st.toast('error', String((e as Error).message ?? e))
  } finally {
    useEditor.getState().setBusy(null)
  }
}

/** Döngü videosunu kaydet. Kare kare çizilir (captureStream(0) + requestFrame), süre sabittir. */
export async function recordLoop(o: { fps?: number; maxSide?: number } = {}): Promise<{ blob: Blob; w: number; h: number; type: string } | null> {
  const img = motion.img, depth = motion.depth
  if (!img || !depth) return null
  const fps = o.fps ?? 30
  const k = Math.min(1, (o.maxSide ?? 1080) / Math.max(img.width, img.height))
  // kodlayıcılar çift boyut ister
  const w = Math.round((img.width * k) / 2) * 2, h = Math.round((img.height * k) / 2) * 2
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const r = new MotionRenderer(c, img, depth)
  const type = ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? 'video/webm'
  const stream = c.captureStream(0)
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void }
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: Math.round(w * h * fps * 0.25) })
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
  const done = new Promise<void>((res) => (rec.onstop = () => res()))
  rec.start()
  const frames = Math.round(motion.seconds * fps)
  const t0 = performance.now()
  for (let i = 0; i < frames; i++) {
    r.draw(motion.kind, motion.amount, motion.focus, i / frames)
    track.requestFrame?.()
    const st = useEditor.getState()
    if (st.busy) st.setBusy({ ...st.busy, progress: i / frames })
    // gerçek zamanlı kayıt: her kare kendi zamanında
    const wait = t0 + ((i + 1) * 1000) / fps - performance.now()
    await new Promise((res) => setTimeout(res, Math.max(0, wait)))
  }
  rec.stop()
  await done
  r.dispose()
  return { blob: new Blob(chunks, { type: type.split(';')[0] }), w, h, type }
}

function MotionPanel() {
  const tr = useT()
  const m = useMotion()
  const set = (p: Partial<typeof motion>) => { Object.assign(motion, p); emit() }
  useEffect(() => { if (!motion.depth) void prepare(tr) }, [])
  useEffect(() => () => { motion.img?.close(); motion.img = null; motion.depth = null }, [])
  const save = async () => {
    const st = useEditor.getState()
    st.setBusy({ text: tr('Video kaydediliyor…', 'Recording video…'), progress: 0 })
    try {
      const r = await recordLoop()
      if (!r) return
      const ext = r.type.startsWith('video/mp4') ? 'mp4' : 'webm'
      const path = await platform.exportSave({ bytes: new Uint8Array(await r.blob.arrayBuffer()), ext, suggestedName: (st.project?.name || 'isil') + '-3b' })
      if (path) st.toast('success', tr('Kaydedildi: ', 'Saved: ') + path.split(/[\\/]/).pop(), platform.isElectron ? { label: tr('Klasörde göster', 'Show in folder'), run: () => platform.reveal(path) } : undefined)
    } catch (e) {
      st.toast('error', String((e as Error).message ?? e))
    } finally {
      useEditor.getState().setBusy(null)
    }
  }
  const kinds: [MotionKind, string, string][] = [['circle', 'Daire', 'Circle'], ['sway', 'Yana', 'Sway'], ['zoom', 'Yaklaş', 'Push in'], ['rise', 'Yukarı', 'Rise']]
  return (
    <>
      <p className="note">{tr('Fotoğrafa derinlik verip hafif bir kamera hareketiyle canlandırır; kısa döngü video olarak kaydedilir. Derinlik bilgisayarında hesaplanır.', 'Adds depth and a gentle camera move; saved as a short looping video. Depth is computed on your computer.')}</p>
      <div className="presets" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {kinds.map(([id, a, b]) => (
          <button key={id} className={'btn sm' + (m.kind === id ? ' primary' : '')} aria-pressed={m.kind === id} onClick={() => set({ kind: id })}>{tr(a, b)}</button>
        ))}
      </div>
      <Slider plain label={tr('Hareket', 'Motion')} min={10} max={100} value={m.amount} onChange={(v) => set({ amount: v })} />
      <Slider plain label={tr('Odak (sabit kalan derinlik)', 'Focus (depth that stays put)')} min={0} max={100} value={m.focus} onChange={(v) => set({ focus: v })} />
      <div className="group-label">{tr('Süre', 'Length')}</div>
      <div className="seg" role="radiogroup">
        {[3, 4, 6].map((s) => <button key={s} role="radio" aria-checked={m.seconds === s} className={m.seconds === s ? 'on' : ''} onClick={() => set({ seconds: s })}>{tr(`${s} sn`, `${s}s`)}</button>)}
      </div>
      <ToolFoot>
        <button className="btn ghost" onClick={() => useEditor.getState().closeTool(false)}>{tr('Kapat', 'Close')}</button>
        <button className="btn primary" disabled={!m.depth} onClick={() => void save()}>{tr('Video kaydet', 'Save video')}</button>
      </ToolFoot>
    </>
  )
}

function MotionOverlay({ view }: { view: View }) {
  const m = useMotion()
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !m.img || !m.depth) return
    c.width = m.img.width
    c.height = m.img.height
    let r: MotionRenderer
    try {
      r = new MotionRenderer(c, m.img, m.depth)
    } catch {
      return
    }
    let raf = 0
    const t0 = performance.now()
    const loop = () => {
      const ph = ((performance.now() - t0) / 1000 / motion.seconds) % 1
      r.draw(motion.kind, motion.amount, motion.focus, ph)
      raf = requestAnimationFrame(loop)
    }
    loop()
    return () => { cancelAnimationFrame(raf); r.dispose() }
  }, [m.img, m.depth])
  if (!m.img || !m.depth) return null
  const tl = view.toScreen(0, 0)
  return <canvas ref={ref} data-motion-preview style={{ position: 'absolute', left: tl.x, top: tl.y, width: view.size.w, height: view.size.h, pointerEvents: 'none' }} />
}

export const MOTION_TOOL: ToolDef = {
  id: 'motion', label: ['3B hareket', '3D motion'], icon: Clapperboard, Panel: MotionPanel, Overlay: MotionOverlay, noFooter: true, badge: 'YZ',
  sliders: [{ label: ['Hareket', 'Motion'] }, { label: ['Odak', 'Focus'] }]
}
