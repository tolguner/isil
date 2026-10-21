// Hata sınırı: bir ekran ya da panel çökerse beyaz ekran yerine açıklama, "yeniden dene" ve "günlüğü aç" gösterilir.
// Hata günlüğe yazılır (lib/errors.ts). Ekran kartı WebGL2 desteklemiyorsa ayrı, açıklayıcı bir ileti çıkar.
import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { platform } from '@/lib/platform'
import { tNow } from '@/lib/i18n'
import { logError } from '@/lib/errors'

interface Props { children: ReactNode; onHome?: () => void; compact?: boolean }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    logError(error, info.componentStack ?? '')
  }

  render() {
    const e = this.state.error
    if (!e) return this.props.children
    const gpu = /WebGL2/.test(e.message)
    return (
      <div className={'crash' + (this.props.compact ? ' compact' : '')} role="alert">
        <AlertTriangle size={this.props.compact ? 22 : 34} />
        <b>{gpu ? tNow('Ekran kartı desteklenmiyor', 'Graphics card not supported') : tNow('Bir şeyler ters gitti', 'Something went wrong')}</b>
        <p className="note">
          {gpu
            ? tNow('Işıl fotoğrafları ekran kartında işler ve WebGL2 ister. Ekran kartı sürücünü güncellemeyi dene; uzak masaüstü ya da sanal makinede çalışıyorsan doğrudan bilgisayarda aç.', 'Işıl processes photos on the graphics card and needs WebGL2. Try updating your graphics driver; if you are on remote desktop or a virtual machine, open it on the computer directly.')
            : tNow('Bu bölüm bir hatayla durdu. Projen kaydedildi; yeniden deneyebilir ya da ana sayfaya dönebilirsin. Sorunu bildirmek istersen günlük dosyasını ekle.', 'This part stopped with an error. Your project is saved; you can try again or go home. To report the problem, attach the log file.')}
        </p>
        {!gpu && <code className="crash-msg">{e.message.slice(0, 300)}</code>}
        <div className="row">
          {!gpu && <button className="btn primary" onClick={() => this.setState({ error: null })}>{tNow('Yeniden dene', 'Try again')}</button>}
          {this.props.onHome && <button className="btn ghost" onClick={() => { this.setState({ error: null }); this.props.onHome!() }}>{tNow('Ana sayfa', 'Home')}</button>}
          <button className="btn ghost" onClick={() => void platform.openLog()}>{tNow('Günlüğü aç', 'Open log')}</button>
        </div>
      </div>
    )
  }
}
