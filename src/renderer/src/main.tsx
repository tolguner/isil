import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './styles/tokens.css'
import './styles/app.css'
import { App } from './App'

createRoot(document.getElementById('root')!).render(<App />)

const w0 = window as unknown as { isil?: { testMode?: () => Promise<boolean> } }
void (import.meta.env.DEV ? Promise.resolve(true) : (w0.isil?.testMode?.() ?? Promise.resolve(false))).then((on) => {
  if (!on) return
  void import('./lib/projects').then((m) => {
    ;(window as unknown as Record<string, unknown>).__isil = {
      open: async (url: string) => {
        const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
        await m.startEditing({ name: url.split('/').pop()!, bytes })
      },
      // testler: verilen adla aç (Türkçe/emoji ad, uzantı, bozuk dosya denemeleri)
      openFile: async (name: string, b64: string) => {
        await m.startEditing({ name, bytes: Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) })
      },
      store: () => import('./store/editor').then((s) => s.useEditor),
      mod: (name: string) => ({ session: () => import('./engine/session'), ops: () => import('./ai/ops'), models: () => import('./ai/models'), vision: () => import('./ai/vision'), generative: () => import('./ai/generative'), platform: () => import('./lib/platform'), projects: () => import('./lib/projects'), layers: () => import('./tools/layers'), tools: () => import('./tools/index'), aitools: () => import('./tools/ai'), restyle: () => import('./ai/restyle'), stylist: () => import('./screens/Stylist') } as Record<string, () => Promise<unknown>>)[name]()
    }
  })
})
