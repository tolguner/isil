import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useEditor } from '@/store/editor'
import { useLang, useT } from '@/lib/i18n'

/** Kaydırıcı: tek yönlü (0..max) ya da çift yönlü (-100..100). Çift tık = sıfırla. */
export function Slider(props: {
  label: string
  value: number
  onChange: (v: number) => void
  onCommit?: () => void
  min?: number
  max?: number
  step?: number
  bipolar?: boolean
  disabled?: boolean
  def?: number
  hideValue?: boolean
}) {
  const { label, value, onChange, onCommit, min = props.bipolar ? -100 : 0, max = 100, step = 1, bipolar, disabled } = props
  const def = props.def ?? (bipolar ? 0 : min)
  const id = useId()
  const ref = useRef<HTMLDivElement>(null)
  const pct = (v: number) => ((v - min) / (max - min)) * 100
  const set = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    let v = Math.round((min + t * (max - min)) / step) * step
    if (bipolar && Math.abs(v) <= (max - min) * 0.015) v = 0
    if (v !== value) onChange(v)
  }
  const z = bipolar ? pct(0) : 0
  const p = pct(value)
  return (
    <div className="slider">
      <div className="slider-top">
        <label id={id}>
          {label}
          {value !== def && <span className="mod" aria-hidden />}
        </label>
        {!props.hideValue && <output>{bipolar && value > 0 ? '+' : ''}{Math.round(value)}</output>}
      </div>
      <div
        ref={ref}
        className={'track' + (disabled ? ' disabled' : '')}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={id}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={(e) => {
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          set(e.clientX)
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) set(e.clientX)
        }}
        onPointerUp={() => onCommit?.()}
        onDoubleClick={() => {
          onChange(def)
          onCommit?.()
        }}
        onKeyDown={(e) => {
          const k = e.shiftKey ? 10 : 1
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(min, value - step * k))
          else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(max, value + step * k))
          else if (e.key === 'Home') onChange(min)
          else if (e.key === 'End') onChange(max)
          else return
          e.preventDefault()
        }}
        onKeyUp={() => onCommit?.()}
      >
        <div className="rail-line" />
        {bipolar && <div className="zero" />}
        <div className="fill" style={{ left: `${Math.min(z, p)}%`, width: `${Math.abs(p - z)}%` }} />
        <div className="knob" style={{ left: `${p}%` }} />
      </div>
    </div>
  )
}

/** mod: o sekmede değişiklik var (kaydırıcılardaki gibi küçük nokta; Peachy'deki kategori noktası). */
export function Tabs<T extends string>(props: { items: { id: T; label: string; mod?: boolean }[]; value: T; onChange: (v: T) => void; label?: string }) {
  const lang = useLang()
  return (
    <div className="tabs" role="tablist" aria-label={props.label}>
      {props.items.map((it) => (
        <button key={it.id} role="tab" aria-selected={props.value === it.id} className={props.value === it.id ? 'on' : ''} onClick={() => props.onChange(it.id)}
          aria-label={it.mod ? `${it.label} (${lang === 'en' ? 'edited' : 'değişti'})` : undefined}>
          {it.label}
          {it.mod && <span className="mod" aria-hidden />}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string>(props: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {props.items.map((it) => (
        <button key={it.id} role="radio" aria-checked={props.value === it.id} className={props.value === it.id ? 'on' : ''} onClick={() => props.onChange(it.id)}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function Tile(props: { icon: ReactNode; label: string; on?: boolean; applied?: boolean; badge?: string; onClick: () => void; title?: string }) {
  return (
    <button className={'tile' + (props.on ? ' on' : '')} onClick={props.onClick} title={props.title ?? props.label} aria-pressed={props.on}>
      {props.badge && <span className="badge">{props.badge}</span>}
      {props.icon}
      <span>{props.label}</span>
      {props.applied && <span className="dot" aria-label="uygulandı" />}
    </button>
  )
}

export function Preset(props: { label: string; on?: boolean; onClick: () => void; children?: ReactNode; bg?: string }) {
  return (
    <button className={'preset' + (props.on ? ' on' : '')} onClick={props.onClick} aria-pressed={props.on}>
      <span className="pv" style={props.bg ? { background: props.bg } : undefined}>
        {props.children}
      </span>
      {props.label}
    </button>
  )
}

export const PALETTE = ['#ffffff', '#000000', '#f2f3f5', '#8a909b', '#ff5a5f', '#ff8a5b', '#ffb547', '#ffd166', '#c8e66a', '#4fd18b', '#3fc1c9', '#4a90e2', '#6c5ce7', '#b56cf0', '#ff7ab6', '#f7c4cf', '#e8d5c0', '#8b5e3c']

export function ColorRow(props: { value: string | null; onChange: (c: string) => void; transparent?: boolean; onTransparent?: () => void; colors?: string[]; label?: string }) {
  const colors = props.colors ?? PALETTE
  return (
    <div className="colors" role="radiogroup" aria-label={props.label}>
      <span className="swatch-input" title="Özel renk">
        <input type="color" value={props.value && props.value.startsWith('#') ? props.value : '#ffffff'} onChange={(e) => props.onChange(e.target.value)} aria-label="Özel renk" />
      </span>
      {props.transparent && <button className={'swatch checker' + (props.value === null ? ' on' : '')} onClick={props.onTransparent} aria-label="Şeffaf" />}
      {colors.map((c) => (
        <button key={c} className={'swatch' + (props.value?.toLowerCase() === c ? ' on' : '')} style={{ background: c }} onClick={() => props.onChange(c)} aria-label={c} />
      ))}
    </div>
  )
}

export function Switch(props: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button className={'switch' + (props.on ? ' on' : '')} role="switch" aria-checked={props.on} aria-label={props.label} onClick={() => props.onChange(!props.on)} />
}

export function Dialog(props: { title: string; text: ReactNode; confirm: string; cancel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('button.primary, button.danger')?.focus()
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onCancel()
    }
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('keydown', k)
      prev?.focus()
    }
  }, [])
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && props.onCancel()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dlg-t" ref={ref}>
        <h2 id="dlg-t">{props.title}</h2>
        <p>{props.text}</p>
        {props.children}
        <div className="actions">
          <button className="btn ghost" onClick={props.onCancel}>{props.cancel ?? 'Vazgeç'}</button>
          <button className={'btn ' + (props.danger ? 'danger' : 'primary')} onClick={props.onConfirm}>{props.confirm}</button>
        </div>
      </div>
    </div>
  )
}

/** Promise tabanlı onay diyaloğu. */
let confirmImpl: ((o: { title: string; text: string; confirm: string; danger?: boolean }) => Promise<boolean>) | null = null
export function confirmDialog(o: { title: string; text: string; confirm: string; danger?: boolean }) {
  return confirmImpl ? confirmImpl(o) : Promise.resolve(window.confirm(o.text))
}
export function ConfirmHost() {
  const [st, setSt] = useState<null | { o: { title: string; text: string; confirm: string; danger?: boolean }; res: (v: boolean) => void }>(null)
  const tr = useT()
  useEffect(() => {
    confirmImpl = (o) => new Promise((res) => setSt({ o, res }))
    return () => {
      confirmImpl = null
    }
  }, [])
  if (!st) return null
  const done = (v: boolean) => {
    st.res(v)
    setSt(null)
  }
  return <Dialog title={st.o.title} text={st.o.text} confirm={st.o.confirm} cancel={tr('Vazgeç', 'Cancel')} danger={st.o.danger} onConfirm={() => done(true)} onCancel={() => done(false)} />
}

export function Toasts() {
  const toasts = useEditor((s) => s.toasts)
  const dismiss = useEditor((s) => s.dismissToast)
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind}>
          <span style={{ flex: 1 }}>{t.text}</span>
          {t.action && (
            <button className="link" onClick={() => { t.action!.run(); dismiss(t.id) }}>{t.action.label}</button>
          )}
        </div>
      ))}
    </div>
  )
}

export function Busy() {
  const busy = useEditor((s) => s.busy)
  const tr = useT()
  if (!busy) return null
  return (
    <div className="busy" role="alertdialog" aria-busy="true" aria-label={busy.text}>
      <div className="busy-card">
        <div className="spinner" aria-hidden />
        <div>{busy.text}</div>
        {typeof busy.progress === 'number' && (
          <div className="bar"><i style={{ width: `${Math.round(busy.progress * 100)}%` }} /></div>
        )}
        {busy.cancel && <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={busy.cancel}>{tr('İptal', 'Cancel')}</button>}
      </div>
    </div>
  )
}
