// İsteğe bağlı Gemini katmanı: anahtar ve bulut onayı kontrolleri, görsel gönderme/alma.
import { platform } from '@/lib/platform'
import { useEditor } from '@/store/editor'
import { tNow } from '@/lib/i18n'
import { encodeCanvas } from '@/engine/session'
import { toCanvas } from './ops'

type Src = CanvasImageSource & { width: number; height: number }

export async function geminiAvailable(): Promise<boolean> {
  return platform.isElectron && (await platform.hasSecret())
}

/** Anahtar + onay. Yoksa kullanıcıyı yönlendirir ve false döner. */
export async function ensureCloud(): Promise<boolean> {
  const st = useEditor.getState()
  if (!platform.isElectron || !(await platform.hasSecret())) {
    st.toast('info', tNow('Bu araç için Ayarlar’dan kendi Gemini API anahtarını ekle.', 'Add your own Gemini API key in Settings to use this tool.'), {
      label: tNow('Ayarlar', 'Settings'),
      run: () => useEditor.getState().go('settings')
    })
    return false
  }
  if (!st.settings.cloudConsent) {
    const { confirmDialog } = await import('@/components/ui')
    const ok = await confirmDialog({
      title: tNow('Fotoğraf Google’a gönderilsin mi?', 'Send the photo to Google?'),
      text: tNow(
        'Bu işlem için fotoğrafın Gemini API’sine (Google) gönderilir ve kendi anahtarınla işlenir. Yalnızca paylaşma iznin olan fotoğraflarla kullan. Bu onay bir kez sorulur.',
        'For this, your photo is sent to the Gemini API (Google) and processed with your own key. Only use photos you have permission to share. You are asked once.'
      ),
      confirm: tNow('Onayla', 'Allow')
    })
    if (!ok) return false
    const s = await platform.setSettings({ cloudConsent: true })
    useEditor.getState().setSettings(s)
  }
  return true
}

async function toBytes(src: Src, maxSide = 2048) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height))
  const c = toCanvas(src, src.width * s, src.height * s)
  const b = await encodeCanvas(c, 'image/jpeg', 0.92)
  return { bytes: new Uint8Array(await b.arrayBuffer()), mime: 'image/jpeg' }
}

/** Görseli prompt ile düzenle; sonuç kaynak boyutuna ölçeklenir. */
export async function geminiEdit(src: Src, prompt: string, refs: Src[] = []): Promise<HTMLCanvasElement> {
  const img = await toBytes(src)
  const refBytes = await Promise.all(refs.map((r) => toBytes(r, 1024)))
  let res
  try {
    res = await platform.geminiEdit({ image: img.bytes, mime: img.mime, prompt, refs: refBytes })
  } catch (e) {
    const m = String((e as Error).message)
    if (m.includes('NO_KEY')) throw new Error(tNow('Gemini anahtarı yok.', 'No Gemini key.'))
    if (/quota|429|RESOURCE_EXHAUSTED/i.test(m)) throw new Error(tNow('Gemini kotası doldu ya da bu model ücretsiz katmanda yok. Anahtarının faturalandırma durumunu kontrol et.', 'Gemini quota exceeded or this model is not on the free tier. Check your key’s billing.'))
    throw e
  }
  const bm = await createImageBitmap(new Blob([res.bytes as BlobPart], { type: res.mime }))
  const out = toCanvas(bm, src.width, src.height)
  bm.close()
  return out
}

/** Maskeli düzenleme: maskenin dışı birebir korunur. */
export async function geminiMaskedEdit(src: Src, mask: HTMLCanvasElement, what: string): Promise<HTMLCanvasElement> {
  const marked = toCanvas(src)
  const mctx = marked.getContext('2d')!
  const tint = document.createElement('canvas')
  tint.width = src.width
  tint.height = src.height
  const tctx = tint.getContext('2d')!
  tctx.drawImage(mask, 0, 0, src.width, src.height)
  tctx.globalCompositeOperation = 'source-in'
  tctx.fillStyle = 'rgba(255,0,255,0.55)'
  tctx.fillRect(0, 0, src.width, src.height)
  // gri maskenin siyahı alfa değil; alfa maskesi üret
  const alpha = grayToAlpha(mask, src.width, src.height)
  const t2 = document.createElement('canvas')
  t2.width = src.width
  t2.height = src.height
  const t2c = t2.getContext('2d')!
  t2c.drawImage(alpha, 0, 0)
  t2c.globalCompositeOperation = 'source-in'
  t2c.fillStyle = 'rgba(255,0,255,0.55)'
  t2c.fillRect(0, 0, src.width, src.height)
  mctx.drawImage(t2, 0, 0)
  void tint
  const prompt = `The magenta-tinted area in the image marks a region to edit. Replace ONLY that region with: ${what}. Blend lighting, perspective and grain naturally. Remove the magenta tint completely. Keep every other pixel of the photo exactly the same.`
  const edited = await geminiEdit(marked, prompt)
  // kenarı yumuşatılmış maske ile birleştir
  const out = toCanvas(src)
  const octx = out.getContext('2d')!
  const soft = document.createElement('canvas')
  soft.width = src.width
  soft.height = src.height
  const sctx = soft.getContext('2d')!
  sctx.filter = `blur(${Math.max(2, Math.max(src.width, src.height) * 0.004)}px)`
  sctx.drawImage(alpha, 0, 0)
  const patch = toCanvas(edited)
  const pctx = patch.getContext('2d')!
  pctx.globalCompositeOperation = 'destination-in'
  pctx.drawImage(soft, 0, 0)
  octx.drawImage(patch, 0, 0)
  return out
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

export async function geminiChat(text: string, image?: Src | null, previousId?: string, system?: string) {
  const img = image ? await toBytes(image, 1024) : undefined
  return platform.geminiChat({ text, image: img, previousId, system })
}
