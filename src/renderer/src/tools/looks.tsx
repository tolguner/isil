import { useEffect, useState } from 'react'
import { Aperture, Sparkle, Zap, Ban } from 'lucide-react'
import type { EditDoc } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { useT, useName } from '@/lib/i18n'
import { Preset, Slider, Tabs } from '@/components/ui'
import { EFFECTS, EFFECT_CATS, FILTERS, FILTER_CATS, MOODS, effectById } from '@/engine/presets'
import { thumb } from '@/engine/thumbs'
import { applyMood } from '@/screens/Home'
import { PORTRAIT_BLUR_TOOL } from './portraitblur'
import { MOTION_TOOL } from './motion'
import type { ToolDef } from './types'

function Thumb({ id, variant, fallback }: { id: string; variant: (d: EditDoc) => void; fallback?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const revision = useEditor((s) => s.revision)
  useEffect(() => {
    let live = true
    thumb(id, variant).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [id, revision])
  return url ? <img src={url} alt="" draggable={false} /> : <span style={{ width: '100%', height: '100%', background: fallback }} />
}

function FiltersPanel() {
  const tr = useT()
  const name = useName()
  const [cat, setCat] = useState('trend')
  const filter = useEditor((s) => s.doc.filter)
  const update = useEditor((s) => s.update)
  const list = FILTERS.filter((f) => f.cat === cat)
  return (
    <>
      <Tabs items={FILTER_CATS.map((c) => ({ id: c.id, label: name(c), mod: !!filter && FILTERS.some((x) => x.id === filter.id && x.cat === c.id) }))} value={cat} onChange={setCat} label={tr('Filtre kategorileri', 'Filter categories')} />
      {filter && (
        <Slider label={tr('Yoğunluk', 'Intensity')} value={filter.amount} onChange={(v) => update((d) => void (d.filter = { ...d.filter!, amount: v }))} />
      )}
      <div className="presets">
        <Preset label={tr('Yok', 'None')} on={!filter} onClick={() => update((d) => void (d.filter = null))}>
          <Ban size={22} color="var(--c-text-faint)" />
        </Preset>
        {list.map((f) => (
          <Preset key={f.id} label={name(f.name)} on={filter?.id === f.id} onClick={() => update((d) => void (d.filter = { id: f.id, amount: d.filter?.id === f.id ? d.filter.amount : 80 }))}>
            <Thumb id={'f:' + f.id} variant={(d) => void (d.filter = { id: f.id, amount: 85 })} fallback={`linear-gradient(160deg, ${f.swatch[0]}, ${f.swatch[1]})`} />
          </Preset>
        ))}
      </div>
    </>
  )
}

function MoodsPanel() {
  const tr = useT()
  const name = useName()
  return (
    <>
      <p className="note">{tr('Tek dokunuşla ışık ve renk havası. Sonra Ayarla ve Filtrelerden ince ayar yapabilirsin.', 'A one-tap light and color mood. Fine-tune later in Adjust and Looks.')}</p>
      <div className="presets">
        {MOODS.map((m) => (
          <Preset key={m.id} label={name(m.name)} onClick={() => applyMood(m.id)}>
            <Thumb
              id={'m:' + m.id}
              variant={(d) => {
                for (const [k, v] of Object.entries(m.adjust)) (d.adjust as Record<string, number>)[k] = Math.round((v ?? 0) * 100)
                if (m.filter) d.filter = { id: m.filter, amount: 80 }
                if (m.effect) d.effects = [{ id: m.effect, amount: 60 }]
              }}
            />
          </Preset>
        ))}
      </div>
    </>
  )
}

function EffectsPanel() {
  const tr = useT()
  const name = useName()
  const [cat, setCat] = useState('blur')
  const effects = useEditor((s) => s.doc.effects)
  const update = useEditor((s) => s.update)
  const active = effects.map((e) => e.id)
  const toggle = (id: string) =>
    update((d) => {
      const i = d.effects.findIndex((e) => e.id === id)
      if (i >= 0) d.effects.splice(i, 1)
      else d.effects.push({ id, amount: effectById(id)?.def ?? 70 })
    })
  return (
    <>
      <Tabs items={EFFECT_CATS.map((c) => ({ id: c.id, label: name(c), mod: effects.some((e) => effectById(e.id)?.cat === c.id) }))} value={cat} onChange={setCat} />
      {effects.map((e) => {
        const def = effectById(e.id)
        if (!def) return null
        return (
          <Slider key={e.id} label={name(def.name)} value={e.amount} onChange={(v) => update((d) => void (d.effects.find((x) => x.id === e.id)!.amount = v))} />
        )
      })}
      <div className="presets">
        {EFFECTS.filter((e) => e.cat === cat).map((e) => (
          <Preset key={e.id} label={name(e.name)} on={active.includes(e.id)} onClick={() => toggle(e.id)}>
            <Thumb id={'e:' + e.id} variant={(d) => void (d.effects = [{ id: e.id, amount: 80 }])} />
          </Preset>
        ))}
      </div>
      {!!effects.length && <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => update((d) => void (d.effects = []))}>{tr('Tüm efektleri kaldır', 'Remove all effects')}</button>}
      <p className="note">{tr('Birden çok efekt üst üste uygulanabilir; sıra eklenme sırasıdır.', 'Effects stack; order follows the order you add them.')}</p>
    </>
  )
}

export const FILTER_TOOLS: ToolDef[] = [
  { id: 'filters', label: ['Filtreler', 'Looks'], icon: Aperture, Panel: FiltersPanel, applied: (d) => !!d.filter },
  { id: 'moods', label: ['Hızlı hava', 'Moods'], icon: Zap, Panel: MoodsPanel }
]
export const EFFECT_TOOLS: ToolDef[] = [{ id: 'effects', label: ['Efektler', 'Effects'], icon: Sparkle, Panel: EffectsPanel, applied: (d) => d.effects.length > 0 }, PORTRAIT_BLUR_TOOL, MOTION_TOOL]
