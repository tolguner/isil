import { Wand2, LayoutTemplate, Smile, Aperture, SlidersHorizontal, Eraser, Sparkle, Brush, Sticker, Type, Bot, Scissors, Square, Waves, Shapes, Crop } from 'lucide-react'
import type { TabDef } from './types'
import { ADJUST_TOOLS } from './adjust'
import { FILTER_TOOLS, EFFECT_TOOLS } from './looks'
import { CROP_TOOLS } from './crop'
import { RETOUCH_TOOLS } from './retouch'
import { CLEANUP_TOOLS } from './cleanup'
import { CUTOUT_TOOLS, BACKGROUND_TOOLS } from './cutout'
import { TEXT_TOOLS, STICKER_TOOLS, SHAPE_TOOLS, DRAW_TOOLS } from './layers'
import { RESHAPE_TOOLS } from './reshape'
import { AI_TOOLS, AIFX_TOOLS } from './ai'
import { RECIPE_TOOLS } from './recipes'

export const TABS: TabDef[] = [
  { id: 'ai', label: ['YZ Editör', 'AI Editor'], icon: Wand2, tools: AI_TOOLS, auto: true },
  { id: 'recipes', label: ['Tarifler', 'Recipes'], icon: LayoutTemplate, tools: RECIPE_TOOLS, auto: true },
  { id: 'retouch', label: ['Rötuş', 'Retouch'], icon: Smile, tools: RETOUCH_TOOLS },
  { id: 'filters', label: ['Filtreler', 'Looks'], icon: Aperture, tools: FILTER_TOOLS },
  { id: 'adjust', label: ['Ayarla', 'Adjust'], icon: SlidersHorizontal, tools: ADJUST_TOOLS },
  { id: 'crop', label: ['Kırp', 'Crop'], icon: Crop, tools: CROP_TOOLS, auto: true },
  { id: 'cleanup', label: ['Temizle', 'Clean up'], icon: Eraser, tools: CLEANUP_TOOLS },
  { id: 'effects', label: ['Efektler', 'Effects'], icon: Sparkle, tools: EFFECT_TOOLS, auto: true },
  { id: 'aifx', label: ['YZ efekt', 'AI effects'], icon: Bot, tools: AIFX_TOOLS, auto: true },
  { id: 'cutout', label: ['Kesim', 'Cutout'], icon: Scissors, tools: CUTOUT_TOOLS, auto: true },
  { id: 'background', label: ['Arka plan', 'Backdrop'], icon: Square, tools: BACKGROUND_TOOLS, auto: true },
  { id: 'reshape', label: ['Şekillendir', 'Reshape'], icon: Waves, tools: RESHAPE_TOOLS, auto: true },
  { id: 'text', label: ['Metin', 'Text'], icon: Type, tools: TEXT_TOOLS, auto: true },
  { id: 'stickers', label: ['Çıkartma', 'Stickers'], icon: Sticker, tools: STICKER_TOOLS, auto: true },
  { id: 'shapes', label: ['Şekiller', 'Shapes'], icon: Shapes, tools: SHAPE_TOOLS, auto: true },
  { id: 'draw', label: ['Fırça', 'Draw'], icon: Brush, tools: DRAW_TOOLS, auto: true }
]
