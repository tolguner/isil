import { ensureModel, runModel, ort } from './models'
import { toCanvas } from './ops'

// 1. katman (komut engeli) saf kurallarla ai/rules.ts'te; burada yeniden dışa verilir
export { blockedPrompt, normalizePrompt } from './rules'

export class BlockedError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'BlockedError'
  }
}

// ---------- 2. katman: üretken çıktıda çıplaklık denetimi ----------
// AdamCodd/vit-base-nsfw-detector (ViT-base, 384 px, Apache-2.0). Çıktı engellenme eşiği: "nsfw" olasılığı 0,7.
export const NSFW_LIMIT = 0.7

/** Görüntünün çıplak/cinsel içerik olasılığı (0..1). Model indirilemezse null. */
export async function nsfwScore(src: CanvasImageSource & { width: number; height: number }): Promise<number | null> {
  if (!(await ensureModel('nsfw', false).catch(() => false))) return null
  const S = 384
  const d = toCanvas(src, S, S).getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, S, S).data
  const t = new Float32Array(3 * S * S)
  for (let i = 0; i < S * S; i++) for (let c = 0; c < 3; c++) t[c * S * S + i] = (d[i * 4 + c] / 255 - 0.5) / 0.5
  const { out, sess } = await runModel('nsfw', { pixel_values: new ort.Tensor('float32', t, [1, 3, S, S]) })
  const z = out[sess.outputNames[0]].data as Float32Array
  const m = Math.max(z[0], z[1])
  const e0 = Math.exp(z[0] - m), e1 = Math.exp(z[1] - m)
  return e1 / (e0 + e1)
}
