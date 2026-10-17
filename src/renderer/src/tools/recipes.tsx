import { useEffect, useState } from 'react'
import { ChefHat } from 'lucide-react'
import { emptyAdjust, type EditDoc, type Layer } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { Preset, Slider, Tabs } from '@/components/ui'
import { thumb } from '@/engine/thumbs'
import { filterById, effectById } from '@/engine/presets'
import { highlightControl } from '@/components/CommandPalette'
import { ADJUST_NAMES } from './adjust'
import type { TabId } from '@/store/editor'
import type { ToolDef } from './types'

export interface Recipe {
  id: string
  cat: string
  name: [string, string]
  adjust?: Partial<Record<keyof EditDoc['adjust'], number>>
  filter?: [string, number]
  effects?: [string, number][]
  ratio?: string
  fill?: string
  text?: { text: string; font: string; y: number; size: number; color: string; weight?: number }
}

const today = () => new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\./g, ' ')

export const RECIPES: Recipe[] = [
  { id: 'sunset-glow', cat: 'glow', name: ['Gün batımı parıltısı', 'Sunset glow'], adjust: { temperature: 35, glow: 30, shadows: 15 }, filter: ['gun-batimi', 70], effects: [['sizinti-sicak', 45]] },
  { id: 'golden-glow', cat: 'glow', name: ['Altın ışıltı', 'Golden glow'], adjust: { exposure: 10, glow: 35 }, filter: ['altin-saat', 75], effects: [['hale', 35]] },
  { id: 'flash-glow', cat: 'glow', name: ['Flaş ışıltısı', 'Flash glow'], adjust: { exposure: 15, contrast: 15, glow: 25 }, filter: ['dijikam', 60], effects: [['flas', 55]] },
  { id: 'soft-light', cat: 'glow', name: ['Yumuşak ışık', 'Soft light'], adjust: { contrast: -10, glow: 30, highlights: -15 }, filter: ['yumusak-ten', 70], effects: [['ruya', 35]] },
  { id: 'flashback', cat: 'retro', name: ['Flashback kamera', 'Flashback cam'], adjust: { exposure: 10, sharpen: 30, grain: 25 }, filter: ['dijikam', 80], effects: [['dijikam', 70]], text: { text: '', font: 'Space Grotesk', y: 0.94, size: 0.035, color: '#ff9a3d' } },
  { id: 'y2k', cat: 'retro', name: ['2000’ler', 'Y2K'], filter: ['y2k', 85], effects: [['prizma', 30]] },
  { id: 'vhs-night', cat: 'retro', name: ['Kaset gecesi', 'VHS night'], filter: ['gece-mavi', 60], effects: [['vhs', 70], ['renk-kaymasi', 40]] },
  { id: 'film-roll', cat: 'retro', name: ['Film rulosu', 'Film roll'], filter: ['kodak-sicak', 80], effects: [['toz', 60]] },
  { id: 'polaroid', cat: 'frame', name: ['Anlık fotoğraf', 'Instant photo'], filter: ['anlik', 80], ratio: '4:5', fill: '#f7f3ea', text: { text: '', font: 'Caveat', y: 0.95, size: 0.045, color: '#3a3a3a' } },
  { id: 'magazine', cat: 'frame', name: ['Dergi kapağı', 'Magazine'], adjust: { contrast: 15, clarity: 15 }, filter: ['studyo', 70], text: { text: 'IŞIL', font: 'Abril Fatface', y: 0.1, size: 0.12, color: '#ffffff' } },
  { id: 'story', cat: 'frame', name: ['Hikâye 9:16', 'Story 9:16'], ratio: '9:16', fill: '#111111', filter: ['temiz', 60] },
  { id: 'blue-hour', cat: 'mood', name: ['Mavi saat', 'Blue hour'], adjust: { temperature: -30, shadows: 20 }, filter: ['gece-mavi', 80] },
  { id: 'cinematic', cat: 'mood', name: ['Sinematik', 'Cinematic'], adjust: { contrast: 10 }, filter: ['teal-turuncu', 85], effects: [['hale', 30]] },
  { id: 'clean-girl', cat: 'mood', name: ['Temiz görünüm', 'Clean look'], adjust: { exposure: 8, highlights: -10, vibrance: 10 }, filter: ['temiz', 80], effects: [['ruya', 20]] },
  { id: 'lush', cat: 'mood', name: ['Canlı doğa', 'Lush nature'], filter: ['canli-doga', 85] },
  { id: 'cafe', cat: 'mood', name: ['Kafe günü', 'Café day'], filter: ['kafe', 85], effects: [['sizinti-sicak', 25]] },
  { id: 'mono', cat: 'mood', name: ['Siyah beyaz', 'Monochrome'], filter: ['sb-sert', 85], effects: [['toz', 30]] }
]

export function applyRecipe(d: EditDoc, r: Recipe, amount = 100) {
  const k = amount / 100
  d.adjust = emptyAdjust()
  for (const [key, v] of Object.entries(r.adjust ?? {})) (d.adjust as Record<string, number>)[key] = Math.round((v ?? 0) * k)
  d.filter = r.filter ? { id: r.filter[0], amount: Math.round(r.filter[1] * k) } : null
  d.effects = (r.effects ?? []).map(([id, a]) => ({ id, amount: Math.round(a * k) }))
  if (r.ratio) d.background = { ...d.background, ratio: r.ratio, fill: { type: 'color', color: r.fill ?? '#ffffff' }, box: null }
  d.layers = d.layers.filter((l) => !(l.props as Record<string, unknown>).recipe)
  if (r.text) {
    const layer: Layer = {
      id: crypto.randomUUID(), type: 'text', x: 0.5, y: r.text.y, scale: 1, rotation: 0, opacity: 1,
      props: { recipe: r.id, text: r.text.text || today(), font: r.text.font, weight: r.text.weight ?? 400, size: r.text.size, color: r.text.color, opacity: 1, align: 'center', stroke: null, shadow: null, bg: null, spacing: 0.05 }
    }
    d.layers.push(layer)
  }
}

function RecipeThumb({ r }: { r: Recipe }) {
  const [url, setUrl] = useState<string | null>(null)
  const rev = useEditor((s) => s.revision)
  useEffect(() => {
    let live = true
    thumb('r:' + r.id, (d) => applyRecipe(d, { ...r, text: undefined, ratio: undefined })).then((u) => live && setUrl(u))
    return () => void (live = false)
  }, [r.id, rev])
  return url ? <img src={url} alt="" /> : null
}

/**
 * Tarifin neyi değiştirdiği (rakip incelemesi: Peachy'nin otomatik rötuşu değiştirdiği kaydırıcıları
 * noktayla gösteriyor). Her satıra dokununca ilgili araç açılır ve kaydırıcı vurgulanır.
 */
function RecipeSummary({ r, amount }: { r: Recipe; amount: number }) {
  const tr = useT()
  const st = useEditor.getState
  const k = amount / 100
  const goTo = (tab: TabId, tool: string, label?: string) => {
    st().setTab(tab)
    if (st().tool !== tool) st().openTool(tool)
    if (label) highlightControl(label)
  }
  const rows: { text: string; value: string; run: () => void }[] = []
  for (const [key, v] of Object.entries(r.adjust ?? {})) {
    const n = ADJUST_NAMES[key as keyof typeof ADJUST_NAMES]
    if (!n || !v) continue
    const val = Math.round(v * k)
    rows.push({ text: tr(n[0], n[1]), value: (val > 0 ? '+' : '') + val, run: () => goTo('adjust', 'adjust', tr(n[0], n[1])) })
  }
  if (r.filter) {
    const f = filterById(r.filter[0])
    rows.push({ text: tr('Filtre', 'Look') + ': ' + (f ? tr(f.name.tr, f.name.en) : r.filter[0]), value: String(Math.round(r.filter[1] * k)), run: () => goTo('filters', 'filters') })
  }
  for (const [id, a] of r.effects ?? []) {
    const e = effectById(id)
    rows.push({ text: tr('Efekt', 'Effect') + ': ' + (e ? tr(e.name.tr, e.name.en) : id), value: String(Math.round(a * k)), run: () => goTo('effects', 'effects') })
  }
  if (r.ratio) rows.push({ text: tr('Tuval oranı', 'Canvas ratio'), value: r.ratio, run: () => goTo('background', 'background') })
  if (r.text) rows.push({ text: tr('Metin katmanı', 'Text layer'), value: r.text.font, run: () => goTo('text', 'text') })
  if (!rows.length) return null
  return (
    <div className="recipe-summary" aria-label={tr('Tarifin değiştirdikleri', 'What this recipe changed')}>
      <div className="group-label">{tr('Değiştirdikleri', 'What it changed')}</div>
      <ul>
        {rows.map((x) => (
          <li key={x.text}>
            <button className="btn ghost sm" onClick={x.run}>
              <span>{x.text}</span>
              <output>{x.value}</output>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function RecipesPanel() {
  const tr = useT()
  const [cat, setCat] = useState('glow')
  const [sel, setSel] = useState<string | null>(null)
  const [amt, setAmt] = useState(100)
  const update = useEditor((s) => s.update)
  const apply = (id: string, a: number) => update((d) => applyRecipe(d, RECIPES.find((x) => x.id === id)!, a))
  return (
    <>
      <p className="note">{tr('Hazır tarifler ışık, filtre, efekt ve çerçeveyi tek dokunuşta uygular; sonra her şeyi ayrı ayrı düzenleyebilirsin.', 'Recipes apply light, look, effects and framing in one tap; everything stays editable afterwards.')}</p>
      <Tabs items={[{ id: 'glow', label: tr('Işıltı', 'Glow') }, { id: 'retro', label: tr('Retro', 'Retro') }, { id: 'mood', label: tr('Hava', 'Mood') }, { id: 'frame', label: tr('Çerçeve', 'Frame') }]} value={cat} onChange={setCat} />
      <div className="presets">
        {RECIPES.filter((r) => r.cat === cat).map((r) => (
          <Preset key={r.id} label={tr(r.name[0], r.name[1])} on={sel === r.id} onClick={() => { setSel(r.id); apply(r.id, amt) }}>
            <RecipeThumb r={r} />
          </Preset>
        ))}
      </div>
      {sel && <Slider plain label={tr('Yoğunluk', 'Intensity')} value={amt} onChange={(v) => { setAmt(v); apply(sel, v) }} />}
      {sel && <RecipeSummary r={RECIPES.find((x) => x.id === sel)!} amount={amt} />}
    </>
  )
}

export const RECIPE_TOOLS: ToolDef[] = [{ id: 'recipes', label: ['Tarifler', 'Recipes'], icon: ChefHat, Panel: RecipesPanel }]
