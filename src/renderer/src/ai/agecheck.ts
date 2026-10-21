// Kötüye kullanım koruması, 3. katman: fotoğrafta 18 yaşından küçük görünen biri varsa vücut ve kıyafet araçları
// kapanır. Yaş tahmini yerel görsel dil modeliyle (Qwen3-VL 4B, Apache-2.0) yapılır: açık yaş modellerinin çoğu
// ticari kullanıma kapalı veriyle eğitildiği için ayrı bir yaş modeli kullanılmadı.
// Kural: model "evet" ya da "emin değilim" derse (ya da yanıt anlaşılmazsa) küçük sayılır.
import { session } from '@/engine/session'
import { tNow } from '@/lib/i18n'
import { engineStatus, ensureEngine, localChat } from './generative'
import { BlockedError } from './safety'

type Src = CanvasImageSource & { width: number; height: number }
export type AgeVerdict = 'minor' | 'adult' | 'unknown'

const cache = new Map<string, Exclude<AgeVerdict, 'unknown'>>()
const pending = new Map<string, Promise<AgeVerdict>>()

const SYSTEM = 'You are a careful safety checker for a photo editor. You only answer with one word.'
const QUESTION = 'Look at every person in this photo. Does any of them appear to be younger than 18 (a child or a teenager)? Answer with exactly one word: YES, NO or UNSURE.'

/** Yanıtı karara çevir: yalnız açık bir "NO" yetişkin sayılır. */
export function parseVerdict(answer: string | null): Exclude<AgeVerdict, 'unknown'> {
  const a = (answer ?? '').trim().toUpperCase()
  if (/^(NO|HAYIR)\b/.test(a)) return 'adult'
  return 'minor'
}

/**
 * Fotoğraftaki kişiler için yaş kararı (oturumdaki görsel başına bir kez sorulur).
 * install=false: motor ve görsel dil modeli kurulu değilse sormadan 'unknown' döner.
 * install=true: eksikse kurmayı önerir; kullanıcı kabul etmezse 'unknown'.
 */
export async function ageVerdict(img: Src, opts: { install?: boolean; key?: string } = {}): Promise<AgeVerdict> {
  const key = opts.key ?? session.baseKey
  const hit = key ? cache.get(key) : undefined
  if (hit) return hit
  if (!opts.install) {
    const s = await engineStatus().catch(() => null)
    if (!s?.available || !s.installed.runtime || !s.installed.vlm) return 'unknown'
  } else if (!(await ensureEngine(['runtime', 'vlm']))) return 'unknown'
  if (key && pending.has(key)) return pending.get(key)!
  const job = (async () => {
    const answer = await localChat([{ role: 'user', text: QUESTION, image: img }], SYSTEM).catch(() => null)
    const v = parseVerdict(answer)
    if (key) cache.set(key, v)
    return v
  })()
  if (key) pending.set(key, job)
  try {
    return await job
  } finally {
    if (key) pending.delete(key)
  }
}

/** Vücut ve kıyafet değiştiren üretken araçlardan önce: yetişkin olduğu doğrulanmadıkça durdurur. */
export async function requireAdult(img: Src) {
  const v = await ageVerdict(img, { install: true })
  if (v === 'adult') return
  if (v === 'unknown') throw new BlockedError(tNow('Bu araç, fotoğraftaki kişilerin yetişkin olduğunu doğrulamak için yerel görsel dil modelini (Qwen3-VL) ister. Kurulumu onaylarsan kullanabilirsin.', 'This tool needs the local vision-language model (Qwen3-VL) to confirm that the people in the photo are adults. Approve the install to use it.'))
  throw new BlockedError(MINOR_TEXT())
}

export const MINOR_TEXT = () => tNow('Bu fotoğrafta 18 yaşından küçük görünen biri var. Vücut ve kıyafet araçları bu fotoğrafta kapalı.', 'Someone in this photo appears to be under 18. Body and outfit tools are turned off for this photo.')
