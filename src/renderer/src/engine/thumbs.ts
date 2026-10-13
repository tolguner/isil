// Ön ayar küçük resimleri: küçük ayrı bir motorla gerçek fotoğraf üzerinde üretilir.
import { emptyDoc, type EditDoc } from '@shared/schema'
import { Renderer } from './renderer'
import { session } from './session'

let r: Renderer | null = null
let key = ''
const cache = new Map<string, string>()
let queue: Promise<unknown> = Promise.resolve()

async function ensure() {
  if (!session.preview) return null
  if (!r) r = new Renderer(document.createElement('canvas'))
  if (key !== session.baseKey) {
    const s = 180 / Math.max(session.preview.width, session.preview.height)
    const bm = await createImageBitmap(session.preview, { resizeWidth: Math.max(1, Math.round(session.preview.width * s)), resizeHeight: Math.max(1, Math.round(session.preview.height * s)), resizeQuality: 'medium' })
    r.setBase(bm)
    bm.close()
    key = session.baseKey
    cache.clear()
  }
  return r
}

/** variant: boş belgeye uygulanacak değişiklik. id önbellek anahtarıdır. */
export function thumb(id: string, variant: (d: EditDoc) => void): Promise<string | null> {
  const k = session.baseKey + ':' + id
  const hit = cache.get(k)
  if (hit) return Promise.resolve(hit)
  const p = queue.then(async () => {
    const rr = await ensure()
    if (!rr) return null
    const doc = emptyDoc()
    variant(doc)
    const out = rr.render(doc, {})
    const img = rr.read(out.target)
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    c.getContext('2d')!.putImageData(img, 0, 0)
    const url = c.toDataURL('image/jpeg', 0.8)
    cache.set(session.baseKey + ':' + id, url)
    return url
  })
  queue = p.catch(() => null)
  return p
}
