// Arayüz hatalarını günlük dosyasına gönderir: yakalanmamış hatalar, reddedilen sözler ve console.error.
// Fotoğraf verisi gönderilmez; yalnız ileti ve yığın izi.
import { platform } from './platform'

let installed = false

export function logError(e: unknown, extra = '') {
  const msg = e instanceof Error ? (e.stack ?? e.message) : String(e)
  platform.log('error', extra ? `${msg}\n${extra.slice(0, 1500)}` : msg)
}

export function installErrorLogging() {
  if (installed) return
  installed = true
  window.addEventListener('error', (ev) => logError(ev.error ?? ev.message))
  window.addEventListener('unhandledrejection', (ev) => logError(ev.reason))
  const orig = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    orig(...args)
    try {
      const text = args.map((a) => (a instanceof Error ? (a.stack ?? a.message) : typeof a === 'string' ? a : safeJson(a))).join(' ')
      // tarayıcı içi modellerin bilinen gürültüsünü yazma
      if (!/XNNPACK|onnxruntime|VerifyEachNode|odml|DevTools/i.test(text)) platform.log('error', text)
    } catch {
      /* yoksay */
    }
  }
}

function safeJson(a: unknown) {
  try {
    return JSON.stringify(a)?.slice(0, 500) ?? String(a)
  } catch {
    return String(a)
  }
}
