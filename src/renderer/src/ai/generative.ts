// Yerel üretken YZ: FLUX.2 klein (görsel düzenleme) ve Qwen3-VL (stil danışmanı).
// Hepsi bilgisayarda çalışır; fotoğraflar dışarı gönderilmez. Motor main süreçte yönetilir.
import { platform, type EngineStatus } from '@/lib/platform'
import { useEditor } from '@/store/editor'
import { tNow } from '@/lib/i18n'
import { encodeCanvas } from '@/engine/session'
import { toCanvas } from './ops'
import { claimGpu } from './models'

type Src = CanvasImageSource & { width: number; height: number }

export const PARTS: Record<string, { name: [string, string]; size: string }> = {
  runtime: { name: ['YZ motoru (Python + PyTorch CUDA)', 'AI engine (Python + PyTorch CUDA)'], size: '≈3 GB' },
  'flux-fast': { name: ['FLUX.2 klein 4B (hızlı)', 'FLUX.2 klein 4B (fast)'], size: '≈6 GB' },
  'flux-best': { name: ['FLUX.2 klein 9B (en iyi, yavaş)', 'FLUX.2 klein 9B (best, slow)'], size: '≈12 GB' },
  vlm: { name: ['Qwen3-VL 4B (stil danışmanı)', 'Qwen3-VL 4B (style advisor)'], size: '≈3,5 GB' }
}

export async function engineStatus(): Promise<EngineStatus> {
  try {
    return await platform.engineStatus()
  } catch {
    return { available: false, installed: {}, running: false }
  }
}

/** Gerekli parçalar kurulu değilse kullanıcıya sorup kurar. */
export async function ensureEngine(parts: string[]): Promise<boolean> {
  const st = useEditor.getState()
  const s = await engineStatus()
  if (!s.available) {
    st.toast('info', s.blocked ?? tNow('Yerel YZ motoru yalnızca masaüstü uygulamasında çalışır.', 'The local AI engine only runs in the desktop app.'))
    return false
  }
  const missing = parts.filter((p) => !s.installed[p])
  if (!missing.length) return true
  const { confirmDialog } = await import('@/components/ui')
  const lang = st.settings.language
  const list = missing.map((p) => `${PARTS[p].name[lang === 'en' ? 1 : 0]} (${PARTS[p].size})`).join(', ')
  const ok = await confirmDialog({
    title: tNow('Yerel YZ kurulsun mu?', 'Install local AI?'),
    text: tNow(
      `Bu araç için şunlar indirilecek: ${list}. Bir kez kurulur, sonra internetsiz ve ücretsiz çalışır.`,
      `This tool needs: ${list}. It installs once, then runs offline and free.`
    ),
    confirm: tNow('Kur', 'Install')
  })
  if (!ok) return false
  for (const p of missing) {
    try {
      await withProgress(tNow(`${PARTS[p].name[0]} kuruluyor…`, `Installing ${PARTS[p].name[1]}…`), () => platform.engineInstall(p))
    } catch (e) {
      st.toast('error', tNow('Kurulum başarısız: ', 'Install failed: ') + (e as Error).message)
      return false
    }
  }
  return true
}

async function withProgress<T>(title: string, fn: () => Promise<T>): Promise<T> {
  const st = useEditor.getState()
  const off = platform.onEngineProgress((p) => {
    let progress: number | undefined
    let text = title
    if (p.stage === 'download' && p.total) progress = (p.got ?? 0) / p.total
    if (p.stage === 'generate' && p.steps) {
      progress = (p.step ?? 0) / p.steps
      text = tNow(`Oluşturuluyor… ${p.step}/${p.steps}`, `Generating… ${p.step}/${p.steps}`)
    }
    if (p.stage === 'load') text = tNow('Model belleğe yükleniyor…', 'Loading the model…')
    if (p.text) text = p.text
    useEditor.getState().setBusy({ text, progress, cancel: () => void platform.genCancel() })
  })
  st.setBusy({ text: title, cancel: () => void platform.genCancel() })
  try {
    return await fn()
  } finally {
    off()
    useEditor.getState().setBusy(null)
  }
}

/** FLUX için uygun boyut: uzun kenar ≤ 1024, kenarlar 16'nın katı. */
function fluxSize(w: number, h: number, max = 1024) {
  const s = Math.min(1, max / Math.max(w, h))
  return { w: Math.max(256, Math.round((w * s) / 16) * 16), h: Math.max(256, Math.round((h * s) / 16) * 16) }
}

async function png(c: HTMLCanvasElement) {
  return new Uint8Array(await (await encodeCanvas(c, 'image/png')).arrayBuffer())
}

/** Görsel neredeyse renksiz mi (siyah-beyaz / hafif ton)? 64×64 örnekte renk sapması. */
export function isGrayscale(src: Src): boolean {
  const c = toCanvas(src, 64, 64)
  const d = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, 64, 64).data
  let dev = 0
  for (let i = 0; i < d.length; i += 4) dev += (Math.abs(d[i] - d[i + 1]) + Math.abs(d[i + 1] - d[i + 2]) + Math.abs(d[i + 2] - d[i])) / 3
  return dev / (d.length / 4) < 5
}

function toGray(c: HTMLCanvasElement) {
  const x = c.getContext('2d', { willReadFrequently: true })!
  const id = x.getImageData(0, 0, c.width, c.height)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])
  x.putImageData(id, 0, 0)
}

/** Siyah-beyaz girdi, komut açıkça renk istemedikçe siyah-beyaz kalır (FLUX renk ekliyordu). */
const wantsColor = (p: string) => /colou?ri[sz]|renklendir|renkli|in color/i.test(p)

/** Görseli yazılı komutla düzenle; sonuç kaynak boyutuna ölçeklenir. */
export async function localEdit(src: Src, prompt: string, refs: Src[] = []): Promise<HTMLCanvasElement | null> {
  const quality = useEditor.getState().settings.genQuality
  const part = quality === 'best' ? 'flux-best' : 'flux-fast'
  if (!(await ensureEngine(['runtime', part]))) return null
  const { w, h } = fluxSize(src.width, src.height)
  const image = await png(toCanvas(src, w, h))
  const refBytes = await Promise.all(refs.map((r) => {
    const s = fluxSize(r.width, r.height, 768)
    return png(toCanvas(r, s.w, s.h))
  }))
  const out = await withProgress(tNow('Yapay zekâ düzenliyor…', 'AI is editing…'), async () => {
      await claimGpu('engine', true)
      return platform.genEdit({ image, prompt, refs: refBytes, width: w, height: h, quality })
    }
  )
  const bm = await createImageBitmap(new Blob([out as BlobPart], { type: 'image/png' }))
  const res = toCanvas(bm, src.width, src.height)
  bm.close()
  if (isGrayscale(src) && !wantsColor(prompt)) toGray(res)
  return res
}

/**
 * Kişileri koruyarak düzenle: konu (kişi/nesne) BiRefNet ya da ISNet ile ayrılır, FLUX yalnız arka planı yeniden çizer.
 * Yüz ve kıyafet piksel piksel korunur (ajan: "stüdyo" komutu yüzü değiştiriyordu).
 */
export async function localEditKeepPeople(src: Src, prompt: string): Promise<HTMLCanvasElement | null> {
  const { removeBackground } = await import('./ops')
  const { nativeReady } = await import('./models')
  const subj = await removeBackground(src, await nativeReady()) // yumuşak konu maskesi (saç teli yarı saydam)
  if (!subj) return localEdit(src, prompt)
  const W = src.width, H = src.height
  // FLUX'un yeniden çizeceği alan: konunun tam opak çekirdeği dışındaki her yer — saçın yarı saydam kenarının
  // arkası da yeni arka planla dolsun; aksi halde kenarda eski fon hale gibi kalıyor
  const m = toCanvas(subj, W, H)
  const mx = m.getContext('2d', { willReadFrequently: true })!
  const id = mx.getImageData(0, 0, W, H)
  const d = id.data
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = d[i] > 230 ? 0 : 255
  mx.putImageData(id, 0, 0)
  const bg = await localMaskedEdit(src, m, `${prompt}. Keep the people and the main subject exactly as they are.`, { raw: true })
  if (!bg) return null
  // kişiyi yumuşak alfa ile yeni arka planın üstüne koy: yüz ve kıyafet piksel piksel aynı, saç kenarı doğal
  const fg = toCanvas(src)
  const fx = fg.getContext('2d')!
  fx.globalCompositeOperation = 'destination-in'
  fx.drawImage(grayToAlpha(subj, W, H), 0, 0)
  const out = toCanvas(bg, W, H)
  out.getContext('2d')!.drawImage(fg, 0, 0)
  if (isGrayscale(src) && !wantsColor(prompt)) toGray(out)
  return out
}

/** Maskeli düzenleme (FLUX.2 klein inpaint): yalnız maskeli alan yeniden çizilir, dışı birebir korunur. */
export async function localMaskedEdit(src: Src, mask: HTMLCanvasElement, what: string, opts: { prefill?: Src; raw?: boolean } = {}): Promise<HTMLCanvasElement | null> {
  const quality = useEditor.getState().settings.genQuality
  const part = quality === 'best' ? 'flux-best' : 'flux-fast'
  if (!(await ensureEngine(['runtime', part]))) return null
  const { w, h } = fluxSize(src.width, src.height)
  // prefill: silmede nesne önce LaMa ile kabaca doldurulur; yoksa FLUX koşul görüntüsünde nesneyi görüp geri çiziyor
  const image = await png(toCanvas(opts.prefill ?? src, w, h))
  // maskeyi biraz genişlet: kenar pikselleri de yeniden çizilsin, dikiş kalmasın
  const grow = document.createElement('canvas')
  grow.width = w
  grow.height = h
  const gc = grow.getContext('2d')!
  gc.fillStyle = '#000'
  gc.fillRect(0, 0, w, h)
  gc.filter = `blur(${Math.max(2, Math.round(Math.max(w, h) * 0.006))}px)`
  gc.drawImage(mask, 0, 0, w, h)
  gc.filter = 'none'
  const id = gc.getImageData(0, 0, w, h)
  for (let i = 0; i < id.data.length; i += 4) id.data[i] = id.data[i + 1] = id.data[i + 2] = id.data[i] > 8 ? 255 : 0
  gc.putImageData(id, 0, 0)
  const maskPng = await png(grow)
  const out = await withProgress(tNow('Yapay zekâ dolduruyor…', 'AI is filling…'), async () => {
      await claimGpu('engine', true)
      return platform.genEdit({ image, prompt: what, mask: maskPng, width: w, height: h, quality })
    }
  )
  const bm = await createImageBitmap(new Blob([out as BlobPart], { type: 'image/png' }))
  const edited = toCanvas(bm, src.width, src.height)
  bm.close()
  if (opts.raw) return edited
  // sonucu yumuşak kenarlı maskeyle asıl görselin üstüne koy
  const alpha = grayToAlpha(mask, src.width, src.height)
  const res = toCanvas(src)
  const soft = document.createElement('canvas')
  soft.width = src.width
  soft.height = src.height
  const sc = soft.getContext('2d')!
  sc.filter = `blur(${Math.max(2, Math.max(src.width, src.height) * 0.004)}px)`
  sc.drawImage(alpha, 0, 0)
  const pc = edited.getContext('2d')!
  pc.globalCompositeOperation = 'destination-in'
  pc.drawImage(soft, 0, 0)
  res.getContext('2d')!.drawImage(edited, 0, 0)
  if (isGrayscale(src) && !wantsColor(what)) toGray(res)
  return res
}

export function grayToAlpha(gray: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const g = toCanvas(gray, w, h)
  const ctx = g.getContext('2d', { willReadFrequently: true })!
  const id = ctx.getImageData(0, 0, w, h)
  for (let i = 0; i < id.data.length; i += 4) {
    id.data[i + 3] = id.data[i]
    id.data[i] = id.data[i + 1] = id.data[i + 2] = 255
  }
  ctx.putImageData(id, 0, 0)
  return g
}

export interface ChatMsg { role: 'user' | 'assistant'; text: string; image?: Src | null }

/** Stil danışmanı sohbeti (yerel görsel dil modeli). */
export async function localChat(messages: ChatMsg[], system: string): Promise<string | null> {
  if (!(await ensureEngine(['runtime', 'vlm']))) return null
  const msgs = await Promise.all(messages.map(async (m) => ({
    role: m.role,
    text: m.text,
    image: m.image ? await png(toCanvas(m.image, ...Object.values(fluxSize(m.image.width, m.image.height, 768)) as [number, number])) : undefined
  })))
  await claimGpu('engine', true)
  return platform.chat({ messages: msgs, system })
}
