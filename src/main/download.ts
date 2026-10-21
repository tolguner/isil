// Dayanıklı indirme: model ve motor dosyaları için ortak.
// - Hugging Face adresleri sabit sürüme (commit) çevrilir ve sha256 + boyutla doğrulanır (src/shared/manifest.json).
// - Bağlantı koparsa .part dosyasından kaldığı yerden devam eder (HTTP Range); ağ hatasında 4 kez yeniden dener.
// - Başlamadan önce diskte yer var mı bakılır.
import { net } from 'electron'
import { createHash } from 'crypto'
import { createReadStream, createWriteStream, existsSync, promises as fs } from 'fs'
import { dirname } from 'path'
import manifest from '../shared/manifest.json'

type Entry = { rev: string; size?: number; sha256?: string }
const MAN = manifest as Record<string, Entry>
const HF = /^https:\/\/huggingface\.co\/([\w.-]+\/[\w.-]+)\/resolve\/main\/(.+)$/

/** Adresi sabit sürüme çevirir; doğrulama bilgisi varsa onu da verir. */
export function pinned(url: string): { url: string; sha256?: string; size?: number } {
  const m = url.match(HF)
  const e = m ? MAN[`${m[1]}/${m[2]}`] : undefined
  if (!m || !e) return { url }
  return { url: `https://huggingface.co/${m[1]}/resolve/${e.rev}/${m[2]}`, sha256: e.sha256, size: e.size }
}

/** Manifestteki boyut (HEAD isteğine gerek kalmadan toplam hesaplamak için). */
export const knownSize = (url: string) => pinned(url).size

export class DiskFullError extends Error {}

/** Klasörün bulunduğu diskte en az `need` bayt boş yer var mı? Yoksa açıklayıcı hata atar. */
export async function ensureSpace(dir: string, need: number) {
  if (!need) return
  let d = dir
  while (!existsSync(d) && dirname(d) !== d) d = dirname(d)
  try {
    const st = await fs.statfs(d)
    const free = st.bavail * st.bsize
    const margin = 512 * 1024 * 1024
    if (free < need + margin) {
      const gb = (n: number) => (n / 1024 ** 3).toFixed(1)
      throw new DiskFullError(`Diskte yeterli yer yok: ${gb(need)} GB gerekiyor, ${gb(free)} GB boş. Yer açıp yeniden dene ya da Ayarlar'dan motor konumunu başka bir diske taşı.`)
    }
  } catch (e) {
    if (e instanceof DiskFullError) throw e
    /* statfs desteklenmiyorsa denetimi atla */
  }
}

async function sha256File(path: string) {
  const h = createHash('sha256')
  await new Promise<void>((res, rej) => createReadStream(path).on('data', (c) => h.update(c)).on('end', () => res()).on('error', rej))
  return h.digest('hex')
}

/**
 * Dosyayı indirir. onBytes(n, total): her parçada yeni gelen bayt sayısı (devam edilen kısım da bir kez bildirilir).
 * Dönen değer: dosya boyutu ve sha256.
 */
export async function downloadFile(url0: string, target: string, opts: { signal: AbortSignal; onBytes?: (n: number, total: number) => void; onVerify?: () => void; sha256?: string }) {
  const p = pinned(url0)
  const want = opts.sha256 ?? p.sha256
  await fs.mkdir(dirname(target), { recursive: true })
  const tmp = target + '.part'
  let reported = 0
  for (let attempt = 0; ; attempt++) {
    let have = existsSync(tmp) ? (await fs.stat(tmp)).size : 0
    if (p.size && have > p.size) { await fs.rm(tmp, { force: true }); have = 0 }
    try {
      if (!(p.size && have === p.size)) {
        const res = await net.fetch(p.url, { signal: opts.signal, headers: have ? { Range: `bytes=${have}-` } : {} })
        if (res.status === 416) { await fs.rm(tmp, { force: true }); throw new Error('aralık geçersiz') }
        if (!res.ok || !res.body) throw Object.assign(new Error(`indirme başarısız (${res.status}): ${p.url.split('/').pop()}`), { fatal: res.status === 404 || res.status === 403 || res.status === 401 })
        const resumed = res.status === 206
        if (!resumed) have = 0
        const total = resumed ? have + Number(res.headers.get('content-length') || 0) : Number(res.headers.get('content-length') || 0) || p.size || 0
        if (have > reported) { opts.onBytes?.(have - reported, total); reported = have }
        const out = createWriteStream(tmp, { flags: resumed ? 'a' : 'w' })
        const reader = res.body.getReader()
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            if (!out.write(value)) await new Promise((r) => out.once('drain', r))
            have += value.length
            if (have > reported) { opts.onBytes?.(have - reported, total); reported = have }
          }
        } finally {
          await new Promise<void>((r) => out.end(() => r()))
        }
      }
      const size = (await fs.stat(tmp)).size
      if (p.size && size !== p.size) throw new Error(`eksik indirme: ${size}/${p.size} bayt`)
      opts.onVerify?.()
      const digest = await sha256File(tmp)
      if (want && digest !== want) {
        await fs.rm(tmp, { force: true })
        throw Object.assign(new Error(`dosya doğrulaması başarısız: ${p.url.split('/').pop()}`), { fatal: attempt >= 1 })
      }
      await fs.rm(target, { force: true })
      await fs.rename(tmp, target)
      return { size, sha256: digest }
    } catch (e) {
      if (opts.signal.aborted || (e as { fatal?: boolean }).fatal || attempt >= 4) throw e
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt))
    }
  }
}
