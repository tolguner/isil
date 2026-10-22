// Geçmiş paneli için adım adları: iki belge arasındaki farktan okunur (belgede ayrıca etiket saklanmaz,
// eski projelerin geçmişi de adlandırılabilsin). En çok iki bölüm adı birleştirilir.
import type { EditDoc } from '@shared/schema'

type Name = [string, string]

const RASTER: Record<string, Name> = {
  liquify: ['Serbest bükme', 'Liquify'], erase: ['Silme', 'Erase'], cutout: ['Kesim', 'Cutout'], inpaint: ['Silme ve onarma', 'Remove'],
  upscale: ['Kalite artırma', 'Upscale'], style: ['Stil', 'Style'], gen: ['Yapay zekâ düzenlemesi', 'AI edit'], clone: ['Klonlama', 'Clone'],
  mosaic: ['Mozaik', 'Mosaic'], paint: ['Fırça', 'Brush']
}
const TOOL: Record<string, Name> = {
  expand: ['YZ genişlet', 'AI expand'], ageface: ['Yaş ve ifade', 'Age and expression'], passersby: ['Yoldan geçenler', 'Passers-by'], text: ['Metin silme', 'Text removal'],
  sky: ['Gökyüzü', 'Sky'], abs: ['Karın kası', 'Abs'], 'portrait-blur': ['Portre bulanıklığı', 'Portrait blur'], 'body-protect': ['Vücut', 'Body'], tattoo: ['Dövme', 'Tattoo']
}
const PART: [keyof EditDoc, Name][] = [
  ['crop', ['Kırpma', 'Crop']], ['adjust', ['Ayarlar', 'Adjustments']], ['hsl', ['HSL', 'HSL']], ['curves', ['Eğriler', 'Curves']],
  ['filter', ['Filtre', 'Filter']], ['effects', ['Efekt', 'Effect']], ['local', ['Seçmeli ayar', 'Selective']], ['retouch', ['Rötuş', 'Retouch']],
  ['body', ['Vücut', 'Body']], ['background', ['Arka plan', 'Background']], ['layers', ['Katmanlar', 'Layers']], ['mask', ['Kesim maskesi', 'Cutout mask']]
]

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** prev → next adımının adı (tr, en). */
export function describeStep(prev: EditDoc, next: EditDoc): Name {
  if (next.rasterOps.length > prev.rasterOps.length) {
    const op = next.rasterOps[next.rasterOps.length - 1]
    const tool = (op.params as { tool?: string }).tool
    return (tool && TOOL[tool]) || RASTER[op.type] || ['Piksel işlemi', 'Pixel edit']
  }
  const parts = PART.filter(([k]) => !same(prev[k], next[k])).map(([, n]) => n)
  if (!parts.length) return ['Değişiklik', 'Change']
  if (parts.length === 1) return parts[0]
  return [`${parts[0][0]}, ${parts[1][0]}`, `${parts[0][1]}, ${parts[1][1]}`]
}
