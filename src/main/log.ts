// Hata günlüğü: kullanıcı klasöründe logs/isil.log. Sorun bildirirken bu dosya paylaşılır; içinde fotoğraf ya da
// kişisel veri yoktur (yalnız hata iletileri ve yığın izleri). 1 MB'ı geçince bir önceki isil.old.log olur.
import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'

export const logDir = () => join(app.getPath('userData'), 'logs')
export const logFile = () => join(logDir(), 'isil.log')

export function writeLog(level: 'error' | 'warn' | 'info', source: string, msg: string) {
  try {
    mkdirSync(logDir(), { recursive: true })
    const f = logFile()
    if (existsSync(f) && statSync(f).size > 1024 * 1024) renameSync(f, join(logDir(), 'isil.old.log'))
    const line = `${new Date().toISOString()} ${level.toUpperCase()} [${source}] ${msg.replace(/\r?\n/g, '\n    ').slice(0, 4000)}\n`
    appendFileSync(f, line)
  } catch {
    /* günlük yazılamazsa uygulamayı durdurma */
  }
}

/** Ana süreç hataları ve çöken pencere süreçleri. */
export function installMainLogging() {
  writeLog('info', 'main', `Işıl ${app.getVersion()} başladı (${process.platform} ${process.arch}, Electron ${process.versions.electron})`)
  process.on('uncaughtException', (e) => writeLog('error', 'main', e.stack ?? String(e)))
  process.on('unhandledRejection', (e) => writeLog('error', 'main', e instanceof Error ? e.stack ?? e.message : String(e)))
  app.on('render-process-gone', (_e, _w, d) => writeLog('error', 'renderer', `pencere süreci sonlandı: ${d.reason} (çıkış kodu ${d.exitCode})`))
  app.on('child-process-gone', (_e, d) => { if (d.reason !== 'clean-exit') writeLog('error', 'child', `${d.type} süreci sonlandı: ${d.reason} (${d.name ?? ''})`) })
}
