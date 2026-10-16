// Test geçici klasörleri: çıkışta silinir. Modeller kopyalanmaz, sabit bağlanır (aynı diskte yer kaplamaz).
import { mkdtempSync, rmSync, linkSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const dirs = []
process.on('exit', () => {
  for (const d of dirs) try { rmSync(d, { recursive: true, force: true, maxRetries: 5 }) } catch {}
})

export function tempDir(prefix) {
  const d = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(d)
  return d
}

/** Sabit bağlantı; olmazsa (farklı disk) kopya. */
export function linkOrCopy(src, dst) {
  try { linkSync(src, dst) } catch { copyFileSync(src, dst) }
}
