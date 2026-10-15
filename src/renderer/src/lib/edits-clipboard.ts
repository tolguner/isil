// Ayarları kopyala / yapıştır (Ctrl+Shift+C / Ctrl+Shift+V): bir fotoğrafın "görünümünü" başka fotoğraflara taşır.
// Kullanıcı isteği (Peachy yorumları): aynı ayarı her fotoğrafa elle tekrar yapmak. Kırpma, yüz rötuşu, katmanlar ve
// piksel işlemleri fotoğrafa özgü olduğu için kopyalanmaz.
import type { EditDoc } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { tNow } from './i18n'

type Look = Pick<EditDoc, 'adjust' | 'hsl' | 'curves' | 'filter' | 'effects'>
const KEY = 'isil.copiedLook'
let mem: Look | null = null

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export function copyLook() {
  const d = useEditor.getState().doc
  mem = clone({ adjust: d.adjust, hsl: d.hsl, curves: d.curves, filter: d.filter, effects: d.effects })
  try {
    localStorage.setItem(KEY, JSON.stringify(mem))
  } catch {
    // tarayıcı depolaması yoksa yalnız bu oturumda kalır
  }
  useEditor.getState().toast('success', tNow('Ayarlar kopyalandı (ışık, renk, filtre, efektler)', 'Edits copied (light, color, look, effects)'))
}

export function hasLook() {
  if (mem) return true
  try {
    return !!localStorage.getItem(KEY)
  } catch {
    return false
  }
}

export function pasteLook() {
  let look = mem
  if (!look) {
    try {
      look = JSON.parse(localStorage.getItem(KEY) || 'null')
    } catch {
      look = null
    }
  }
  const st = useEditor.getState()
  if (!look) {
    st.toast('info', tNow('Önce bir fotoğrafta Ctrl+Shift+C ile ayarları kopyala.', 'Copy edits from a photo first with Ctrl+Shift+C.'))
    return
  }
  const l = clone(look)
  st.commit((d) => {
    d.adjust = l.adjust
    d.hsl = l.hsl
    d.curves = l.curves
    d.filter = l.filter
    d.effects = l.effects
  })
  st.toast('success', tNow('Ayarlar yapıştırıldı', 'Edits pasted'))
}
