// Işıl belge şeması. Main ve renderer ortak kullanır.

export const ADJUST_KEYS = [
  'exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'whites', 'blacks',
  'temperature', 'tint', 'saturation', 'vibrance', 'brilliance',
  'clarity', 'sharpen', 'structure', 'dehaze', 'fade', 'grain', 'vignette', 'glow'
] as const
export type AdjustKey = (typeof ADJUST_KEYS)[number]
export type Adjust = Record<AdjustKey, number> // -100..100 (tek yönlüler 0..100)

export const HUE_BANDS = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'] as const
export type HueBand = (typeof HUE_BANDS)[number]
export type HSL = Record<HueBand, { h: number; s: number; l: number }>

export type CurvePoint = [number, number] // 0..1
export interface Curves { rgb: CurvePoint[]; r: CurvePoint[]; g: CurvePoint[]; b: CurvePoint[] }

export interface Crop {
  x: number; y: number; w: number; h: number // kaynak uzayında, 0..1
  rotation: number // derece, -45..45 ince + 90'ın katları
  quarter: number // 0..3 (90° dönüş sayısı)
  flipH: boolean; flipV: boolean
  perspH: number; perspV: number // -100..100
  ratio: string | null
}

export interface FaceEdit {
  index: number
  side: 'both' | 'left' | 'right'
  shape: Record<string, number>   // yüz/göz/burun/kaş/dudak/oran kaydırıcıları, -100..100
  skin: Record<string, number>    // pürüzsüz, leke, göz altı, beyazlat, diş …  0..100
  makeup: Record<string, { preset: string | null; amount: number; color?: string }>
  /** "İşaretleri koru" fırçası: dövme/ben/hızma; leke, yumuşatma, kırışık ve ten burada uygulanmaz. */
  protect?: ProtectStroke[]
}

/** Kaynak uzayında fırça izi. pts: [x0,y0,x1,y1,…] (0..1), r: yarıçap, kısa kenara oranla. */
export interface ProtectStroke { pts: number[]; r: number; erase?: boolean }

export interface BodyEdit {
  shape: Record<string, number>
  manual: { y0: number; y1: number; stretch: number; slim: number } | null
  /** Arka planı koru: inceltme/bel/kalça bükmesi yalnız kişi maskesinde uygulanır. */
  protect?: boolean
}

export type Fill =
  | { type: 'color'; color: string }
  | { type: 'gradient'; from: string; to: string; angle: number }
  | { type: 'blur'; amount: number }
  | { type: 'image'; file: string }
  | { type: 'transparent' }

export interface Background {
  ratio: string | null; fill: Fill | null; useCutout: boolean
  /** Şablon yerleşimi: fotoğrafın tuvaldeki kutusu [x, y, w, h] (0..1). Yoksa fotoğraf ortalanır. */
  box?: [number, number, number, number] | null
}

export type LayerType = 'text' | 'sticker' | 'shape' | 'drawing' | 'image'
export interface Layer {
  id: string
  type: LayerType
  x: number; y: number          // merkez, çıktı uzayında 0..1
  scale: number; rotation: number; opacity: number
  props: Record<string, unknown>
}

export type RasterOpType = 'liquify' | 'erase' | 'cutout' | 'inpaint' | 'upscale' | 'style' | 'gen' | 'clone' | 'mosaic' | 'paint'
export interface RasterOp { id: string; type: RasterOpType; file: string; params: Record<string, unknown>; at: string }

export interface EffectRef { id: string; amount: number }

/**
 * Seçmeli ayar noktası (Snapseed'deki kontrol noktası benzeri): kaynak uv'de konum, yarıçap (kısa kenara oran),
 * noktadaki renk ve renk duyarlılığı. Etki = konum yakınlığı × renk benzerliği. Ayarlar -100..100.
 */
export interface LocalPoint {
  id: string
  x: number; y: number
  r: number                       // 0.03..0.6
  color: [number, number, number] // 0..1, noktanın kaynak rengi
  tol: number                     // renk duyarlılığı 0..100 (0 = renge bakma)
  adj: { b: number; c: number; s: number; w: number } // parlaklık, kontrast, doygunluk, sıcaklık
}

export interface EditDoc {
  base: string | null      // son raster sonucu dosya adı; null = kaynak
  rasterOps: RasterOp[]
  mask: string | null      // kesme maskesi dosyası (kaynak uzayında, gri tonlama PNG)
  crop: Crop
  adjust: Adjust
  hsl: HSL
  curves: Curves
  filter: EffectRef | null
  effects: EffectRef[]
  /** Seçmeli ayar noktaları (en çok 8). */
  local?: LocalPoint[]
  retouch: { faces: FaceEdit[] }
  body: BodyEdit | null
  background: Background
  layers: Layer[]
}

export interface ProjectMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  width: number
  height: number
  thumb: string | null // data URL ya da isil-file URL
}

export interface Project extends ProjectMeta {
  sourceFile: string
  doc: EditDoc
  version: 1
}

export interface Settings {
  language: 'tr' | 'en'
  exportFormat: 'jpeg' | 'png' | 'webp'
  exportQuality: number   // 50..100
  exportMaxSide: number   // 0 = orijinal
  genQuality: 'fast' | 'best'   // FLUX.2 klein 4B / 9B
  autosave: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'tr',
  exportFormat: 'jpeg',
  exportQuality: 92,
  exportMaxSide: 0,
  genQuality: 'fast',
  autosave: true
}

export function emptyAdjust(): Adjust {
  return Object.fromEntries(ADJUST_KEYS.map((k) => [k, 0])) as Adjust
}
export function emptyHSL(): HSL {
  return Object.fromEntries(HUE_BANDS.map((b) => [b, { h: 0, s: 0, l: 0 }])) as HSL
}
export function identityCurve(): CurvePoint[] {
  return [[0, 0], [1, 1]]
}
export function emptyDoc(): EditDoc {
  return {
    base: null,
    rasterOps: [],
    mask: null,
    crop: { x: 0, y: 0, w: 1, h: 1, rotation: 0, quarter: 0, flipH: false, flipV: false, perspH: 0, perspV: 0, ratio: null },
    adjust: emptyAdjust(),
    hsl: emptyHSL(),
    curves: { rgb: identityCurve(), r: identityCurve(), g: identityCurve(), b: identityCurve() },
    filter: null,
    effects: [],
    retouch: { faces: [] },
    body: null,
    background: { ratio: null, fill: null, useCutout: false },
    layers: []
  }
}
