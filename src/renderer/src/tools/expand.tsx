// YZ ile tuval genişletme (outpainting): fotoğrafı seçilen orana ya da her yöne büyüt, yeni alanı yerelde doldur.
// Yerel YZ motoru kuruluysa FLUX.2 klein maskeli doldurma, değilse LaMa (karo karo). Fotoğraf dışarı çıkmaz.
import { useEffect, useState } from 'react'
import { Expand } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Segmented } from '@/components/ui'
import { session } from '@/engine/session'
import { inpaint, toCanvas } from '@/ai/ops'
import { engineStatus, localMaskedEdit } from '@/ai/generative'
import { commitRaster } from '@/lib/projects'
import type { ToolDef, View } from './types'
import { busy } from './raster'

export type Target = { kind: 'ratio'; r: number } | { kind: 'pad'; p: number }
const TARGETS: { id: string; label: string; t: Target }[] = [
  { id: 'p15', label: '+%15', t: { kind: 'pad', p: 0.15 } },
  { id: 'p30', label: '+%30', t: { kind: 'pad', p: 0.3 } },
  { id: '1:1', label: '1:1', t: { kind: 'ratio', r: 1 } },
  { id: '4:5', label: '4:5', t: { kind: 'ratio', r: 4 / 5 } },
  { id: '9:16', label: '9:16', t: { kind: 'ratio', r: 9 / 16 } },
  { id: '16:9', label: '16:9', t: { kind: 'ratio', r: 16 / 9 } },
  { id: '3:2', label: '3:2', t: { kind: 'ratio', r: 3 / 2 } }
]
const st = { target: 'p15', method: 'auto' as 'auto' | 'lama' | 'flux' }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())
function useSt() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    listeners.add(h)
    return () => void listeners.delete(h)
  }, [])
  return st
}

/**
 * Yeni tuval boyutu ve görüntünün içindeki yeri (piksel). Oranda yalnız eksik yön büyür;
 * hedef oran zaten sağlanıyorsa (ya da daraltma gerekiyorsa) null.
 */
export function expandRect(W: number, H: number, t: Target): { W: number; H: number; x: number; y: number } | null {
  let nw = W, nh = H
  if (t.kind === 'pad') { nw = Math.round(W * (1 + 2 * t.p)); nh = Math.round(H * (1 + 2 * t.p)) }
  else if (W / H < t.r - 0.005) nw = Math.round(H * t.r)
  else if (W / H > t.r + 0.005) nh = Math.round(W / t.r)
  else return null
  return { W: nw, H: nh, x: Math.round((nw - W) / 2), y: Math.round((nh - H) / 2) }
}

/** Yeni alanı kenar piksellerini uzatıp bulanıklaştırarak doldur: FLUX/LaMa'ya renk ve ışık ipucu. */
function prefill(src: HTMLCanvasElement, R: { W: number; H: number; x: number; y: number }) {
  const c = document.createElement('canvas')
  c.width = R.W
  c.height = R.H
  const ctx = c.getContext('2d')!
  // bulanıklık tuval kenarında saydamlık bırakmasın: önce ortalama renk, sonra taşkın (overscan) bulanık kopya
  const one = document.createElement('canvas')
  one.width = one.height = 1
  const oc = one.getContext('2d', { willReadFrequently: true })!
  oc.drawImage(src, 0, 0, 1, 1)
  const [r, g, b] = oc.getImageData(0, 0, 1, 1).data
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fillRect(0, 0, R.W, R.H)
  const blur = Math.round(Math.max(R.W, R.H) * 0.03)
  ctx.filter = `blur(${blur}px)`
  ctx.drawImage(src, -blur * 2, -blur * 2, R.W + blur * 4, R.H + blur * 4)
  ctx.filter = 'none'
  ctx.drawImage(src, R.x, R.y)
  return c
}

/** Doldurulacak alan: yeni şerit + görüntünün içine az bir bindirme (dikiş kalmasın). */
function maskFor(srcW: number, srcH: number, R: { W: number; H: number; x: number; y: number }) {
  const m = document.createElement('canvas')
  m.width = R.W
  m.height = R.H
  const ctx = m.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, R.W, R.H)
  const ov = Math.round(Math.max(srcW, srcH) * 0.012)
  const left = R.x > 0 ? ov : 0, top = R.y > 0 ? ov : 0
  ctx.fillStyle = '#000'
  ctx.fillRect(R.x + left, R.y + top, srcW - (R.x > 0 ? 2 * ov : 0), srcH - (R.y > 0 ? 2 * ov : 0))
  return m
}

/**
 * Dikişsiz birleştirme: üretilen görüntünün rengi, asıl görüntünün kenar şeridindeki ortalamaya eşitlenir
 * (kanal başına kazanç), sonra asıl görüntü kenarda yumuşak geçişle üstüne konur. FLUX gökyüzünü biraz farklı
 * tonda çizdiğinde sınırda düz bir çizgi görünüyordu.
 */
function blendSeam(gen: HTMLCanvasElement, src: HTMLCanvasElement, R: { W: number; H: number; x: number; y: number }) {
  const W = R.W, H = R.H
  const g = toCanvas(gen, W, H)
  const gctx = g.getContext('2d', { willReadFrequently: true })!
  const gd = gctx.getImageData(0, 0, W, H)
  const s = document.createElement('canvas')
  s.width = W
  s.height = H
  const sctx = s.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(src, R.x, R.y)
  const sd = sctx.getImageData(0, 0, W, H)
  const band = Math.max(8, Math.round(Math.max(src.width, src.height) * 0.03))
  // asıl görüntünün içinde, genişleyen kenarlara yakın şerit
  const inBand = (x: number, y: number) => {
    const lx = x - R.x, ly = y - R.y
    if (lx < 0 || ly < 0 || lx >= src.width || ly >= src.height) return false
    const dl = R.x > 0 ? lx : Infinity, dr = R.x > 0 ? src.width - 1 - lx : Infinity
    const dt = R.y > 0 ? ly : Infinity, db = R.y > 0 ? src.height - 1 - ly : Infinity
    return Math.min(dl, dr, dt, db) < band
  }
  const sum = [0, 0, 0, 0, 0, 0]
  let n = 0
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (!inBand(x, y)) continue
    const i = (y * W + x) * 4
    for (let k = 0; k < 3; k++) { sum[k] += sd.data[i + k]; sum[k + 3] += gd.data[i + k] }
    n++
  }
  const gain = [0, 1, 2].map((k) => (n && sum[k + 3] > 0 ? Math.min(1.4, Math.max(0.7, sum[k] / sum[k + 3])) : 1))
  for (let i = 0; i < gd.data.length; i += 4) for (let k = 0; k < 3; k++) gd.data[i + k] = Math.min(255, gd.data[i + k] * gain[k])
  // asıl görüntüyü kenar şeridinde yumuşakça karıştır (içerisi birebir aynı)
  for (let y = R.y; y < R.y + src.height; y++) for (let x = R.x; x < R.x + src.width; x++) {
    const lx = x - R.x, ly = y - R.y
    const d = Math.min(R.x > 0 ? lx : band, R.x > 0 ? src.width - 1 - lx : band, R.y > 0 ? ly : band, R.y > 0 ? src.height - 1 - ly : band)
    const a = Math.min(1, d / band)
    const t = a * a * (3 - 2 * a)
    const i = (y * W + x) * 4
    for (let k = 0; k < 3; k++) gd.data[i + k] = gd.data[i + k] * (1 - t) + sd.data[i + k] * t
    gd.data[i + 3] = 255
  }
  gctx.putImageData(gd, 0, 0)
  return g
}

async function runExpand(tr: (a: string, b: string) => string) {
  const t = TARGETS.find((x) => x.id === st.target)!.t
  await busy(tr('Tuval genişletiliyor…', 'Expanding canvas…'), async () => {
    const full = await session.fullBase()
    const src = toCanvas(full)
    full.close()
    const R = expandRect(src.width, src.height, t)
    if (!R) {
      useEditor.getState().toast('info', tr('Fotoğraf zaten bu oranda.', 'The photo already has this ratio.'))
      return
    }
    const base = prefill(src, R)
    const mask = maskFor(src.width, src.height, R)
    const es = await engineStatus()
    const fluxReady = !!es.installed?.runtime && (!!es.installed?.['flux-fast'] || !!es.installed?.['flux-best'])
    const useFlux = st.method === 'flux' || (st.method === 'auto' && fluxReady)
    let gen: HTMLCanvasElement | null = null
    if (useFlux) {
      gen = await localMaskedEdit(base, mask, 'Extend the photo naturally beyond its original borders. Continue the background, ground, sky and lighting seamlessly. Do not add new people, faces or text.', { raw: true })
      if (!gen) return
    } else {
      // LaMa'ya tek seferde, tüm görüntüyle: karo karo verilince tamamen boş karolarda bağlam olmadığı için
      // gri yamalar ve karo dikişleri çıkıyordu. Yeni alan yumuşak ama sahneyle tutarlı oluyor.
      gen = await inpaint(base, mask)
      if (!gen) throw new Error(tr('Onarım modeli (LaMa) yüklenemedi', 'Inpainting model (LaMa) could not be loaded'))
    }
    const out = blendSeam(gen, src, R)
    await commitRaster(out, 'gen', { tool: 'expand', target: st.target, method: useFlux ? 'flux' : 'lama', from: [src.width, src.height], to: [R.W, R.H], at: [R.x, R.y] }, (d) => {
      // tuval değişti: kırpma, oran ve vücut/yüz bükmesi yeni görüntüye göre sıfırlanır
      d.crop = { x: 0, y: 0, w: 1, h: 1, rotation: 0, quarter: 0, flipH: false, flipV: false, perspH: 0, perspV: 0, ratio: null }
      d.local = (d.local ?? []).map((q) => ({ ...q, x: (q.x * src.width + R.x) / R.W, y: (q.y * src.height + R.y) / R.H }))
    })
    useEditor.getState().closeTool(true)
  })
}

function ExpandPanel() {
  const tr = useT()
  const s = useSt()
  const [flux, setFlux] = useState<boolean | null>(null)
  useEffect(() => {
    void engineStatus().then((e) => setFlux(!!e.installed?.runtime && (!!e.installed?.['flux-fast'] || !!e.installed?.['flux-best'])))
  }, [])
  return (
    <>
      <p className="note">{tr('Fotoğrafı seçtiğin orana ya da her yöne büyütür; yeni alanı yapay zekâ bilgisayarında doldurur. Asıl pikseller değişmez.', 'Grows the photo to the chosen ratio or on every side; AI fills the new area on your computer. Original pixels stay unchanged.')}</p>
      <div className="group-label">{tr('Yeni boyut', 'New size')}</div>
      <div className="presets">
        {TARGETS.map((x) => (
          <button key={x.id} className={'btn sm' + (s.target === x.id ? ' primary' : '')} aria-pressed={s.target === x.id} onClick={() => { st.target = x.id; emit() }}>{x.label}</button>
        ))}
      </div>
      <div className="group-label">{tr('Doldurma', 'Fill')}</div>
      <Segmented
        items={[{ id: 'auto', label: tr('Otomatik', 'Auto') }, { id: 'lama', label: tr('Hızlı (LaMa)', 'Fast (LaMa)') }, { id: 'flux', label: tr('En iyi (FLUX)', 'Best (FLUX)') }]}
        value={s.method}
        onChange={(v) => { st.method = v; emit() }}
      />
      <p className="note">{flux === null ? '' : flux
        ? tr('Yerel YZ motoru kurulu: otomatik seçimde FLUX kullanılır.', 'Local AI engine installed: Auto uses FLUX.')
        : tr('Yerel YZ motoru kurulu değil: otomatik seçimde LaMa kullanılır. Geniş alanlarda FLUX daha gerçekçi doldurur (ilk kullanımda kurulum ister).', 'Local AI engine not installed: Auto uses LaMa. FLUX fills large areas more realistically (installs on first use).')}</p>
      <button className="btn primary block" onClick={() => void runExpand(tr)}><Expand size={16} /> {tr('Genişlet', 'Expand')}</button>
    </>
  )
}

/** Yeni tuvalin sınırını görüntünün çevresinde kesikli çerçeveyle göster. */
function ExpandOverlay({ view }: { view: View }) {
  const s = useSt()
  const t = TARGETS.find((x) => x.id === s.target)!.t
  const R = expandRect(session.W || 1, session.H || 1, t)
  if (!R) return null
  const a = view.toScreen(-R.x / session.W, -R.y / session.H)
  const b = view.toScreen((R.W - R.x) / session.W, (R.H - R.y) / session.H)
  return <div className="expand-frame" style={{ left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y }} aria-hidden />
}

export const EXPAND_TOOL: ToolDef = {
  id: 'expand', label: ['YZ genişlet', 'AI expand'], icon: Expand, Panel: ExpandPanel, Overlay: ExpandOverlay, sourceSpace: true, noFooter: true, badge: 'YZ'
}
