import { MinorGate } from '@/components/MinorGate'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Smile, ScanFace, Sparkles, Palette, Droplet, Scissors, PersonStanding, Brush, EyeOff, Sun, Wand, Shell, Gem } from 'lucide-react'
import type { EditDoc, ProtectStroke } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { ColorRow, Preset, Slider, Tabs, Segmented, Switch, ToolFoot } from '@/components/ui'
import { session } from '@/engine/session'
import { FaceGeo, OVAL, allProtect, drawProtect, faceState } from '@/engine/face'
import { BODY_PRESETS, bakeBodyWarp } from '@/engine/body'
import { depthMap, inpaintTiles, toCanvas } from '@/ai/ops'
import { commitRaster } from '@/lib/projects'
import type { ToolDef, View } from './types'
import { ApplyAll, FaceOverlay, NoFace, SidePicker, editFace, useFace, useFaceCount } from './faceui'
import { BrushOverlay, PaintMask, type BrushState } from './brush'
import { busy } from './raster'
import { AGEFACE_TOOL, ageRequest } from './ageface'
import { PHYSIQUE_TOOL } from './physique'

type SliderDef = [key: string, tr: string, en: string]

// ---------------- Yüz şekli ----------------
const SHAPE_TABS: { id: string; label: [string, string]; keys: SliderDef[] }[] = [
  { id: 'ratio', label: ['Oran', 'Ratio'], keys: [['upperFace', 'Üst yüz', 'Upper face'], ['midFace', 'Orta yüz', 'Mid face'], ['lowerFace', 'Alt yüz', 'Lower face'], ['eyeSpacing', 'Göz aralığı', 'Eye spacing']] },
  {
    id: 'face', label: ['Yüz', 'Face'], keys: [
      ['resize', 'Boyut', 'Size'], ['smallFace', 'Küçük yüz', 'Smaller face'], ['slim', 'İncelt', 'Slim'], ['width', 'Genişlik', 'Width'],
      ['temple', 'Şakak', 'Temples'], ['cheekbone', 'Elmacık kemiği', 'Cheekbones'], ['jaw', 'Çene hattı', 'Jawline'], ['chin', 'Çene ucu', 'Chin'],
      ['vshape', 'V çizgisi', 'V-line'], ['pointed', 'Sivri çene', 'Pointed chin'], ['hairline', 'Saç çizgisi', 'Hairline'], ['length', 'Uzunluk', 'Length']
    ]
  },
  {
    id: 'eyes', label: ['Göz', 'Eyes'], keys: [
      ['eyeSize', 'Boyut', 'Size'], ['eyeHeight', 'Yükseklik', 'Height'], ['eyeWidth', 'Genişlik', 'Width'], ['eyePos', 'Konum', 'Position'],
      ['eyeDist', 'Mesafe', 'Distance'], ['eyeTilt', 'Açı', 'Tilt'], ['eyeLower', 'Alt kapak', 'Lower lid'], ['iris', 'İris', 'Iris'],
      ['eyeInner', 'İç köşe', 'Inner corner'], ['eyeOuter', 'Dış köşe', 'Outer corner']
    ]
  },
  {
    id: 'nose', label: ['Burun', 'Nose'], keys: [
      ['noseSize', 'Boyut', 'Size'], ['noseWidth', 'Genişlik', 'Width'], ['noseBridge', 'Burun kemiği', 'Bridge'], ['noseLift', 'Kaldır', 'Lift'],
      ['noseTip', 'Uç', 'Tip'], ['noseRoot', 'Kök', 'Root'], ['noseLength', 'Uzunluk', 'Length']
    ]
  },
  {
    id: 'brows', label: ['Kaş', 'Brows'], keys: [
      ['browPos', 'Konum', 'Position'], ['browTilt', 'Eğim', 'Tilt'], ['browDist', 'Mesafe', 'Distance'], ['browThick', 'Kalınlık', 'Thickness'],
      ['browLength', 'Uzunluk', 'Length'], ['browHigh', 'Kemer', 'Arch']
    ]
  },
  {
    id: 'lips', label: ['Dudak', 'Lips'], keys: [
      ['lipSize', 'Boyut', 'Size'], ['plump', 'Dolgun', 'Plump'], ['lipWidth', 'Genişlik', 'Width'], ['lipPos', 'Konum', 'Position'],
      ['smile', 'Gülümseme', 'Smile'], ['mShape', 'M biçimi', 'M-shape'], ['upperLip', 'Üst dudak', 'Upper lip'], ['lowerLip', 'Alt dudak', 'Lower lip'], ['lipAngle', 'Açı', 'Angle']
    ]
  },
  {
    id: 'pose', label: ['Yön', 'Pose'], keys: [
      ['yaw', 'Sağa-sola çevir', 'Turn left-right'], ['pitch', 'Yukarı-aşağı', 'Tilt up-down'], ['roll', 'Baş eğimi', 'Head tilt'], ['symmetry', 'Simetri', 'Symmetry'], ['selfie', 'Selfie düzeltme', 'Selfie fix']
    ]
  }
]
/** Tek yönlü (0..100) yüz kaydırıcıları. */
const UNIPOLAR = new Set(['symmetry', 'selfie'])

function ShapeSliders({ keys }: { keys: SliderDef[] }) {
  const tr = useT()
  const f = useFace()
  const idx = useEditor((s) => s.selectedFace)
  const update = useEditor((s) => s.update)
  return (
    <>
      {keys.map(([k, a, b]) => (
        <Slider key={k} label={tr(a, b)} bipolar={!UNIPOLAR.has(k)} value={f.shape[k] ?? 0} onChange={(v) => update((d) => editFace(d, idx, (x) => void (x.shape[k] = v)))} />
      ))}
    </>
  )
}

// Bölgeye özel hazır ayarlar (Peachy "İnce Ayar" benzeri ihtiyaç; adlar ve değerler bizim). Seçilen sekmenin
// kaydırıcılarını birlikte ayarlar; aynı karta tekrar basınca o bölge sıfırlanır.
const FEATURE_PRESETS: Record<string, { id: string; label: [string, string]; v: Record<string, number> }[]> = {
  face: [
    { id: 'oval', label: ['Oval', 'Oval'], v: { slim: 25, jaw: 15, chin: 8 } },
    { id: 'heart', label: ['Kalp', 'Heart'], v: { vshape: 35, pointed: 20, temple: 10 } },
    { id: 'soft', label: ['Yumuşak', 'Soft'], v: { jaw: 20, cheekbone: -10, smallFace: 10 } },
    { id: 'defined', label: ['Belirgin', 'Defined'], v: { cheekbone: 25, jaw: -10, temple: -10 } }
  ],
  eyes: [
    { id: 'big', label: ['İri', 'Big'], v: { eyeSize: 30, iris: 10 } },
    { id: 'almond', label: ['Badem', 'Almond'], v: { eyeWidth: 25, eyeHeight: -10, eyeTilt: 15 } },
    { id: 'round', label: ['Yuvarlak', 'Round'], v: { eyeHeight: 30, eyeSize: 10 } },
    { id: 'lifted', label: ['Kalkık', 'Lifted'], v: { eyeTilt: 30, eyeOuter: 15 } }
  ],
  nose: [
    { id: 'slim', label: ['İnce', 'Slim'], v: { noseWidth: -30, noseBridge: -20 } },
    { id: 'small', label: ['Küçük', 'Small'], v: { noseSize: -25, noseLength: -15 } },
    { id: 'lifted', label: ['Kalkık uç', 'Lifted tip'], v: { noseLift: 30, noseTip: -15 } },
    { id: 'straight', label: ['Düz', 'Straight'], v: { noseBridge: -15, noseRoot: 10, noseWidth: -10 } }
  ],
  brows: [
    { id: 'arched', label: ['Kavisli', 'Arched'], v: { browHigh: 30, browTilt: 10 } },
    { id: 'straight', label: ['Düz', 'Straight'], v: { browHigh: -20, browTilt: -15 } },
    { id: 'thick', label: ['Gür', 'Bold'], v: { browThick: 30, browLength: 10 } },
    { id: 'lifted', label: ['Kalkık', 'Lifted'], v: { browPos: 25, browTilt: 15 } }
  ],
  lips: [
    { id: 'full', label: ['Dolgun', 'Full'], v: { plump: 35, lipSize: 15 } },
    { id: 'smile', label: ['Gülümseme', 'Smile'], v: { smile: 35, lipAngle: 10 } },
    { id: 'heart', label: ['Kalp dudak', 'Heart lips'], v: { mShape: 35, upperLip: 15 } },
    { id: 'wide', label: ['Geniş', 'Wide'], v: { lipWidth: 25, lowerLip: 10 } }
  ]
}

// Alt sekme modül düzeyinde: Ctrl+K paleti bir kaydırıcıya giderken doğru sekmeyi açabilsin
let shapeTab = 'face'
const shapeTabListeners = new Set<(t: string) => void>()
function selectShapeTab(t: string) {
  shapeTab = t
  shapeTabListeners.forEach((f) => f(t))
}

function FaceShapePanel() {
  const tr = useT()
  const f = useFace()
  const idx = useEditor((s) => s.selectedFace)
  const update = useEditor((s) => s.update)
  const [tab, setTabState] = useState(shapeTab)
  useEffect(() => {
    shapeTabListeners.add(setTabState)
    return () => void shapeTabListeners.delete(setTabState)
  }, [])
  const setTab = (t: string) => selectShapeTab(t)
  const keys = SHAPE_TABS.find((t) => t.id === tab)!.keys
  return (
    <>
      <NoFace />
      <Tabs items={SHAPE_TABS.map((t) => ({ id: t.id, label: tr(t.label[0], t.label[1]), mod: t.keys.some(([k]) => !!f.shape[k]) }))} value={tab} onChange={setTab} />
      <SidePicker />
      {FEATURE_PRESETS[tab] && (
        <div className="presets feature-presets" role="group" aria-label={tr('Hazır ayarlar', 'Presets')}>
          {FEATURE_PRESETS[tab].map((p) => {
            const on = Object.entries(p.v).every(([k, v]) => (f.shape[k] ?? 0) === v)
            return (
              <button key={p.id} className={'btn sm' + (on ? ' primary' : '')} aria-pressed={on} onClick={() => update((d) => editFace(d, idx, (x) => {
                for (const [k] of keys) delete x.shape[k]
                if (!on) Object.assign(x.shape, p.v)
              }))}>{tr(p.label[0], p.label[1])}</button>
            )
          })}
        </div>
      )}
      <ShapeSliders keys={keys} />
      <ApplyAll group="shape" keys={keys.map((k) => k[0])} />
      <p className="note">{tr('Kaydırıcıya çift tıklayınca sıfırlanır. Tek tarafı düzenlemek için Sol/Sağ seç.', 'Double-click a slider to reset. Pick Left/Right to edit one side.')}</p>
    </>
  )
}

// ---------------- Cilt ----------------
const SKIN_KEYS: SliderDef[] = [
  ['smooth', 'Pürüzsüzleştir', 'Smooth'], ['blemish', 'Leke giderme', 'Blemishes'], ['pores', 'Gözenek', 'Pores'], ['wrinkle', 'Kırışıklık', 'Wrinkles'],
  ['undereye', 'Göz altı', 'Dark circles'], ['detail', 'Ayrıntı', 'Detail'], ['texture', 'Cilt dokusu', 'Skin texture'], ['whiten', 'Aydınlat', 'Brighten'], ['teeth', 'Diş beyazlat', 'Whiten teeth'],
  ['eyes', 'Göz parlat', 'Brighten eyes']
]

function SkinPanel() {
  const tr = useT()
  const f = useFace()
  const idx = useEditor((s) => s.selectedFace)
  const update = useEditor((s) => s.update)
  const set = (vals: Record<string, number>) => update((d) => editFace(d, idx, (x) => Object.assign(x.skin, vals)))
  return (
    <>
      <NoFace />
      <div className="row wrap" style={{ marginBottom: 8 }}>
        <button className="btn sm primary" onClick={() => set({ smooth: 45, blemish: 60, undereye: 40, eyes: 25, teeth: 30, whiten: 10, pores: 30, texture: 20 })}><Sparkles size={14} /> {tr('Oto', 'Auto')}</button>
        <button className="btn sm" onClick={() => set({ smooth: 25, blemish: 40, undereye: 25, pores: 15 })}>{tr('Doğal', 'Natural')}</button>
        <button className="btn sm" onClick={() => set({ smooth: 70, blemish: 80, undereye: 55, whiten: 20, pores: 60, wrinkle: 40, texture: 30 })}>{tr('Pürüzsüz', 'Flawless')}</button>
        <button className="btn sm ghost" onClick={() => update((d) => editFace(d, idx, (x) => void (x.skin = {})))}>{tr('Sıfırla', 'Reset')}</button>
      </div>
      {SKIN_KEYS.map(([k, a, b]) => (
        <Slider key={k} label={tr(a, b)} value={f.skin[k] ?? 0} onChange={(v) => update((d) => editFace(d, idx, (x) => void (x.skin[k] = v)))} />
      ))}
      <ApplyAll group="skin" keys={SKIN_KEYS.map((k) => k[0])} />
      <ProtectSection />
    </>
  )
}

// İşaretleri koru: kullanıcı dövme/ben/hızmayı boyar; leke, yumuşatma, kırışık ve ten o bölgeye uygulanmaz.
// Ar-Ge: replica/arge/01-rotus-isaret-koruma.md (B).
const protectStore = { on: false, erase: false, size: 0.04 }
const protectListeners = new Set<() => void>()
const protectEmit = () => protectListeners.forEach((f) => f())
function useProtectStore() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    protectListeners.add(h)
    return () => void protectListeners.delete(h)
  }, [])
  return protectStore
}

function ProtectSection() {
  const tr = useT()
  const p = useProtectStore()
  const f = useFace()
  const idx = useEditor((s) => s.selectedFace)
  const update = useEditor((s) => s.update)
  const count = (f.protect ?? []).filter((s) => !s.erase).length
  useEffect(() => () => { protectStore.on = false; protectStore.erase = false }, [])
  return (
    <div className="protect-box" style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{tr('İşaretleri koru', 'Protect marks')}</strong>
        <Switch on={p.on} label={tr('Koruma fırçası', 'Protect brush')} onChange={(v) => { protectStore.on = v; protectEmit() }} />
      </div>
      <p className="note">{tr('Dövme, ben, çil ya da hızmanın üzerine boya. Leke giderme, pürüzsüzleştirme ve ten tonu boyadığın yere dokunmaz.', 'Paint over tattoos, moles, freckles or piercings. Blemish removal, smoothing and skin tone leave the painted area alone.')}</p>
      {p.on && (
        <>
          <Segmented items={[{ id: 'paint', label: tr('Boya', 'Paint') }, { id: 'erase', label: tr('Sil', 'Erase') }]} value={p.erase ? 'erase' : 'paint'} onChange={(v) => { protectStore.erase = v === 'erase'; protectEmit() }} />
          <Slider plain label={tr('Fırça boyutu', 'Brush size')} min={1} max={20} value={Math.round(p.size * 100)} onChange={(v) => { protectStore.size = v / 100; protectEmit() }} />
        </>
      )}
      {!!f.protect?.length && (
        <button className="btn ghost sm block" onClick={() => update((d) => editFace(d, idx, (x) => void delete x.protect))}>
          {tr(`Korumayı temizle (${count})`, `Clear protection (${count})`)}
        </button>
      )}
    </div>
  )
}

function SkinOverlay({ view }: { view: View }) {
  const p = useProtectStore()
  const faces = useEditor((s) => s.doc.retouch.faces)
  const idx = useEditor((s) => s.selectedFace)
  const update = useEditor((s) => s.update)
  const [mask, setMask] = useState<PaintMask | null>(null)
  const [v, setV] = useState(0)
  const pts = useRef<number[]>([])
  const strokes = useMemo(() => allProtect(faces), [faces])
  // belgedeki izleri önizleme maskesine yeniden çiz
  useEffect(() => {
    if (!p.on) return setMask(null)
    const pv = session.preview
    if (!pv) return
    const m = mask && mask.w === pv.width && mask.h === pv.height ? mask : new PaintMask(pv.width, pv.height)
    m.clear()
    drawProtect(m.ctx, strokes, m.w, m.h)
    setMask(m)
    setV((x) => x + 1)
  }, [p.on, strokes])
  if (!p.on) return <FaceOverlay view={view} />
  const brush: BrushState = { size: p.size, hardness: 0.6, erase: p.erase }
  return (
    <BrushOverlay
      view={view} brush={brush} mask={mask} tint="rgba(90,200,255,0.4)" version={v}
      onStart={(q) => { pts.current = [q.x, q.y] }}
      onMove={(q) => { pts.current.push(q.x, q.y) }}
      onEnd={() => {
        const st: ProtectStroke = { pts: pts.current.map((n) => Math.round(n * 1e4) / 1e4), r: p.size / 2, ...(p.erase ? { erase: true } : {}) }
        pts.current = []
        update((d) => editFace(d, idx, (x) => { x.protect = [...(x.protect ?? []), st] }))
      }}
    />
  )
}

// ---------------- Tek dokunuş güzellik ----------------
export const BEAUTY: { id: string; label: [string, string]; skin: Record<string, number>; shape: Record<string, number>; makeup?: Record<string, { amount: number; color: string }> }[] = [
  { id: 'natural', label: ['Doğal', 'Natural'], skin: { smooth: 30, blemish: 50, undereye: 30, eyes: 15 }, shape: {} },
  { id: 'fresh', label: ['Taze', 'Fresh'], skin: { smooth: 40, blemish: 60, undereye: 45, eyes: 30, whiten: 15, teeth: 25 }, shape: { eyeSize: 10, slim: 10 } },
  { id: 'studio', label: ['Stüdyo', 'Studio'], skin: { smooth: 55, blemish: 70, pores: 40, undereye: 50, contour: 30, highlight: 25 }, shape: { slim: 15, noseWidth: -10 } },
  { id: 'young', label: ['Genç', 'Youthful'], skin: { smooth: 60, wrinkle: 60, undereye: 60, whiten: 15, plumpLight: 30 }, shape: { eyeSize: 12, smallFace: 10, chin: -8 } },
  { id: 'glam', label: ['Işıltılı', 'Glam'], skin: { smooth: 50, blemish: 60, eyes: 35, highlight: 45, contour: 35 }, shape: { slim: 15, eyeSize: 12, plump: 15 }, makeup: { lip: { amount: 55, color: '#b8324a' }, blush: { amount: 35, color: '#f08a8a' } } },
  { id: 'soft', label: ['Yumuşak', 'Soft'], skin: { smooth: 45, blemish: 50, whiten: 20, undereye: 40 }, shape: {}, makeup: { blush: { amount: 30, color: '#f7a5a5' }, lip: { amount: 30, color: '#e07a8a' } } },
  { id: 'chiseled', label: ['Keskin', 'Chiseled'], skin: { smooth: 25, contour: 50, highlight: 30 }, shape: { jaw: 15, cheekbone: 15, noseWidth: -15 } },
  { id: 'baby', label: ['Bebek yüz', 'Baby face'], skin: { smooth: 55, whiten: 20, plumpLight: 40 }, shape: { eyeSize: 20, smallFace: 15, noseSize: -15, chin: -10 } }
]

/** Tek dokunuş ön ayarını belgedeki bir yüze uygular (hem panel hem önizleme kullanır). */
export function applyBeauty(d: EditDoc, idx: number, id: string, a: number) {
  const p = BEAUTY.find((b) => b.id === id)!
  editFace(d, idx, (f) => {
    f.skin = Object.fromEntries(Object.entries(p.skin).map(([k, v]) => [k, Math.round((v * a) / 100)]))
    f.shape = Object.fromEntries(Object.entries(p.shape).map(([k, v]) => [k, Math.round((v * a) / 100)]))
    f.makeup = { ...f.makeup, lip: undefined as never, blush: undefined as never }
    delete f.makeup.lip
    delete f.makeup.blush
    for (const [k, m] of Object.entries(p.makeup ?? {})) f.makeup[k] = { preset: id, amount: Math.round((m.amount * a) / 100), color: m.color }
  })
}

/** Ön ayar kartları için seçili yüzün önizlemeleri (gerçek fotoğraf üzerinde, yüz kırpımı). */
function useBeautyPreviews(idx: number) {
  const [pv, setPv] = useState<Record<string, string>>({})
  const revision = useEditor((s) => s.revision)
  useEffect(() => {
    let live = true
    setPv({})
    void (async () => {
      const faces = await session.ensureFaces()
      const f = faces[idx]
      if (!f) return
      const base = JSON.parse(JSON.stringify(useEditor.getState().toolSnapshot ?? useEditor.getState().doc)) as EditDoc
      for (const b of BEAUTY) {
        if (!live) return
        const d = JSON.parse(JSON.stringify(base)) as EditDoc
        applyBeauty(d, idx, b.id, 80)
        const c = await session.renderPreview(d, 1000)
        if (!c || !live) return
        // yüz kutusu (normalize noktalar → önizleme pikseli), biraz genişletilmiş kare
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0
        for (const p of f) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y) }
        const side = Math.max((x1 - x0) * c.width, (y1 - y0) * c.height) * 1.35
        const cx = ((x0 + x1) / 2) * c.width, cy = ((y0 + y1) / 2) * c.height
        const t = document.createElement('canvas')
        t.width = t.height = 112
        t.getContext('2d')!.drawImage(c, cx - side / 2, cy - side / 2, side, side, 0, 0, 112, 112)
        const url = t.toDataURL('image/jpeg', 0.85)
        setPv((m) => ({ ...m, [b.id]: url }))
      }
    })()
    return () => {
      live = false
    }
  }, [idx, revision])
  return pv
}

/**
 * Yüz durumuna göre öneri: kapalı göz → Gözleri aç, ciddi ifade → Hafif gülümse (Yaş ve ifade aracı, YZ).
 * Kullanıcı kartı kapatabilir; aynı fotoğrafta bir daha gösterilmez.
 */
const hintsClosed = new Set<string>()
function FaceHints() {
  const tr = useT()
  const n = useFaceCount()
  const sel = useEditor((s) => s.selectedFace)
  const key = useEditor((s) => s.project?.id ?? '') + ':' + sel
  const [, force] = useState(0)
  const g = n > 0 ? session.faceGeos()[sel] : undefined
  if (!g || hintsClosed.has(key)) return null
  const st = faceState(g)
  const hint = st.eyesClosed
    ? { change: 'eyes' as const, text: tr('Gözler kapalı görünüyor.', 'The eyes look closed.'), btn: tr('Gözleri aç', 'Open eyes') }
    : st.serious ? { change: 'smile' as const, text: tr('İfade ciddi görünüyor.', 'The expression looks serious.'), btn: tr('Hafif gülümset', 'Add a soft smile') } : null
  if (!hint) return null
  return (
    <div className="card hint-card" role="status">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>{hint.text}</span>
        <button className="icon-btn" aria-label={tr('Öneriyi kapat', 'Dismiss')} onClick={() => { hintsClosed.add(key); force((x) => x + 1) }}>×</button>
      </div>
      <button className="btn sm primary" style={{ marginTop: 8 }} onClick={() => { ageRequest.change = hint.change; const S = useEditor.getState(); S.openTool('ageface') }}>{hint.btn} <span className="badge-inline">YZ</span></button>
    </div>
  )
}

function BeautyPanel() {
  const tr = useT()
  const idx = useEditor((s) => s.selectedFace)
  const update = useEditor((s) => s.update)
  const [sel, setSel] = useState<string | null>(null)
  // doğal varsayılan (Tolga onayı 22.10): %80 cildi plastikleştiriyordu
  const [amt, setAmt] = useState(60)
  const pv = useBeautyPreviews(idx)
  const apply = (id: string, a: number) => update((d) => applyBeauty(d, idx, id, a))
  return (
    <>
      <NoFace />
      <FaceHints />
      <p className="note">{tr('Cilt, şekil ve hafif makyajı tek dokunuşta birleştirir. Tümü bilgisayarında, anında çalışır.', 'Combines skin, shape and light makeup in one tap. Runs instantly on your computer.')}</p>
      <div className="presets">
        {BEAUTY.map((b) => (
          <Preset key={b.id} label={tr(b.label[0], b.label[1])} on={sel === b.id} onClick={() => { setSel(b.id); apply(b.id, amt) }}>
            {pv[b.id] ? <img src={pv[b.id]} alt="" draggable={false} /> : <Sparkles size={22} color={sel === b.id ? 'var(--c-accent)' : 'var(--c-text-faint)'} />}
          </Preset>
        ))}
      </div>
      {sel && <Slider plain label={tr('Yoğunluk', 'Intensity')} value={amt} onChange={(v) => { setAmt(v); apply(sel, v) }} />}
    </>
  )
}

// ---------------- Makyaj ----------------
const MAKEUP_CATS: { id: string; label: [string, string]; colors: string[]; def: string; styles?: [string, string, string][] }[] = [
  { id: 'lip', label: ['Ruj', 'Lipstick'], colors: ['#b8324a', '#d94f5c', '#e07a8a', '#a83250', '#8e2a3b', '#c46a5a', '#ff6b81', '#9b4a6e', '#d7836a', '#6e1f2e'], def: '#b8324a' , styles: [['satin', 'Saten', 'Satin'], ['matte', 'Mat', 'Matte'], ['gloss', 'Parlak', 'Gloss'], ['glass', 'Cam', 'Glass'], ['ombre', 'Ombre', 'Ombré']] },
  { id: 'blush', label: ['Allık', 'Blush'], colors: ['#f08a8a', '#f7a5a5', '#ff9e7a', '#e6738a', '#d98a6c', '#f2b0c0'], def: '#f08a8a' },
  { id: 'lid', label: ['Far', 'Eyeshadow'], colors: ['#8a5a6a', '#b07a5a', '#6a4a3a', '#a06a8a', '#5a6a8a', '#c49a6a', '#7a3a4a', '#4a3a5a'], def: '#8a5a6a' },
  { id: 'liner', label: ['Kalem', 'Eyeliner'], colors: ['#141012', '#3b2a20', '#1f2f5a', '#2f4f3a', '#6a2a4a'], def: '#141012', styles: [['natural', 'Doğal', 'Natural'], ['thin', 'İnce', 'Thin'], ['wing', 'Kanat', 'Wing']] },
  { id: 'lash', label: ['Kirpik', 'Lashes'], colors: ['#120e0c', '#3b2a20'], def: '#120e0c', styles: [['natural', 'Doğal', 'Natural'], ['volume', 'Hacimli', 'Volume']] },
  { id: 'crease', label: ['Çift kapak', 'Double lid'], colors: [], def: '#463026' },
  { id: 'iris', label: ['Göz rengi', 'Eye color'], colors: ['#3a7bd5', '#4f9fd0', '#5a8a4a', '#8a5a2a', '#c08a3a', '#6a6a7a', '#7a4a9a'], def: '#3a7bd5' },
  { id: 'catch', label: ['Işıltı', 'Catchlight'], colors: [], def: '#ffffff', styles: [['dot', 'Nokta', 'Dot'], ['double', 'Çift', 'Double'], ['window', 'Pencere', 'Window'], ['ring', 'Halka', 'Ring']] },
  { id: 'brow', label: ['Kaş', 'Brows'], colors: ['#4a3426', '#2e221a', '#6a4a32', '#8a6a4a', '#1e1a18'], def: '#4a3426', styles: [['fill', 'Dolgu', 'Fill'], ['powder', 'Pudra', 'Powder'], ['micro', 'Mikro', 'Microblading']] }
]
const FULL_LOOKS: { id: string; label: [string, string]; m: Record<string, [number, string]>; skin?: Record<string, number> }[] = [
  { id: 'gunluk', label: ['Günlük', 'Everyday'], m: { lip: [35, '#c46a5a'], blush: [25, '#f7a5a5'], brow: [25, '#4a3426'] } },
  { id: 'cesur', label: ['Cesur', 'Bold'], m: { lip: [75, '#8e2a3b'], lid: [45, '#6a4a3a'], brow: [45, '#2e221a'] }, skin: { contour: 35 } },
  { id: 'kore', label: ['Işıltılı cilt', 'Glass skin'], m: { lip: [40, '#ff6b81'], blush: [35, '#f2b0c0'] }, skin: { highlight: 45, smooth: 40 } },
  { id: 'gece', label: ['Gece', 'Night out'], m: { lip: [65, '#a83250'], lid: [55, '#4a3a5a'], blush: [25, '#e6738a'], brow: [35, '#2e221a'] } },
  { id: 'seftali', label: ['Şeftali', 'Peachy'], m: { lip: [45, '#d7836a'], blush: [40, '#ff9e7a'], lid: [25, '#c49a6a'] } },
  { id: 'nude', label: ['Ten rengi', 'Nude'], m: { lip: [40, '#c46a5a'], lid: [20, '#b07a5a'], brow: [20, '#6a4a32'] } }
]

function MakeupPanel() {
  const tr = useT()
  const f = useFace()
  const idx = useEditor((s) => s.selectedFace)
  const update = useEditor((s) => s.update)
  const [cat, setCat] = useState('full')
  const def = MAKEUP_CATS.find((c) => c.id === cat)
  const setMark = (k: string, v: number, preset?: string) => update((d) => editFace(d, idx, (x) => void (x.makeup[k] = { preset: preset ?? x.makeup[k]?.preset ?? null, amount: v, color: x.makeup[k]?.color })))
  const cur = def ? f.makeup[def.id] : undefined
  return (
    <>
      <NoFace />
      <Tabs items={[{ id: 'full', label: tr('Tam yüz', 'Full face') }, ...MAKEUP_CATS.map((c) => ({ id: c.id, label: tr(c.label[0], c.label[1]), mod: !!f.makeup[c.id]?.amount })), { id: 'marks', label: tr('Çil ve ben', 'Freckles'), mod: !!(f.makeup.freckle?.amount || f.makeup.mole?.amount || f.makeup.dimple?.amount) }]} value={cat} onChange={setCat} />
      {cat === 'full' ? (
        <div className="presets">
          <Preset label={tr('Yok', 'None')} onClick={() => update((d) => editFace(d, idx, (x) => { for (const k of ['lip', 'blush', 'lid', 'brow']) delete x.makeup[k] }))}>⊘</Preset>
          {FULL_LOOKS.map((l) => (
            <Preset key={l.id} label={tr(l.label[0], l.label[1])} onClick={() => update((d) => editFace(d, idx, (x) => {
              for (const k of ['lip', 'blush', 'lid', 'brow']) delete x.makeup[k]
              for (const [k, [a, c]] of Object.entries(l.m)) x.makeup[k] = { preset: null, amount: a, color: c }
              if (l.skin) Object.assign(x.skin, l.skin)
            }))} bg={`linear-gradient(135deg, ${Object.values(l.m).map((v) => v[1]).join(', ')})`} />
          ))}
        </div>
      ) : cat === 'marks' ? (
        <>
          <Slider label={tr('Çil', 'Freckles')} value={f.makeup.freckle?.amount ?? 0} onChange={(v) => setMark('freckle', v)} />
          <Slider label={tr('Ben', 'Beauty mark')} value={f.makeup.mole?.amount ?? 0} onChange={(v) => setMark('mole', v, f.makeup.mole?.preset ?? 'cheek')} />
          <div className="row wrap" role="group" aria-label={tr('Ben konumu', 'Beauty mark position')} style={{ gap: 6, marginBottom: 8 }}>
            {([['cheek', 'Yanak', 'Cheek'], ['lip', 'Dudak üstü', 'Above lip'], ['chin', 'Çene', 'Chin'], ['eye', 'Göz altı', 'Under eye']] as const).map(([pid, a, b]) => {
              const on = (f.makeup.mole?.preset ?? 'cheek') === pid
              return <button key={pid} className={'btn sm' + (on ? ' primary' : '')} aria-pressed={on} onClick={() => setMark('mole', f.makeup.mole?.amount || 70, pid)}>{tr(a, b)}</button>
            })}
          </div>
          <Slider label={tr('Gamze', 'Dimples')} value={f.makeup.dimple?.amount ?? 0} onChange={(v) => setMark('dimple', v)} />
        </>
      ) : def ? (
        <>
          {def.styles && (
            <div className="row wrap" role="group" aria-label={tr('Stil', 'Style')} style={{ gap: 6, marginBottom: 8 }}>
              {def.styles.map(([sid, a, b]) => {
                const on = (cur?.preset ?? def.styles![0][0]) === sid
                return <button key={sid} className={'btn sm' + (on ? ' primary' : '')} aria-pressed={on} onClick={() => update((d) => editFace(d, idx, (x) => void (x.makeup[def.id] = { preset: sid, amount: x.makeup[def.id]?.amount || 50, color: x.makeup[def.id]?.color ?? def.def })))}>{tr(a, b)}</button>
              })}
            </div>
          )}
          {def.colors.length > 0 && <ColorRow value={cur?.color ?? null} colors={def.colors} onChange={(c) => update((d) => editFace(d, idx, (x) => void (x.makeup[def.id] = { preset: x.makeup[def.id]?.preset ?? def.styles?.[0][0] ?? null, amount: x.makeup[def.id]?.amount || 50, color: c })))} />}
          <Slider label={tr('Yoğunluk', 'Intensity')} value={cur?.amount ?? 0} onChange={(v) => update((d) => editFace(d, idx, (x) => void (x.makeup[def.id] = { preset: x.makeup[def.id]?.preset ?? def.styles?.[0][0] ?? null, amount: v, color: x.makeup[def.id]?.color ?? def.def })))} />
        </>
      ) : null}
      <div className="group-label">{tr('Kontür ve ışık', 'Contour & glow')}</div>
      <Slider label={tr('Kontür', 'Contour')} value={f.skin.contour ?? 0} onChange={(v) => update((d) => editFace(d, idx, (x) => void (x.skin.contour = v)))} />
      <Slider label={tr('Aydınlatıcı', 'Highlighter')} value={f.skin.highlight ?? 0} onChange={(v) => update((d) => editFace(d, idx, (x) => void (x.skin.highlight = v)))} />
    </>
  )
}

// ---------------- Ten tonu ----------------
const TONES = ['#f3d3c0', '#e8b896', '#d9a88a', '#c48a68', '#a06a4a', '#7a4e34', '#f2c2b0', '#e0a070']
function TonePanel() {
  const tr = useT()
  const f = useFace()
  const idx = useEditor((s) => s.selectedFace)
  const update = useEditor((s) => s.update)
  return (
    <>
      <NoFace />
      <p className="note">{tr('Cildi seçtiğin tona doğru yumuşakça kaydırır.', 'Gently shifts skin toward the chosen tone.')}</p>
      <ColorRow value={(f.makeup.tone?.color as string) ?? null} colors={TONES} onChange={(c) => update((d) => editFace(d, idx, (x) => { x.makeup.tone = { preset: null, amount: 0, color: c }; x.skin.tone = x.skin.tone || 50 }))} />
      <Slider label={tr('Yoğunluk', 'Intensity')} value={f.skin.tone ?? 0} onChange={(v) => update((d) => editFace(d, idx, (x) => { x.skin.tone = v; if (!x.makeup.tone) x.makeup.tone = { preset: null, amount: 0, color: '#d9a88a' } }))} />
      <div className="group-label">{tr('Parıltı', 'Glow')}</div>
      <Slider label={tr('Nemli ışıltı', 'Dewy glow')} value={f.skin.highlight ?? 0} onChange={(v) => update((d) => editFace(d, idx, (x) => void (x.skin.highlight = v)))} />
      <Slider label={tr('Mat görünüm', 'Matte')} value={f.skin.pores ?? 0} onChange={(v) => update((d) => editFace(d, idx, (x) => void (x.skin.pores = v)))} />
    </>
  )
}

// ---------------- Saç rengi ----------------
const HAIR = [['#7a3b2e', 'Kestane', 'Chestnut'], ['#2b1b14', 'Koyu kahve', 'Dark brown'], ['#c79a5a', 'Bal köpüğü', 'Honey'], ['#e8d2a0', 'Platin', 'Platinum'], ['#9aa0a8', 'Gümüş', 'Silver'], ['#a03040', 'Bordo', 'Burgundy'], ['#e07a9a', 'Pembe', 'Pink'], ['#6a5ae0', 'Lavanta', 'Lavender'], ['#3a8ac0', 'Mavi', 'Blue'], ['#2e8a5a', 'Zümrüt', 'Emerald'], ['#d0602a', 'Bakır', 'Copper'], ['#111111', 'Siyah', 'Black']] as const
function HairPanel() {
  const tr = useT()
  const hair = useEditor((s) => s.doc.retouch.faces.find((f) => f.index === 0)?.makeup.hair)
  const volume = useEditor((s) => s.doc.retouch.faces.find((f) => f.index === 0)?.shape.hairVolume ?? 0)
  const update = useEditor((s) => s.update)
  return (
    <>
      <p className="note">{tr('Saçı algılayıp yalnızca saçı boyar. Işık ve gölgeler korunur.', 'Detects hair and recolors only the hair, keeping light and shadow.')}</p>
      <div className="presets">
        {HAIR.map(([c, a, b]) => (
          <Preset key={c} label={tr(a, b)} on={hair?.color === c} bg={`linear-gradient(160deg, ${c}, #000)`} onClick={() => update((d) => editFace(d, 0, (x) => void (x.makeup.hair = { preset: null, amount: x.makeup.hair?.amount || 70, color: c })))} />
        ))}
      </div>
      <ColorRow value={hair?.color ?? null} colors={[]} onChange={(c) => update((d) => editFace(d, 0, (x) => void (x.makeup.hair = { preset: null, amount: x.makeup.hair?.amount || 70, color: c })))} />
      <Slider label={tr('Yoğunluk', 'Intensity')} value={hair?.amount ?? 0} onChange={(v) => update((d) => editFace(d, 0, (x) => void (x.makeup.hair = { preset: null, amount: v, color: x.makeup.hair?.color ?? '#7a3b2e' })))} />
      <div className="group-label">{tr('Hacim', 'Volume')}</div>
      <Slider label={tr('Saç hacmi', 'Hair volume')} bipolar value={volume} onChange={(v) => update((d) => editFace(d, 0, (x) => void (x.shape.hairVolume = v)))} />
      <p className="note">{tr('Artı değer saçı kabartır, eksi yatırır. Yüz yerinde kalır.', 'Positive adds volume, negative flattens. The face stays put.')}</p>
    </>
  )
}

// ---------------- Yüz toparlama / dolgun ----------------
const FILL_KEYS: SliderDef[] = [['fillForehead', 'Alın', 'Forehead'], ['fillBrowBone', 'Kaş kemiği', 'Brow bone'], ['fillEyeHollow', 'Göz çukuru', 'Eye hollow'], ['fillTearTrough', 'Gözyaşı oluğu', 'Tear trough'], ['fillAegyo', 'Göz altı kesesi', 'Under-eye roll'], ['fillApple', 'Elmacık', 'Cheek apple'], ['fillCheek', 'Yanak', 'Cheek'], ['fillNoseBase', 'Burun tabanı', 'Nose base']]
const LIFT_KEYS: SliderDef[] = [['liftContour', 'Kontur', 'Contour'], ['liftForehead', 'Alın', 'Forehead'], ['liftEyes', 'Gözler', 'Eyes'], ['liftMid', 'Orta yüz', 'Mid-face'], ['liftMouth', 'Ağız köşeleri', 'Mouth corners']]
function LiftPanel() {
  const tr = useT()
  const f = useFace()
  const idx = useEditor((s) => s.selectedFace)
  const update = useEditor((s) => s.update)
  const sh = (k: string, v: number) => update((d) => editFace(d, idx, (x) => void (x.shape[k] = v)))
  const sk = (k: string, v: number) => update((d) => editFace(d, idx, (x) => void (x.skin[k] = v)))
  return (
    <>
      <NoFace />
      <button className="btn sm primary" onClick={() => update((d) => editFace(d, idx, (x) => { Object.assign(x.skin, { undereye: 50, wrinkle: 40 }); Object.assign(x.shape, { cheekbone: 15, vshape: 20, browHigh: 10, liftContour: 35, liftEyes: 25, liftMouth: 20 }) }))}><Sparkles size={14} /> {tr('Oto', 'Auto')}</button>
      <Slider label={tr('Göz altı torbası', 'Under-eye bags')} value={f.skin.undereye ?? 0} onChange={(v) => sk('undereye', v)} />
      <Slider label={tr('Yanak kaldır', 'Cheek lift')} value={f.shape.cheekbone ?? 0} bipolar onChange={(v) => sh('cheekbone', v)} />
      <Slider label={tr('Kaş kaldır', 'Brow lift')} value={f.shape.browHigh ?? 0} bipolar onChange={(v) => sh('browHigh', v)} />
      <Slider label={tr('Yüz hattı', 'Contour line')} value={f.shape.vshape ?? 0} bipolar onChange={(v) => sh('vshape', v)} />
      <Slider label={tr('Kırışıklık', 'Wrinkles')} value={f.skin.wrinkle ?? 0} onChange={(v) => sk('wrinkle', v)} />
      <div className="group-label">{tr('Gerdirme', 'Lifting')}</div>
      {LIFT_KEYS.map(([k, a, b]) => <Slider key={k} label={tr(a, b)} value={f.shape[k] ?? 0} onChange={(v) => sh(k, v)} />)}
      <div className="group-label">{tr('Dolgunluk', 'Fullness')}</div>
      <Slider label={tr('Dolgun ışık', 'Plump glow')} value={f.skin.plumpLight ?? 0} onChange={(v) => sk('plumpLight', v)} />
      <Slider label={tr('Yanak dolgunluğu', 'Cheek fullness')} value={-(f.shape.width ?? 0)} bipolar onChange={(v) => sh('width', -v)} />
      {FILL_KEYS.map(([k, a, b]) => <Slider key={k} label={tr(a, b)} value={f.shape[k] ?? 0} onChange={(v) => sh(k, v)} />)}
      <Slider label={tr('Dudak', 'Lips')} value={f.shape.plump ?? 0} bipolar onChange={(v) => sh('plump', v)} />
    </>
  )
}

// ---------------- Raster önizleme yardımcıları ----------------
function ImageOverlay({ view, canvas, version }: { view: View; canvas: HTMLCanvasElement | null; version: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !canvas) return
    c.width = canvas.width
    c.height = canvas.height
    c.getContext('2d')!.drawImage(canvas, 0, 0)
  }, [canvas, version])
  if (!canvas) return null
  const tl = view.toScreen(0, 0)
  return <canvas ref={ref} style={{ position: 'absolute', left: tl.x, top: tl.y, width: view.size.w, height: view.size.h, pointerEvents: 'none' }} />
}

function RasterFooter({ onApply, disabled }: { onApply: () => Promise<void>; disabled?: boolean }) {
  const tr = useT()
  return (
    <ToolFoot>
      <button className="btn ghost" style={{ flex: 1 }} onClick={() => useEditor.getState().closeTool(false)}>{tr('İptal', 'Cancel')}</button>
      <button className="btn primary" style={{ flex: 1 }} disabled={disabled} onClick={async () => {
        const st = useEditor.getState()
        try {
          st.setBusy({ text: tr('Uygulanıyor…', 'Applying…') })
          await onApply()
          useEditor.getState().closeTool(true)
        } catch (e) {
          console.error(e)
          st.toast('error', String((e as Error).message))
        } finally {
          useEditor.getState().setBusy(null)
        }
      }}>{tr('Uygula', 'Apply')}</button>
    </ToolFoot>
  )
}

// ---------------- Rötuş fırçası ----------------
const brushStore: { mask: PaintMask | null; preview: HTMLCanvasElement | null; v: number; mode: string; strength: number; size: number } = { mask: null, preview: null, v: 0, mode: 'smooth', strength: 70, size: 0.05 }
const brushListeners = new Set<() => void>()
const brushEmit = () => brushListeners.forEach((f) => f())
function useBrushStore() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    brushListeners.add(h)
    return () => void brushListeners.delete(h)
  }, [])
  return brushStore
}

function processBrush(src: CanvasImageSource & { width: number; height: number }, mask: HTMLCanvasElement, mode: string, strength: number): HTMLCanvasElement {
  const W = src.width, H = src.height
  const out = toCanvas(src)
  const ctx = out.getContext('2d')!
  const fx = document.createElement('canvas')
  fx.width = W
  fx.height = H
  const fctx = fx.getContext('2d')!
  const r = Math.max(W, H)
  if (mode === 'smooth' || mode === 'wrinkle') fctx.filter = `blur(${r * (mode === 'smooth' ? 0.006 : 0.004)}px)`
  else if (mode === 'conceal' || mode === 'repair') fctx.filter = `blur(${r * 0.012}px)`
  else if (mode === 'fade') fctx.filter = `blur(${r * 0.003}px) brightness(1.12) saturate(0.85)`
  else if (mode === 'brighten') fctx.filter = 'brightness(1.18) saturate(0.95)'
  else if (mode === 'detail') fctx.filter = 'contrast(1.25) saturate(1.1)'
  fctx.drawImage(src, 0, 0, W, H)
  fctx.filter = 'none'
  // maskeyle kes
  const m = document.createElement('canvas')
  m.width = W
  m.height = H
  const mctx = m.getContext('2d')!
  mctx.filter = `blur(${r * 0.002}px)`
  mctx.drawImage(mask, 0, 0, W, H)
  fctx.globalCompositeOperation = 'destination-in'
  fctx.globalAlpha = strength / 100
  fctx.drawImage(m, 0, 0)
  ctx.drawImage(fx, 0, 0)
  return out
}

function RetouchBrushPanel() {
  const tr = useT()
  const b = useBrushStore()
  useEffect(() => {
    const pv = session.preview
    if (pv) brushStore.mask = new PaintMask(pv.width, pv.height)
    brushStore.preview = null
    brushStore.v++
    brushEmit()
    return () => {
      brushStore.mask = null
      brushStore.preview = null
    }
  }, [])
  const modes: [string, string, string][] = [['smooth', 'Pürüzsüzleştir', 'Smooth'], ['conceal', 'Kapatıcı', 'Concealer'], ['repair', 'Onarma', 'Repair'], ['fade', 'Soluklaştır', 'Fade'], ['wrinkle', 'Kırışıklık', 'Wrinkles'], ['brighten', 'Aydınlat', 'Brighten'], ['detail', 'Ayrıntı', 'Detail']]
  const recompute = () => {
    if (!session.preview || !brushStore.mask) return
    brushStore.preview = processBrush(session.preview, brushStore.mask.toGray(), brushStore.mode, brushStore.strength)
    brushStore.v++
    brushEmit()
  }
  return (
    <>
      <p className="note">{tr('Düzeltmek istediğin bölgenin üzerine boya. Boyadığın yer anında işlenir.', 'Paint over the area you want to fix. It is processed as you paint.')}</p>
      <div className="presets">
        {modes.map(([id, a, c]) => (
          <button key={id} className={'btn sm' + (b.mode === id ? ' primary' : '')} onClick={() => { brushStore.mode = id; recompute() }}>{tr(a, c)}</button>
        ))}
      </div>
      <Slider plain label={tr('Fırça boyutu', 'Brush size')} min={1} max={25} value={Math.round(b.size * 100)} onChange={(v) => { brushStore.size = v / 100; brushEmit() }} />
      <Slider plain label={tr('Yoğunluk', 'Strength')} value={b.strength} onChange={(v) => { brushStore.strength = v; brushEmit() }} onCommit={recompute} />
      <button className="btn ghost sm block" onClick={() => { brushStore.mask?.clear(); brushStore.preview = null; brushStore.v++; brushEmit() }}>{tr('Temizle', 'Clear')}</button>
      <RasterFooter onApply={async () => {
        if (!brushStore.mask || brushStore.mask.isEmpty()) return
        const full = await session.fullBase()
        const out = processBrush(full, brushStore.mask.toGray(), brushStore.mode, brushStore.strength)
        full.close()
        await commitRaster(out, 'paint', { mode: brushStore.mode })
      }} />
    </>
  )
}
function RetouchBrushOverlay({ view }: { view: View }) {
  const b = useBrushStore()
  const brush: BrushState = { size: b.size, hardness: 0.4, erase: false }
  return (
    <>
      <ImageOverlay view={view} canvas={b.preview} version={b.v} />
      <BrushOverlay view={view} brush={brush} mask={b.mask} tint="rgba(255,181,71,0.18)" version={b.v} onEnd={() => {
        if (!session.preview || !b.mask) return
        brushStore.preview = processBrush(session.preview, b.mask.toGray(), b.mode, b.strength)
        brushStore.v++
        brushEmit()
      }} />
    </>
  )
}

// ---------------- Yüz gizleme ----------------
const HIDE: { id: string; label: [string, string]; emoji?: string }[] = [
  { id: 'blur', label: ['Bulanık', 'Blur'] }, { id: 'pixel', label: ['Piksel', 'Pixelate'] }, { id: 'bar', label: ['Sansür bandı', 'Censor bar'] },
  { id: 'e1', label: ['Gülen', 'Smile'], emoji: '😊' }, { id: 'e2', label: ['Havalı', 'Cool'], emoji: '😎' }, { id: 'e3', label: ['Kalp', 'Heart'], emoji: '🫶' },
  { id: 'e4', label: ['Yıldız', 'Star'], emoji: '⭐' }, { id: 'e5', label: ['Kedi', 'Cat'], emoji: '🐱' }, { id: 'e6', label: ['Çiçek', 'Flower'], emoji: '🌸' }
]
async function hideFaces(style: string, faces: number[]) {
  const geos = session.faceGeos(1, 1)
  const st = useEditor.getState()
  const h = HIDE.find((x) => x.id === style)!
  if (h.emoji) {
    st.commit((d) => {
      for (const i of faces) {
        const g = geos[i]
        if (!g) continue
        const c = g.center
        d.layers.push({ id: crypto.randomUUID(), type: 'sticker', x: c.x, y: c.y, scale: 1, rotation: 0, opacity: 1, props: { kind: 'emoji', value: h.emoji!, size: Math.max(0.05, (g.width * session.W * 1.3) / Math.min(session.W, session.H)) } })
      }
    })
    return
  }
  const full = await session.fullBase()
  const W = full.width, H = full.height
  const out = toCanvas(full)
  const ctx = out.getContext('2d')!
  for (const i of faces) {
    const g = geos[i]
    if (!g) continue
    const xs = OVAL.map((k) => g.p(k).x * W), ys = OVAL.map((k) => g.p(k).y * H)
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    if (style === 'bar') {
      const ey = (g.p(159).y + g.p(386).y) / 2 * H
      ctx.fillStyle = '#000'
      ctx.fillRect(x0 - (x1 - x0) * 0.08, ey - (y1 - y0) * 0.09, (x1 - x0) * 1.16, (y1 - y0) * 0.18)
      continue
    }
    ctx.save()
    ctx.beginPath()
    OVAL.forEach((k, n) => (n ? ctx.lineTo(g.p(k).x * W, g.p(k).y * H) : ctx.moveTo(g.p(k).x * W, g.p(k).y * H)))
    ctx.closePath()
    ctx.clip()
    if (style === 'blur') {
      ctx.filter = `blur(${(x1 - x0) * 0.08}px)`
      ctx.drawImage(full, 0, 0)
    } else {
      const cell = Math.max(4, (x1 - x0) / 12)
      const small = toCanvas(full, W / cell, H / cell)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(small, 0, 0, W, H)
    }
    ctx.restore()
  }
  full.close()
  await commitRaster(out, 'mosaic', { style })
}
function FaceHidePanel() {
  const tr = useT()
  const n = useFaceCount()
  const sel = useEditor((s) => s.selectedFace)
  const [all, setAll] = useState(true)
  return (
    <>
      <NoFace />
      <p className="note">{tr('Yüzleri gizlilik için bulanıklaştır, pikselle ya da çıkartmayla kapat.', 'Hide faces for privacy with blur, pixels or a sticker.')}</p>
      {n > 1 && <Segmented items={[{ id: 'all', label: tr('Tüm yüzler', 'All faces') }, { id: 'one', label: tr('Seçili yüz', 'Selected face') }]} value={all ? 'all' : 'one'} onChange={(v) => setAll(v === 'all')} />}
      <div className="presets">
        {HIDE.map((h) => (
          <Preset key={h.id} label={tr(h.label[0], h.label[1])} onClick={async () => {
            const st = useEditor.getState()
            st.setBusy({ text: tr('Uygulanıyor…', 'Applying…') })
            try {
              await hideFaces(h.id, all ? Array.from({ length: n }, (_, i) => i) : [sel])
            } finally {
              st.setBusy(null)
            }
          }}>{h.emoji ? <span className="preset-glyph">{h.emoji}</span> : <span className={'hide-glyph ' + h.id} aria-hidden />}</Preset>
        ))}
      </div>
    </>
  )
}

// ---------------- Vücut ----------------
const BODY_KEYS: SliderDef[] = [['slim', 'İnce', 'Slim'], ['waist', 'Bel', 'Waist'], ['hips', 'Kalça', 'Hips'], ['chest', 'Göğüs', 'Chest'], ['shoulders', 'Omuz', 'Shoulders'], ['arms', 'Kollar', 'Arms'], ['thighs', 'Bacak kalınlığı', 'Thighs'], ['legs', 'Bacak uzat', 'Longer legs'], ['head', 'Baş', 'Head'], ['neck', 'Boyun', 'Neck']]
const BODY_PRESET_NAMES: Record<string, [string, string]> = { classic: ['Klasik', 'Classic'], natural: ['Doğal', 'Natural'], slender: ['Narin', 'Slender'], hourglass: ['Kum saati', 'Hourglass'], athletic: ['Atletik', 'Athletic'], golden: ['Altın oran', 'Golden ratio'], headShoulder: ['Baş-omuz', 'Head-shoulder'], legTorso: ['Bacak-gövde', 'Leg-torso'] }
const bodyStore = { mode: 'auto' as 'auto' | 'manual' }
/** Kişi maskesi (tam çözünürlük, R = 0..255), isteğe bağlı genişletme (px). */
function personMask(W: number, H: number, grow = 0): ImageData | null {
  const seg = session.seg
  if (!seg) return null
  const small = new ImageData(seg.w, seg.h)
  for (let i = 0; i < seg.w * seg.h; i++) {
    const v = Math.round((1 - seg.background[i]) * 255)
    small.data[i * 4] = small.data[i * 4 + 1] = small.data[i * 4 + 2] = v
    small.data[i * 4 + 3] = 255
  }
  const sc = document.createElement('canvas')
  sc.width = seg.w
  sc.height = seg.h
  sc.getContext('2d')!.putImageData(small, 0, 0)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(sc, 0, 0, W, H)
  const d = ctx.getImageData(0, 0, W, H)
  // eşik: yumuşak kenar 0,35..0,65
  for (let i = 0; i < W * H; i++) {
    const t = Math.min(1, Math.max(0, (d.data[i * 4] / 255 - 0.35) / 0.3))
    d.data[i * 4] = d.data[i * 4 + 1] = d.data[i * 4 + 2] = Math.round(t * 255)
  }
  if (grow > 0) {
    ctx.putImageData(d, 0, 0)
    ctx.filter = `blur(${grow}px)`
    ctx.drawImage(c, 0, 0)
    ctx.filter = 'none'
    const g = ctx.getImageData(0, 0, W, H)
    for (let i = 0; i < W * H; i++) { const v = g.data[i * 4] > 10 ? 255 : 0; g.data[i * 4] = g.data[i * 4 + 1] = g.data[i * 4 + 2] = v }
    return g
  }
  return d
}

/**
 * Korumalı vücut ayarlarını fotoğrafa işle (Ar-Ge 2, aday 2 ve 4).
 * Yalnız inceltme: açılan şerit karo karo LaMa ile doldurulur.
 * Bacak uzatma da varsa katman yöntemi: kişi çıkarılıp arka plan LaMa ile tamamlanır (plaka),
 * kişi tam alanla bükülüp bükülmüş maskesiyle plakanın üstüne konur. Zemin ve arka plan yerinde kalır.
 */
export async function fillBodyGap() {
  const st = useEditor.getState()
  const tr = (a: string, b: string) => (st.settings.language === 'tr' ? a : b)
  const doc = st.doc
  const fail = tr('Onarım modeli (LaMa) yüklenemedi', 'Inpainting model (LaMa) could not be loaded')
  return busy(tr('Boşluk dolduruluyor…', 'Filling the gap…'), async () => {
    const layered = !!doc.body?.protect && !!doc.body.shape.legs
    const field = session.bodyField(doc, undefined, undefined, layered)
    if (!field) throw new Error(tr('Vücut algılanamadı', 'No body detected'))
    const gw = 192, gh = Math.max(16, Math.round((192 * session.H) / session.W))
    const full = await session.fullBase()
    const c = toCanvas(full)
    full.close()
    const W = c.width, H = c.height
    const src = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H)
    const { img, gap, gapCount } = bakeBodyWarp(src, field, gw, gh, session.seg)
    const warped = document.createElement('canvas')
    warped.width = W
    warped.height = H
    warped.getContext('2d')!.putImageData(img, 0, 0)
    let result: HTMLCanvasElement = warped
    let filledPx = gapCount
    if (layered) {
      const pm = personMask(W, H, Math.max(4, Math.round(Math.max(W, H) * 0.006)))
      const pmSoft = personMask(W, H)
      if (!pm || !pmSoft) throw new Error(tr('Kişi bölütlenemedi', 'Person segmentation failed'))
      const plate = toCanvas(c)
      if (!(await inpaintTiles(plate, pm))) throw new Error(fail)
      const wm = bakeBodyWarp(pmSoft, field, gw, gh, null).img
      const pd = plate.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H)
      const od = img.data, md = wm.data, bd = pd.data
      filledPx = 0
      for (let i = 0; i < W * H; i++) {
        const a = md[i * 4] / 255
        if (a < 1 && pmSoft.data[i * 4] > 127) filledPx++
        for (let k = 0; k < 3; k++) bd[i * 4 + k] = bd[i * 4 + k] * (1 - a) + od[i * 4 + k] * a
      }
      plate.getContext('2d')!.putImageData(pd, 0, 0)
      result = plate
    } else if (gapCount > 0 && !(await inpaintTiles(warped, gap))) throw new Error(fail)
    await commitRaster(result, 'inpaint', { tool: 'body-protect', gap: filledPx, layered }, (d) => {
      // bacak uzatma tuvalde yapılıyorsa fotoğrafa işlenmedi; ayar olarak kalsın
      const legs = !layered && session.legCanvas(d) ? d.body?.shape.legs : undefined
      d.body = d.body?.manual || legs ? { shape: legs ? { legs } : {}, manual: d.body?.manual ?? null } : null
    })
    return filledPx
  })
}

/** Çocuk görünen kişide vücut aracı kapalı (MinorGate). */
function GatedBodyPanel() {
  return <MinorGate><BodyPanel /></MinorGate>
}

function BodyPanel() {
  const tr = useT()
  const body = useEditor((s) => s.doc.body)
  const update = useEditor((s) => s.update)
  const [mode, setMode] = useState(bodyStore.mode)
  const shape = body?.shape ?? {}
  const setShape = (vals: Record<string, number>, replace = false) => update((d) => {
    d.body = d.body ?? { shape: {}, manual: null }
    d.body.shape = replace ? { ...vals } : { ...d.body.shape, ...vals }
  })
  const man = body?.manual ?? { y0: 0.45, y1: 0.75, stretch: 0, slim: 0 }
  const setMan = (p: Partial<typeof man>) => update((d) => {
    d.body = d.body ?? { shape: {}, manual: null }
    d.body.manual = { ...man, ...p }
  })
  return (
    <>
      <Segmented items={[{ id: 'auto', label: tr('Otomatik', 'Automatic') }, { id: 'manual', label: tr('Elle', 'Manual') }]} value={mode} onChange={(v) => { bodyStore.mode = v; setMode(v) }} />
      {mode === 'auto' ? (
        <>
          {!session.pose && <div className="note">{tr('Vücut algılanamadıysa Elle sekmesini kullan.', 'If no body is detected, use the Manual tab.')}</div>}
          <div className="group-label">{tr('Hazır oranlar', 'Presets')}</div>
          <div className="presets">
            {Object.keys(BODY_PRESETS).map((k) => (
              <button key={k} className="btn sm" onClick={() => setShape(BODY_PRESETS[k], true)}>{tr(BODY_PRESET_NAMES[k][0], BODY_PRESET_NAMES[k][1])}</button>
            ))}
          </div>
          {BODY_KEYS.map(([k, a, b]) => (
            <Slider key={k} label={tr(a, b)} bipolar value={shape[k] ?? 0} onChange={(v) => setShape({ [k]: v })} />
          ))}
          <div className="setting">
            <div><b>{tr('Arka planı koru', 'Protect background')}</b><span>{tr('İncelt, bel ve kalça yalnızca kişiye uygulanır; bacak uzatmada arka plan YZ doldurmayla korunur', 'Slim, waist and hips only affect the person; for leg length the background is kept by the AI fill')}</span></div>
            <Switch label={tr('Arka planı koru', 'Protect background')} on={!!body?.protect} onChange={(v) => update((d) => {
              d.body = d.body ?? { shape: {}, manual: null }
              d.body.protect = v || undefined
            })} />
          </div>
          {body?.protect && ['slim', 'waist', 'hips', 'legs'].some((k) => (shape[k] ?? 0) !== 0) && (
            <>
              <p className="note">{tr('İncelme ya da bacak uzatma kişinin kenarında boşluk bırakır. Yapay zekâ bu boşluğu arka planla doldurur; vücut ayarları fotoğrafa işlenir.', 'Slimming leaves a thin strip at the edge. AI fills it with background; the body edits are baked into the photo.')}</p>
              <button className="btn block" onClick={() => void fillBodyGap()}>{tr('Boşluğu YZ ile doldur ve uygula', 'Fill gap with AI and apply')}</button>
            </>
          )}
        </>
      ) : (
        <>
          <p className="note">{tr('Tuvaldeki iki çizgiyi sürükleyerek bölgeyi seç, sonra uzat ya da incelt.', 'Drag the two lines on the canvas to pick a region, then stretch or slim it.')}</p>
          <Slider label={tr('Uzat', 'Stretch')} bipolar value={man.stretch} onChange={(v) => setMan({ stretch: v })} />
          <Slider label={tr('İncelt', 'Slim')} bipolar value={man.slim} onChange={(v) => setMan({ slim: v })} />
        </>
      )}
    </>
  )
}
function BodyOverlay({ view }: { view: View }) {
  const body = useEditor((s) => s.doc.body)
  const update = useEditor((s) => s.update)
  const [mode, setMode] = useState(bodyStore.mode)
  useEffect(() => {
    const t = setInterval(() => setMode(bodyStore.mode), 200)
    return () => clearInterval(t)
  }, [])
  if (mode !== 'manual') return null
  const man = body?.manual ?? { y0: 0.45, y1: 0.75, stretch: 0, slim: 0 }
  const line = (key: 'y0' | 'y1') => {
    const p = view.toScreen(0, man[key])
    const q = view.toScreen(1, man[key])
    return (
      <div
        key={key}
        style={{ position: 'absolute', left: p.x, top: p.y - 8, width: q.x - p.x, height: 16, cursor: 'ns-resize' }}
        onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => {
          if (!(e.buttons & 1)) return
          const n = view.toNorm(e.clientX, e.clientY)
          update((d) => {
            d.body = d.body ?? { shape: {}, manual: null }
            d.body.manual = { ...man, [key]: Math.min(1, Math.max(0, n.y)) }
          })
        }}
      >
        <div style={{ position: 'absolute', top: 7, left: 0, right: 0, height: 2, background: 'var(--c-accent)' }} />
      </div>
    )
  }
  const a = view.toScreen(0, Math.min(man.y0, man.y1)), b = view.toScreen(1, Math.max(man.y0, man.y1))
  return (
    <>
      <div style={{ position: 'absolute', left: a.x, top: a.y, width: b.x - a.x, height: b.y - a.y, background: 'rgba(255,181,71,.12)', pointerEvents: 'none' }} />
      {line('y0')}
      {line('y1')}
    </>
  )
}

// ---------------- Yeniden ışıklandırma ----------------
const LIGHTS: { id: string; label: [string, string]; color: string; amb: number }[] = [
  { id: 'soft', label: ['Yumuşak', 'Soft'], color: '#fff4e6', amb: 0.25 },
  { id: 'morning', label: ['Sabah güneşi', 'Morning sun'], color: '#ffd59a', amb: 0.3 },
  { id: 'golden', label: ['Altın saat', 'Golden hour'], color: '#ffb35a', amb: 0.4 },
  { id: 'studio', label: ['Stüdyo', 'Studio'], color: '#ffffff', amb: 0.45 },
  { id: 'neonpink', label: ['Neon pembe', 'Neon pink'], color: '#ff5fb0', amb: 0.45 },
  { id: 'cyan', label: ['Camgöbeği', 'Cyan'], color: '#4fd8ff', amb: 0.45 },
  { id: 'moon', label: ['Ay ışığı', 'Moonlight'], color: '#9ab8ff', amb: 0.5 },
  { id: 'fire', label: ['Ateş', 'Firelight'], color: '#ff7a2a', amb: 0.5 }
]
const relight = { depth: null as HTMLCanvasElement | null, key: '', light: { x: 0.3, y: 0.3 }, preset: 'soft', amount: 70, preview: null as HTMLCanvasElement | null, v: 0 }
const relightL = new Set<() => void>()
const relightEmit = () => relightL.forEach((f) => f())
function useRelight() {
  const [, f] = useState(0)
  useEffect(() => {
    const h = () => f((x) => x + 1)
    relightL.add(h)
    return () => void relightL.delete(h)
  }, [])
  return relight
}

function computeRelight(src: CanvasImageSource & { width: number; height: number }, depth: HTMLCanvasElement, maxSide: number) {
  const s = Math.min(1, maxSide / Math.max(src.width, src.height))
  const W = Math.max(1, Math.round(src.width * s)), H = Math.max(1, Math.round(src.height * s))
  const img = toCanvas(src, W, H)
  const ictx = img.getContext('2d', { willReadFrequently: true })!
  const id = ictx.getImageData(0, 0, W, H)
  const dC = toCanvas(depth, W, H)
  const dctx = dC.getContext('2d', { willReadFrequently: true })!
  dctx.filter = 'blur(2px)'
  dctx.drawImage(dC, 0, 0)
  const dd = dctx.getImageData(0, 0, W, H).data
  const L = LIGHTS.find((l) => l.id === relight.preset)!
  const n = parseInt(L.color.slice(1), 16)
  const lr = ((n >> 16) & 255) / 255, lg = ((n >> 8) & 255) / 255, lb = (n & 255) / 255
  const amt = relight.amount / 100
  const lx = relight.light.x * W, ly = relight.light.y * H
  const k = 6 * Math.max(W, H) / 1000
  const d = id.data
  const D = (x: number, y: number) => dd[(Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4] / 255
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const dz = D(x, y)
      const nx = -(D(x + 2, y) - D(x - 2, y)) * k * 10
      const ny = -(D(x, y + 2) - D(x, y - 2)) * k * 10
      const nl = Math.hypot(nx, ny, 1)
      let vx = lx - x, vy = ly - y
      const dist = Math.hypot(vx, vy) / Math.max(W, H)
      const vz = 0.35 * Math.max(W, H)
      const vl = Math.hypot(vx, vy, vz)
      vx /= vl; vy /= vl
      const ndl = Math.max(0, (nx * vx + ny * vy + vz / vl) / nl)
      const fall = 1 / (1 + dist * dist * 6)
      const near = 0.35 + dz * 0.65
      const sh = ndl * fall * near
      const dim = 1 - amt * L.amb
      d[i] = Math.min(255, d[i] * (dim + sh * amt * lr * 1.25))
      d[i + 1] = Math.min(255, d[i + 1] * (dim + sh * amt * lg * 1.25))
      d[i + 2] = Math.min(255, d[i + 2] * (dim + sh * amt * lb * 1.25))
    }
  }
  ictx.putImageData(id, 0, 0)
  return img
}

let relightTimer = 0
function scheduleRelight() {
  clearTimeout(relightTimer)
  relightTimer = window.setTimeout(() => {
    if (!session.preview || !relight.depth) return
    relight.preview = computeRelight(session.preview, relight.depth, 900)
    relight.v++
    relightEmit()
  }, 30)
}

function RelightPanel() {
  const tr = useT()
  const r = useRelight()
  useEffect(() => {
    ;(async () => {
      if (relight.key !== session.baseKey || !relight.depth) {
        const st = useEditor.getState()
        st.setBusy({ text: tr('Derinlik hesaplanıyor…', 'Estimating depth…') })
        try {
          relight.depth = session.preview ? await depthMap(session.preview) : null
          relight.key = session.baseKey
        } catch (e) {
          st.toast('error', String((e as Error).message))
        } finally {
          useEditor.getState().setBusy(null)
        }
      }
      scheduleRelight()
    })()
    return () => {
      relight.preview = null
    }
  }, [])
  return (
    <>
      <p className="note">{tr('Tuvaldeki ışık noktasını sürükle. Derinlik yapay zekâyla bilgisayarında hesaplanır.', 'Drag the light point on the canvas. Depth is estimated by AI on your computer.')}</p>
      <div className="presets">
        {LIGHTS.map((l) => (
          <Preset key={l.id} label={tr(l.label[0], l.label[1])} on={r.preset === l.id} bg={`radial-gradient(circle at 30% 30%, ${l.color}, #111 75%)`} onClick={() => { relight.preset = l.id; scheduleRelight(); relightEmit() }} />
        ))}
      </div>
      <Slider plain label={tr('Yoğunluk', 'Intensity')} value={r.amount} onChange={(v) => { relight.amount = v; scheduleRelight(); relightEmit() }} />
      <RasterFooter disabled={!r.depth} onApply={async () => {
        if (!relight.depth) return
        const full = await session.fullBase()
        const out = computeRelight(full, relight.depth, 8192)
        full.close()
        await commitRaster(out, 'style', { relight: relight.preset })
      }} />
    </>
  )
}
function RelightOverlay({ view }: { view: View }) {
  const r = useRelight()
  const p = view.toScreen(r.light.x, r.light.y)
  return (
    <>
      <ImageOverlay view={view} canvas={r.preview} version={r.v} />
      <div
        style={{ position: 'absolute', left: p.x - 18, top: p.y - 18, width: 36, height: 36, borderRadius: '50%', border: '2px solid #fff', background: 'radial-gradient(circle, rgba(255,240,200,.9), rgba(255,200,120,.2))', cursor: 'grab', boxShadow: '0 0 20px rgba(255,220,150,.8)' }}
        onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => {
          if (!(e.buttons & 1)) return
          const n = view.toNorm(e.clientX, e.clientY)
          relight.light = { x: Math.min(1.2, Math.max(-0.2, n.x)), y: Math.min(1.2, Math.max(-0.2, n.y)) }
          relightEmit()
          scheduleRelight()
        }}
        role="slider"
        aria-label="Işık konumu"
      />
    </>
  )
}

// ---------------- kayıt ----------------
const has = (d: EditDoc, fn: (f: EditDoc['retouch']['faces'][number]) => boolean) => d.retouch.faces.some(fn)
const nz = (o: Record<string, unknown>) => Object.values(o).some((v) => v)

export const RETOUCH_TOOLS: ToolDef[] = [
  { id: 'beauty', label: ['Tek dokunuş', 'One-tap'], icon: Wand, Panel: BeautyPanel, Overlay: FaceOverlay, sourceSpace: true, needs: ['faces'] },
  { id: 'faceShape', label: ['Yüz', 'Face'], icon: ScanFace, Panel: FaceShapePanel, Overlay: FaceOverlay, sourceSpace: true, needs: ['faces'], applied: (d) => has(d, (f) => nz(f.shape)), sliders: SHAPE_TABS.flatMap((t) => t.keys.map(([, a, b]) => ({ label: [a, b] as [string, string], sub: t.id }))), selectSub: selectShapeTab },
  { id: 'skin', label: ['Cilt', 'Skin'], icon: Droplet, Panel: SkinPanel, Overlay: SkinOverlay, sourceSpace: true, needs: ['faces', 'seg'], applied: (d) => has(d, (f) => nz(f.skin)), sliders: [...SKIN_KEYS.map(([, a, b]) => ({ label: [a, b] as [string, string] })), { label: ['İşaretleri koru', 'Protect marks'] }] },
  { id: 'makeup', label: ['Makyaj', 'Makeup'], icon: Palette, Panel: MakeupPanel, Overlay: FaceOverlay, sourceSpace: true, needs: ['faces', 'seg'], applied: (d) => has(d, (f) => ['lip', 'blush', 'lid', 'brow'].some((k) => f.makeup[k]?.amount)) },
  { id: 'lift', label: ['Toparla', 'Lift'], icon: Shell, Panel: LiftPanel, Overlay: FaceOverlay, sourceSpace: true, needs: ['faces', 'seg'], sliders: [...LIFT_KEYS, ...FILL_KEYS].map(([, a, b]) => ({ label: [a, b] as [string, string] })) },
  { id: 'tone', label: ['Ten tonu', 'Skin tone'], icon: Gem, Panel: TonePanel, Overlay: FaceOverlay, sourceSpace: true, needs: ['faces', 'seg'] },
  { id: 'hair', label: ['Saç', 'Hair'], icon: Scissors, Panel: HairPanel, sourceSpace: true, needs: ['faces', 'seg'], sliders: [{ label: ['Saç hacmi', 'Hair volume'] }], applied: (d) => !!d.retouch.faces.find((f) => f.index === 0)?.makeup.hair?.amount },
  { id: 'rbrush', label: ['Rötuş fırçası', 'Retouch brush'], icon: Brush, Panel: RetouchBrushPanel, Overlay: RetouchBrushOverlay, sourceSpace: true, noFooter: true },
  { id: 'relight', label: ['Işıklandır', 'Relight'], icon: Sun, Panel: RelightPanel, Overlay: RelightOverlay, sourceSpace: true, noFooter: true },
  { id: 'body', label: ['Vücut', 'Body'], icon: PersonStanding, Panel: GatedBodyPanel, Overlay: BodyOverlay, sourceSpace: true, needs: ['pose', 'seg'], applied: (d) => !!d.body && (nz(d.body.shape) || !!d.body.manual?.stretch || !!d.body.manual?.slim), sliders: [...BODY_KEYS.map(([, a, b]) => ({ label: [a, b] as [string, string] })), { label: ['Arka planı koru', 'Protect background'] }] },
  PHYSIQUE_TOOL,
  { id: 'facehide', label: ['Yüz gizle', 'Hide face'], icon: EyeOff, Panel: FaceHidePanel, Overlay: FaceOverlay, sourceSpace: true, needs: ['faces'], noFooter: true },
  AGEFACE_TOOL
]

