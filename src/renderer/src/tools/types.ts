import type { FC } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { EditDoc } from '@shared/schema'
import type { TabId } from '@/store/editor'

export interface View {
  /** Ekran (istemci) koordinatı → çıktı uzayı normalize (0..1). */
  toNorm(clientX: number, clientY: number): { x: number; y: number }
  /** Çıktı normalize → kapsayıcıya göre px. */
  toScreen(x: number, y: number): { x: number; y: number }
  /** Görüntü ekranda kaç px (genişlik, yükseklik). */
  size: { w: number; h: number }
  outW: number
  outH: number
  scale: number
  redraw(): void
}

export interface ToolDef {
  id: string
  label: [string, string]
  icon: LucideIcon
  /** Araç açıkken kırpma/arka plan gösterilmez; çıktı uzayı = kaynak uzayı. */
  sourceSpace?: boolean
  badge?: string
  Panel: FC
  Overlay?: FC<{ view: View }>
  applied?: (d: EditDoc) => boolean
  /** Açıldığında yüz/poz analizi gerekir. */
  needs?: ('faces' | 'pose' | 'seg')[]
  /** Araç açıkken tuvalde gösterilecek belge (ör. kırpmada tam kare). */
  viewDoc?: (d: EditDoc) => EditDoc
  /** Uygula/İptal düğmeleri yerine kendi düğmelerini kullanır. */
  noFooter?: boolean
}

export interface TabDef {
  id: TabId
  label: [string, string]
  icon: LucideIcon
  tools: ToolDef[]
  /** Tek araçlı sekmelerde araç otomatik açılır. */
  auto?: boolean
  intro?: [string, string]
}
