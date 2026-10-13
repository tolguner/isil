import { ipcMain } from 'electron'
import { GoogleGenAI } from '@google/genai'
import type { Settings } from '../shared/schema'

// Gemini yalnızca kullanıcı kendi anahtarını girdiyse çalışır. Anahtar renderer'a hiç gönderilmez.
const IMAGE_MODEL = 'gemini-nano-banana-2.1'
const TEXT_MODEL = 'gemini-3.8-flash'

interface Deps {
  getSecret: () => Promise<string | null>
  settings: () => Promise<Settings>
}

type Part = { type: 'text'; text: string } | { type: 'image'; mime_type: string; data: string }

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('base64')
}

export function registerAiHandlers(deps: Deps) {
  async function client() {
    const key = await deps.getSecret()
    if (!key) throw new Error('NO_KEY')
    return new GoogleGenAI({ apiKey: key })
  }

  ipcMain.handle('gemini:edit', async (_e, a: { image: Uint8Array; mime: string; prompt: string; refs?: { bytes: Uint8Array; mime: string }[] }) => {
    const ai = await client()
    const input: Part[] = [
      { type: 'text', text: a.prompt },
      { type: 'image', mime_type: a.mime, data: b64(a.image) },
      ...(a.refs ?? []).map((r) => ({ type: 'image' as const, mime_type: r.mime, data: b64(r.bytes) }))
    ]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interaction: any = await (ai as any).interactions.create({ model: IMAGE_MODEL, input })
    let img: { data: string; mime_type?: string } | undefined = interaction.output_image
    let text = ''
    for (const step of interaction.steps ?? []) {
      if (step.type !== 'model_output') continue
      for (const c of step.content ?? []) {
        if (c.type === 'image' && !img) img = c
        if (c.type === 'text') text += c.text
      }
    }
    if (!img) throw new Error(text || 'Model görsel döndürmedi')
    return { bytes: new Uint8Array(Buffer.from(img.data, 'base64')), mime: img.mime_type ?? 'image/png', text }
  })

  ipcMain.handle('gemini:chat', async (_e, a: { text: string; image?: { bytes: Uint8Array; mime: string }; previousId?: string; system?: string }) => {
    const ai = await client()
    const input: Part[] = []
    if (a.image) input.push({ type: 'image', mime_type: a.image.mime, data: b64(a.image.bytes) })
    input.push({ type: 'text', text: a.text })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const interaction: any = await (ai as any).interactions.create({
      model: TEXT_MODEL,
      input,
      ...(a.system && !a.previousId ? { system_instruction: a.system } : {}),
      ...(a.previousId ? { previous_interaction_id: a.previousId } : {})
    })
    return { id: interaction.id as string, text: (interaction.output_text as string) ?? '' }
  })
}
