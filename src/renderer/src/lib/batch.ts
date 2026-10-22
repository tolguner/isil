// Rötuşlu toplu işlem: her fotoğraf geçici bir projede yüzleriyle birlikte tam motordan (maskeler, göz makyajı,
// meta veri) geçer, sonra geçici proje silinir. Toplu düzenle ekranı ve testler kullanır.
import type { EditDoc, FaceEdit } from '@shared/schema'
import { platform } from './platform'
import { imageSize } from './projects'
import { useEditor } from '@/store/editor'
import { session } from '@/engine/session'
import { applyBeauty } from '@/tools/retouch'

/** tpl: projeden kopyalanan yüz ayarı ya da tek dokunuş ön ayarı (id + yoğunluk). Her yüze aynısı uygulanır. */
export async function batchRetouch(bytes: Uint8Array, name: string, doc: EditDoc, tpl: FaceEdit | { preset: string; amount: number }, fmt: 'jpeg' | 'png') {
  const { w, h } = await imageSize(bytes)
  const p = await platform.createProject({ name: '~toplu-' + name, bytes, width: w, height: h, doc })
  try {
    session.reset()
    await session.sync(p, doc)
    const faces = await session.ensureFaces()
    await session.ensureSeg().catch(() => null)
    const d = structuredClone(doc)
    d.retouch.faces = []
    for (let i = 0; i < faces.length; i++) {
      if ('preset' in tpl) applyBeauty(d, i, tpl.preset, tpl.amount)
      else d.retouch.faces.push({ ...structuredClone(tpl), index: i })
    }
    const s = useEditor.getState().settings
    return (await session.exportBlob(d, { exportFormat: fmt, exportQuality: s.exportQuality, exportMaxSide: 0, exportMeta: s.exportMeta })).blob
  } finally {
    session.reset()
    await platform.deleteProjects([p.id]).catch(() => {})
  }
}
