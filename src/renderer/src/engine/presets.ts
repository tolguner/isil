// Kendi filtre/efekt ön ayarlarımız. Adlar ve değerler bize ait.
import type { Adjust, CurvePoint } from '@shared/schema'

export type Tint = [number, number, number, number] // rgb 0..1 + güç 0..1

export interface FilterDef {
  id: string
  name: { tr: string; en: string }
  cat: string
  adjust: Partial<Record<keyof Adjust, number>> // -1..1
  curve?: { rgb?: CurvePoint[]; r?: CurvePoint[]; g?: CurvePoint[]; b?: CurvePoint[] }
  splitS?: Tint
  splitH?: Tint
  swatch: [string, string] // küçük resim yedeği için iki renk
}

export const FILTER_CATS = [
  { id: 'trend', tr: 'Öne çıkan', en: 'Trending' },
  { id: 'film', tr: 'Film', en: 'Film' },
  { id: 'vintage', tr: 'Eski', en: 'Vintage' },
  { id: 'portrait', tr: 'Portre', en: 'Portrait' },
  { id: 'scenery', tr: 'Manzara', en: 'Scenery' },
  { id: 'food', tr: 'Yemek', en: 'Food' },
  { id: 'cine', tr: 'Sinematik', en: 'Cinematic' },
  { id: 'bw', tr: 'S/B', en: 'B&W' },
  { id: 'camera', tr: 'Kamera', en: 'Camera' }
]

const f = (id: string, tr: string, en: string, cat: string, adjust: FilterDef['adjust'], extra: Partial<FilterDef> = {}, swatch: [string, string] = ['#888', '#444']): FilterDef =>
  ({ id, name: { tr, en }, cat, adjust, swatch, ...extra })

export const FILTERS: FilterDef[] = [
  f('kehribar', 'Kehribar', 'Amber', 'trend', { temperature: 0.35, fade: 0.25, contrast: 0.12, saturation: -0.08 }, { splitH: [1, 0.78, 0.5, 0.3] }, ['#e8b37a', '#6b4a2e']),
  f('pamuk', 'Pamuk', 'Cotton', 'trend', { exposure: 0.12, contrast: -0.18, fade: 0.35, saturation: -0.15, temperature: 0.05 }, {}, ['#f2e6e0', '#b9aaa4']),
  f('nane', 'Nane', 'Mint', 'trend', { tint: -0.2, temperature: -0.1, fade: 0.2, vibrance: 0.15 }, { splitS: [0.3, 0.7, 0.6, 0.3] }, ['#bfe6d8', '#3c6b60']),
  f('seftali', 'Şeftali', 'Peach', 'trend', { temperature: 0.2, tint: 0.15, exposure: 0.08, contrast: -0.08 }, { splitH: [1, 0.7, 0.65, 0.35] }, ['#ffc9b0', '#a0695a']),
  f('gece-mavi', 'Gece mavisi', 'Night blue', 'trend', { temperature: -0.35, contrast: 0.15, shadows: 0.2, saturation: -0.1 }, { splitS: [0.15, 0.25, 0.6, 0.45] }, ['#5a7ab8', '#141d36']),
  f('parilti', 'Parıltı', 'Shimmer', 'trend', { glow: 0.35, exposure: 0.1, contrast: -0.05, vibrance: 0.2 }, {}, ['#fff1d6', '#a58b6a']),
  f('temiz', 'Temiz', 'Clean', 'trend', { exposure: 0.08, highlights: -0.2, shadows: 0.2, vibrance: 0.15, clarity: 0.1 }, {}, ['#f5f5f2', '#9aa3a8']),
  f('kirmizi-hal', 'Kırmızı hale', 'Red halo', 'trend', { contrast: 0.2, temperature: 0.1, saturation: 0.1 }, { splitH: [1, 0.55, 0.45, 0.3], splitS: [0.35, 0.15, 0.2, 0.3] }, ['#d9715a', '#3a1414']),

  f('kodak-sicak', 'Sıcak rulo', 'Warm roll', 'film', { temperature: 0.25, contrast: 0.15, fade: 0.2, grain: 0.25 }, { curve: { b: [[0, 0.08], [1, 0.9]] } }, ['#e3b27c', '#4b3324']),
  f('soguk-rulo', 'Soğuk rulo', 'Cool roll', 'film', { temperature: -0.2, contrast: 0.12, fade: 0.25, grain: 0.25 }, { curve: { r: [[0, 0.05], [1, 0.95]] } }, ['#a9c2cf', '#22303a']),
  f('portra', 'Ten filmi', 'Skin film', 'film', { temperature: 0.12, saturation: -0.12, contrast: -0.05, fade: 0.15, grain: 0.15 }, { splitH: [1, 0.85, 0.7, 0.25] }, ['#eac7a6', '#6c5546']),
  f('slayt', 'Slayt', 'Slide', 'film', { contrast: 0.3, saturation: 0.25, blacks: -0.2, grain: 0.1 }, {}, ['#3f8fd1', '#101820']),
  f('yesil-film', 'Yeşil film', 'Green film', 'film', { tint: -0.15, fade: 0.25, contrast: 0.1, grain: 0.2 }, { splitS: [0.25, 0.45, 0.3, 0.35] }, ['#9fb58a', '#2b3a25']),
  f('anlik', 'Anlık', 'Instant', 'film', { fade: 0.4, contrast: -0.1, temperature: 0.1, vignette: 0.25, saturation: -0.1 }, { splitH: [1, 0.9, 0.7, 0.3] }, ['#efe2c4', '#857a64']),

  f('solgun', 'Solgun', 'Faded', 'vintage', { fade: 0.55, saturation: -0.3, contrast: -0.15 }, {}, ['#d8cfc3', '#8c857c']),
  f('70ler', '70\'ler', '70s', 'vintage', { temperature: 0.4, fade: 0.35, saturation: -0.1, grain: 0.3 }, { splitS: [0.5, 0.3, 0.1, 0.3] }, ['#d7a35a', '#5a3b1c']),
  f('kartpostal', 'Kartpostal', 'Postcard', 'vintage', { fade: 0.3, tint: 0.1, vignette: 0.35, contrast: 0.05 }, { splitH: [1, 0.85, 0.6, 0.35] }, ['#e6c89e', '#6e5536']),
  f('y2k', '2000\'ler', 'Y2K', 'vintage', { exposure: 0.1, contrast: 0.1, saturation: 0.15, glow: 0.25, sharpen: 0.2 }, { splitS: [0.3, 0.3, 0.7, 0.3] }, ['#a4c8ff', '#3b4d8a']),
  f('dijikam', 'Dijikam', 'Digicam', 'vintage', { exposure: 0.15, contrast: 0.1, sharpen: 0.4, temperature: -0.08, grain: 0.15 }, {}, ['#dfe8f2', '#56606a']),

  f('yumusak-ten', 'Yumuşak ten', 'Soft skin', 'portrait', { exposure: 0.1, contrast: -0.12, highlights: -0.15, temperature: 0.06, glow: 0.15 }, {}, ['#f6d9cc', '#a07f71']),
  f('pembe-yanak', 'Pembe yanak', 'Rosy', 'portrait', { tint: 0.18, exposure: 0.06, vibrance: 0.1 }, { splitH: [1, 0.75, 0.8, 0.25] }, ['#f7c4cf', '#8a5b66']),
  f('altin-saat', 'Altın saat', 'Golden hour', 'portrait', { temperature: 0.45, exposure: 0.05, shadows: 0.15, glow: 0.2 }, { splitH: [1, 0.75, 0.35, 0.35] }, ['#ffc36b', '#6b3e14']),
  f('studyo', 'Stüdyo', 'Studio', 'portrait', { contrast: 0.18, clarity: 0.15, saturation: -0.1, highlights: -0.1 }, {}, ['#e2ddda', '#3c3836']),

  f('canli-doga', 'Canlı doğa', 'Lush', 'scenery', { vibrance: 0.35, clarity: 0.25, dehaze: 0.2, contrast: 0.1 }, {}, ['#5fa85a', '#1d3a1f']),
  f('deniz', 'Deniz', 'Seaside', 'scenery', { temperature: -0.15, vibrance: 0.3, exposure: 0.08, clarity: 0.1 }, { splitH: [0.6, 0.9, 1, 0.25] }, ['#5cc6e0', '#173e52']),
  f('gun-batimi', 'Gün batımı', 'Sunset', 'scenery', { temperature: 0.5, tint: 0.15, saturation: 0.2, contrast: 0.12 }, { splitS: [0.5, 0.2, 0.5, 0.3] }, ['#ff8a5b', '#4a1830']),
  f('sis', 'Sis', 'Mist', 'scenery', { dehaze: -0.4, fade: 0.25, saturation: -0.2 }, {}, ['#d6dde0', '#8c979b']),

  f('istah', 'İştah', 'Appetite', 'food', { temperature: 0.15, saturation: 0.2, clarity: 0.2, exposure: 0.08 }, {}, ['#f0a256', '#5a2e10']),
  f('kafe', 'Kafe', 'Café', 'food', { temperature: 0.2, fade: 0.2, contrast: 0.08, saturation: -0.05 }, { splitH: [1, 0.85, 0.65, 0.25] }, ['#c9a27a', '#4a3423']),
  f('taze', 'Taze', 'Fresh', 'food', { exposure: 0.12, vibrance: 0.25, highlights: -0.1, sharpen: 0.2 }, {}, ['#bfe39a', '#3d5a24']),

  f('teal-turuncu', 'Turkuaz-turuncu', 'Teal & orange', 'cine', { contrast: 0.2, saturation: 0.05 }, { splitS: [0.1, 0.45, 0.5, 0.45], splitH: [1, 0.65, 0.35, 0.35] }, ['#e39a5a', '#174a52']),
  f('noir-mavi', 'Gece filmi', 'Night film', 'cine', { contrast: 0.25, exposure: -0.1, saturation: -0.3, temperature: -0.2 }, { splitS: [0.1, 0.2, 0.4, 0.4] }, ['#4a5a78', '#0a0e18']),
  f('mat', 'Mat', 'Matte', 'cine', { fade: 0.4, contrast: 0.15, saturation: -0.1 }, { curve: { rgb: [[0, 0.1], [0.25, 0.22], [0.75, 0.8], [1, 0.95]] } }, ['#b8b0a6', '#3a3632']),
  f('col', 'Çöl', 'Desert', 'cine', { temperature: 0.35, tint: 0.05, contrast: 0.15, saturation: -0.15 }, { splitS: [0.45, 0.35, 0.2, 0.3] }, ['#d8a26a', '#4e3018']),

  f('sb-klasik', 'Klasik S/B', 'Classic B&W', 'bw', { saturation: -1, contrast: 0.2 }, {}, ['#cfcfcf', '#202020']),
  f('sb-yumusak', 'Yumuşak S/B', 'Soft B&W', 'bw', { saturation: -1, fade: 0.3, contrast: -0.1 }, {}, ['#e0e0e0', '#666']),
  f('sb-sert', 'Sert S/B', 'Hard B&W', 'bw', { saturation: -1, contrast: 0.55, clarity: 0.3, grain: 0.25 }, {}, ['#f0f0f0', '#000']),
  f('sb-sepya', 'Sepya', 'Sepia', 'bw', { saturation: -1, fade: 0.15 }, { splitS: [0.6, 0.45, 0.3, 0.6], splitH: [1, 0.9, 0.75, 0.5] }, ['#d9c3a0', '#3c2c1a']),
  // kamera taklidi: belirli bir cihaz değil, cihaz ailelerinin bilinen görünümü (kendi değerlerimiz)
  f('kam-sokak', 'Sokak kompaktı', 'Street compact', 'camera', { contrast: 0.3, clarity: 0.2, saturation: -0.15, shadows: -0.1, grain: 0.3, vignette: 0.2 }, { curve: { rgb: [[0, 0.03], [0.25, 0.2], [0.75, 0.82], [1, 0.97]] } }, ['#c9c4b8', '#1d1c1a']),
  f('kam-tekkullanim', 'Tek kullanımlık', 'Disposable', 'camera', { exposure: 0.1, contrast: 0.15, temperature: 0.12, saturation: 0.1, grain: 0.35, vignette: 0.35, sharpen: -0.2 }, { splitH: [1, 0.85, 0.6, 0.25], curve: { b: [[0, 0.06], [1, 0.92]] } }, ['#f1cf8e', '#4a3a22']),
  f('kam-ccd', 'Eski CCD dijital', 'Old CCD digital', 'camera', { exposure: 0.08, contrast: 0.2, sharpen: 0.5, temperature: -0.15, tint: 0.05, highlights: 0.15, grain: 0.1 }, { curve: { b: [[0, 0.04], [1, 1]] } }, ['#d7e4f2', '#3b4757']),
  f('kam-slayt', 'Pozitif film', 'Slide film', 'camera', { contrast: 0.35, saturation: 0.25, vibrance: 0.15, blacks: 0.15, grain: 0.15 }, { curve: { rgb: [[0, 0], [0.3, 0.24], [0.7, 0.78], [1, 1]] } }, ['#4fa0d8', '#1a2a3c']),
  f('kam-portre-neg', 'Portre negatifi', 'Portrait negative', 'camera', { contrast: -0.05, fade: 0.15, temperature: 0.08, saturation: -0.1, grain: 0.2 }, { curve: { rgb: [[0, 0.06], [0.5, 0.53], [1, 0.95]] }, splitS: [0.35, 0.55, 0.55, 0.2] }, ['#e8c5ae', '#4a3f3a']),
  f('kam-tungsten', 'Gece sineması', 'Tungsten night', 'camera', { temperature: -0.25, contrast: 0.15, shadows: 0.15, grain: 0.3, glow: 0.25 }, { splitH: [1, 0.55, 0.45, 0.35], splitS: [0.15, 0.4, 0.5, 0.35] }, ['#3f7c8a', '#191f2a']),
  f('kam-telefon09', 'Eski telefon', 'Old phone', 'camera', { exposure: 0.05, contrast: 0.25, saturation: -0.05, sharpen: -0.3, temperature: 0.1, grain: 0.45, vignette: 0.15 }, { curve: { rgb: [[0, 0.08], [1, 0.9]] } }, ['#cdbf9c', '#5a5240']),
  f('kam-lomo', 'Oyuncak kamera', 'Toy camera', 'camera', { contrast: 0.35, saturation: 0.35, vignette: 0.6, grain: 0.2 }, { curve: { r: [[0, 0.03], [1, 1]], b: [[0, 0.12], [1, 0.85]] } }, ['#e9634c', '#2b1430']),
]

export interface EffectDef { id: string; fx: number; name: { tr: string; en: string }; cat: string; blur?: number; def?: number }

export const EFFECT_CATS = [
  { id: 'blur', tr: 'Bulanık', en: 'Blur' },
  { id: 'light', tr: 'Işık', en: 'Light' },
  { id: 'retro', tr: 'Retro', en: 'Retro' },
  { id: 'art', tr: 'Sanat', en: 'Art' },
  { id: 'mirror', tr: 'Ayna', en: 'Mirror' }
]

const e = (id: string, fx: number, tr: string, en: string, cat: string, extra: Partial<EffectDef> = {}): EffectDef => ({ id, fx, name: { tr, en }, cat, def: 70, ...extra })

export const EFFECTS: EffectDef[] = [
  e('ruya', 1, 'Rüya', 'Dreamy', 'blur', { blur: 0.02 }),
  e('zoom', 2, 'Yakınlaşma', 'Zoom blur', 'blur'),
  e('donme', 3, 'Dönme', 'Spin blur', 'blur'),
  e('hareket', 4, 'Hareket', 'Motion', 'blur'),
  e('minyatur', 5, 'Minyatür', 'Tilt-shift', 'blur', { blur: 0.012 }),
  e('bokeh', 31, 'Bokeh', 'Bokeh', 'blur', { blur: 0.02 }),
  e('sizinti-sicak', 17, 'Sıcak sızıntı', 'Warm leak', 'light'),
  e('sizinti-pembe', 18, 'Pembe sızıntı', 'Pink leak', 'light'),
  e('prizma', 19, 'Prizma', 'Prism', 'light'),
  e('hale', 20, 'Hale', 'Halation', 'light', { blur: 0.015 }),
  e('flas', 21, 'Flaş', 'Flash', 'light'),
  e('dijikam', 22, 'Dijikam', 'Digicam', 'retro', { blur: 0.006 }),
  e('vhs', 8, 'Kaset', 'VHS', 'retro'),
  e('glitch', 7, 'Bozulma', 'Glitch', 'retro'),
  e('renk-kaymasi', 6, 'Renk kayması', 'Chromatic', 'retro'),
  e('toz', 24, 'Film tozu', 'Film dust', 'retro'),
  e('sepya', 29, 'Sepya', 'Sepia', 'retro'),
  e('piksel', 9, 'Piksel', 'Pixelate', 'art'),
  e('yarim-ton', 10, 'Yarım ton', 'Halftone', 'art'),
  e('poster', 13, 'Poster', 'Posterize', 'art'),
  e('ikili-ton', 14, 'İkili ton', 'Duotone', 'art'),
  e('termal', 15, 'Termal', 'Thermal', 'art'),
  e('eskiz', 16, 'Eskiz', 'Sketch', 'art'),
  e('yagli-boya', 26, 'Yağlı boya', 'Oil paint', 'art'),
  e('kabartma', 25, 'Kabartma', 'Emboss', 'art'),
  e('negatif', 27, 'Negatif', 'Invert', 'art'),
  e('sb-kontrast', 28, 'Sert S/B', 'Hard mono', 'art'),
  e('cift', 30, 'Çift pozlama', 'Double', 'art'),
  e('suluboya', 32, 'Suluboya', 'Watercolor', 'art', { blur: 0.006 }),
  e('guas', 33, 'Guaş', 'Gouache', 'art', { blur: 0.004 }),
  e('neon', 34, 'Neon', 'Neon', 'art'),
  e('karakalem', 35, 'Karakalem', 'Pencil', 'art'),
  e('cizgi-roman', 36, 'Çizgi roman', 'Comic', 'art', { blur: 0.003 }),
  e('ayna-y', 11, 'Yatay ayna', 'Mirror H', 'mirror'),
  e('ayna-d', 12, 'Dikey ayna', 'Mirror V', 'mirror'),
  e('kaleydoskop', 23, 'Kaleydoskop', 'Kaleidoscope', 'mirror')
]

// Hızlı ayar (tek dokunuş ruh hali): ayar + filtre + efekt bileşimi
export interface MoodDef { id: string; name: { tr: string; en: string }; adjust: FilterDef['adjust']; filter?: string; effect?: string }
export const MOODS: MoodDef[] = [
  { id: 'flas-parilti', name: { tr: 'Flaş parıltısı', en: 'Flash glow' }, adjust: { exposure: 0.15, glow: 0.3, contrast: 0.1 }, effect: 'flas' },
  { id: 'mavi-saat', name: { tr: 'Mavi saat', en: 'Blue hour' }, adjust: { temperature: -0.3, shadows: 0.2 }, filter: 'gece-mavi' },
  { id: 'altin', name: { tr: 'Altın gün batımı', en: 'Golden sunset' }, adjust: { temperature: 0.3 }, filter: 'altin-saat' },
  { id: 'sinema', name: { tr: 'Sinematik', en: 'Cinematic' }, adjust: { contrast: 0.1 }, filter: 'teal-turuncu', effect: 'hale' },
  { id: 'karanlik-ac', name: { tr: 'Karanlığı aç', en: 'Brighten dark' }, adjust: { exposure: 0.35, shadows: 0.45, highlights: -0.2, dehaze: 0.1 } },
  { id: 'dijital', name: { tr: 'Dijikam anısı', en: 'Digicam memory' }, adjust: { exposure: 0.1 }, filter: 'dijikam', effect: 'dijikam' }
]

export function filterById(id: string | undefined | null) {
  return FILTERS.find((x) => x.id === id) ?? null
}
export function effectById(id: string) {
  return EFFECTS.find((x) => x.id === id) ?? null
}
