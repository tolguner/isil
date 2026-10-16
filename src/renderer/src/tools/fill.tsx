// Silme araçlarının ortak doldurma seçimi (LaMa / üretken FLUX).
import { useState } from 'react'
import { useT } from '@/lib/i18n'
import { Segmented } from '@/components/ui'

export const eraseOpts = { shadow: false, gen: false }

/** Doldurma yöntemi: LaMa (hızlı, motor gerekmez) ya da üretken FLUX (büyük alanlarda gerçekçi doku). */
export function FillMethod({ onChange }: { onChange?: () => void }) {
  const tr = useT()
  const [gen, setGen] = useState(eraseOpts.gen)
  return (
    <>
      <Segmented items={[{ id: 'fast', label: tr('Hızlı (LaMa)', 'Fast (LaMa)') }, { id: 'gen', label: tr('Üretken (FLUX)', 'Generative (FLUX)') }]} value={gen ? 'gen' : 'fast'} onChange={(v) => { eraseOpts.gen = v === 'gen'; setGen(eraseOpts.gen); onChange?.() }} />
      {gen && <p className="note">{tr('Büyük nesnelerde arkayı gerçekçi dokuyla yeniden çizer. Yerel YZ motoru gerekir; 20–90 sn sürer.', 'Redraws large areas with realistic texture. Needs the local AI engine; takes 20–90 s.')}</p>}
    </>
  )
}

