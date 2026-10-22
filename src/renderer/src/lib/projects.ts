import { emptyDoc, type Project } from '@shared/schema'
import { platform, type PickedFile } from './platform'
import { useEditor } from '@/store/editor'
import { session, encodeCanvas, imageDataToCanvas } from '@/engine/session'
import { tNow } from './i18n'
import { takeGenerated } from './aiflag'
import { normalizePicked } from './heic'

export async function imageSize(bytes: Uint8Array) {
  const bm = await createImageBitmap(new Blob([bytes as BlobPart]), { imageOrientation: 'from-image' })
  const s = { w: bm.width, h: bm.height }
  bm.close()
  return s
}

export async function createProjectFrom(file: PickedFile): Promise<Project> {
  const { w, h } = await imageSize(file.bytes)
  return platform.createProject({ name: file.name, bytes: file.bytes, width: w, height: h, doc: emptyDoc() })
}

export async function openFiles(multi = false) {
  return platform.openFiles(multi)
}

/** Dosyadan yeni proje oluştur ve editörde aç. */
export async function startEditing(file: PickedFile) {
  const st = useEditor.getState()
  try {
    st.setBusy({ text: tNow('Fotoğraf açılıyor…', 'Opening photo…') })
    file = await normalizePicked(file) // iPhone HEIC → JPEG
    const p = await createProjectFrom(file)
    session.reset()
    st.openProject(p)
    if (/\.gif$/i.test(file.name)) st.toast('info', tNow('Hareketli GIF’lerde yalnız ilk kare düzenlenir.', 'Only the first frame of an animated GIF is edited.'))
  } catch (e) {
    console.error(e)
    st.toast('error', tNow('Bu dosya açılamadı. Desteklenen biçimler: JPG, PNG, WebP, HEIC, AVIF, BMP, GIF.', 'Could not open this file. Supported: JPG, PNG, WebP, HEIC, AVIF, BMP, GIF.'))
  } finally {
    useEditor.getState().setBusy(null)
  }
}

export async function openExisting(id: string) {
  const st = useEditor.getState()
  try {
    const p = await platform.loadProject(id)
    session.reset()
    st.openProject(p)
  } catch (e) {
    console.error(e)
    st.toast('error', tNow('Proje açılamadı.', 'Could not open the project.'))
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let saving: Promise<unknown> = Promise.resolve()

/** Otomatik kayıt (1 sn gecikmeli). */
export function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => void saveNow(), 1000)
}

export async function saveNow() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const st = useEditor.getState()
  const p = st.project
  if (!p) return
  // araç açıkken de canlı belge kaydedilir: pencere kapanır ya da uygulama çökerse kaydırıcı ayarları kaybolmaz
  // (araç iptal edilirse belge eski haline döner ve o da kaydedilir)
  const doc = st.doc
  const history = { past: st.past.slice(-30), future: st.future.slice(0, 30) }
  saving = saving.then(async () => {
    try {
      const thumb = await session.thumbnail(doc).catch(() => null)
      await platform.saveProject({ id: p.id, doc, thumb: thumb ?? undefined, history })
      if (useEditor.getState().project?.id === p.id) useEditor.setState({ savedDoc: doc })
    } catch (e) {
      console.error('kayıt hatası', e)
    }
  })
  return saving
}

let opCounter = 0
/** Piksel işlemini yeni taban olarak kaydet (geri alınabilir: eski dosyalar silinmez). */
export async function commitRaster(img: ImageData | HTMLCanvasElement | Blob, type: import('@shared/schema').RasterOpType, params: Record<string, unknown> = {}, mutate?: (d: import('@shared/schema').EditDoc) => void) {
  const st = useEditor.getState()
  const p = st.project
  if (!p) return
  let blob: Blob
  if (img instanceof Blob) blob = img
  else blob = await encodeCanvas(img instanceof ImageData ? imageDataToCanvas(img) : img, 'image/png')
  const name = `${Date.now().toString(36)}-${(opCounter++).toString(36)}-${type}.png`
  const rel = await platform.putAsset({ id: p.id, name, bytes: new Uint8Array(await blob.arrayBuffer()) })
  const ai = takeGenerated()
  st.commit((d) => {
    d.base = rel
    d.rasterOps.push({ id: name, type, file: rel, params: { ...params, ai }, at: new Date().toISOString() })
    mutate?.(d) // aynı geri alma adımında belgeyi de güncelle (ör. fotoğrafa işlenen vücut ayarlarını sıfırla)
  })
  useEditor.getState().bumpRevision()
}

/** Kesme maskesini kaydet. */
export async function commitMask(img: ImageData | HTMLCanvasElement) {
  const st = useEditor.getState()
  const p = st.project
  if (!p) return
  const blob = await encodeCanvas(img instanceof ImageData ? imageDataToCanvas(img) : img, 'image/png')
  const name = `${Date.now().toString(36)}-mask.png`
  const rel = await platform.putAsset({ id: p.id, name, bytes: new Uint8Array(await blob.arrayBuffer()) })
  st.update((d) => {
    d.mask = rel
    d.background.useCutout = true
  })
  useEditor.getState().bumpRevision()
}

export async function putImageAsset(bytes: Uint8Array, ext = 'png') {
  const p = useEditor.getState().project
  if (!p) throw new Error('proje yok')
  return platform.putAsset({ id: p.id, name: `${Date.now().toString(36)}-img.${ext}`, bytes })
}

/** Editördeyken başka ekrana geçmeden önce açık aracı uygula ve kaydet. */
export async function leaveEditorTo(screen: import('@/store/editor').Screen) {
  const st = useEditor.getState()
  if (st.screen === 'editor') {
    if (st.tool) st.closeTool(true)
    await saveNow()
    useEditor.getState().closeProject()
  }
  useEditor.getState().go(screen)
}
export const goSettings = () => leaveEditorTo('settings')

/** Kapanış denetimi: bekleyen kaydı bitir; otomatik kayıt kapalıysa kaydedilmemiş değişikliği, açık araçta uygulanmamış sonucu bildir. */
export async function beforeClose() {
  const st = useEditor.getState()
  const en = st.settings.language === 'en'
  if (!st.project) return { unsaved: false, pending: false, en }
  if (st.settings.autosave) await saveNow()
  else await saving
  const s2 = useEditor.getState()
  const { work } = await import('@/tools/raster')
  return { unsaved: s2.doc !== s2.savedDoc, pending: !!s2.tool && work.changed, en }
}
