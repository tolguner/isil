// İlk açılış turu (4 adım) ve klavye kısayolları penceresi. Tur bir kez gösterilir (settings.onboarded);
// Ayarlar → Hakkında'dan yeniden açılabilir. Kısayollar "?" tuşuyla ya da Ayarlar'dan açılır.
import { useEffect, useState } from 'react'
import { ImagePlus, Layers, SplitSquareHorizontal, ShieldCheck, Keyboard, X } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT } from '@/lib/i18n'
import { platform } from '@/lib/platform'

export const MANUAL_URL = 'https://github.com/tolguner/isil/blob/main/docs/KILAVUZ.md'

const ev = new EventTarget()
/** Turu ya da kısayol penceresini başka bir yerden aç. */
export const openWelcome = () => ev.dispatchEvent(new Event('welcome'))
export const openShortcuts = () => ev.dispatchEvent(new Event('shortcuts'))

export function Welcome() {
  const tr = useT()
  const [step, setStep] = useState(-1)
  useEffect(() => {
    // ayarlar diskten okunduktan sonra karar ver (varsayılan ayarlarla bir an görünmesin)
    void Promise.all([platform.getSettings(), (window as unknown as { isil?: { testMode?: () => Promise<boolean> } }).isil?.testMode?.() ?? false]).then(([s, test]) => { if (!s.onboarded && !test) setStep(0) })
    const h = () => setStep(0)
    ev.addEventListener('welcome', h)
    return () => ev.removeEventListener('welcome', h)
  }, [])
  if (step < 0) return null
  const steps = [
    { icon: <ImagePlus size={30} />, title: tr('Işıl\'a hoş geldin', 'Welcome to Işıl'), text: tr('Bir fotoğrafı ana sayfaya sürükle ya da "Fotoğraf aç"a bas. Her fotoğraf bir proje olur ve otomatik kaydedilir; ana sayfadan kaldığın yere dönebilirsin.', 'Drag a photo onto the home screen or press "Open photo". Every photo becomes a project and is saved automatically; you can pick up where you left off from the home screen.') },
    { icon: <Layers size={30} />, title: tr('Sekmeler ve araçlar', 'Tabs and tools'), text: tr('Düzenleyicideki sekmeler araç gruplarıdır: Rötuş yüz ve vücut, Ayarla ışık ve renk, Temizle istenmeyeni silme, YZ yapay zekâ ile düzenleme. Bir aracı açınca sağda ayarları çıkar; Uygula ile kalıcı olur, İptal ile geri döner.', 'The editor’s tabs are tool groups: Retouch for face and body, Adjust for light and colour, Clean up to remove things, AI for editing with AI. Opening a tool shows its settings on the right; Apply keeps it, Cancel reverts.') },
    { icon: <SplitSquareHorizontal size={30} />, title: tr('Karşılaştır ve geri al', 'Compare and undo'), text: tr('Önceki hali görmek için \\ tuşunu basılı tut. Ctrl+Z geri alır, Ctrl+E dışa aktarır. Bir aracı ya da ayarı adıyla bulmak için Ctrl+K\'ye bas; tüm kısayollar için ? tuşu.', 'Hold the \\ key to see the original. Ctrl+Z undoes, Ctrl+E exports. Press Ctrl+K to find any tool or setting by name; press ? for all shortcuts.') },
    { icon: <ShieldCheck size={30} />, title: tr('Her şey bilgisayarında', 'Everything stays on your computer'), text: tr('Fotoğrafların hiçbir yere gönderilmez; hesap, kredi ve filigran yok. Yapay zekâ araçları için bir kez model indirilir. Üretken araçlar (YZ Editör) isteğe bağlı motoru ister ve NVIDIA ekran kartında en iyi çalışır. Işıl çıplak ya da cinsel içerikli görüntü üretmez.', 'Your photos are never uploaded; no account, credits or watermarks. AI tools download a model once. Generative tools (AI Editor) need the optional engine and work best on an NVIDIA GPU. Işıl does not create nude or sexual images.') }
  ]
  const s = steps[step]
  const done = async () => {
    setStep(-1)
    useEditor.getState().setSettings(await platform.setSettings({ onboarded: true }))
  }
  return (
    <div className="scrim welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="dialog">
        <button className="icon-btn welcome-x" aria-label={tr('Kapat', 'Close')} onClick={() => void done()}><X size={16} /></button>
        <div className="welcome-icon">{s.icon}</div>
        <h2 id="welcome-title">{s.title}</h2>
        <p>{s.text}</p>
        <div className="welcome-dots" aria-hidden="true">{steps.map((_, i) => <span key={i} className={i === step ? 'on' : ''} />)}</div>
        <div className="row welcome-foot">
          {step === steps.length - 1
            ? <button className="btn ghost" onClick={() => window.open(MANUAL_URL)}>{tr('Kullanım kılavuzu', 'User manual')}</button>
            : <button className="btn ghost" onClick={() => void done()}>{tr('Atla', 'Skip')}</button>}
          <div className="grow" />
          {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}>{tr('Geri', 'Back')}</button>}
          <button className="btn primary" autoFocus onClick={() => (step === steps.length - 1 ? void done() : setStep(step + 1))}>{step === steps.length - 1 ? tr('Başla', 'Start') : tr('İleri', 'Next')}</button>
        </div>
      </div>
    </div>
  )
}

export function Shortcuts() {
  const tr = useT()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const h = () => setOpen(true)
    ev.addEventListener('shortcuts', h)
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, [contenteditable]')) return
      if (e.key === '?') setOpen((o) => !o)
      else if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', key)
    return () => { ev.removeEventListener('shortcuts', h); window.removeEventListener('keydown', key) }
  }, [])
  if (!open) return null
  const rows: [string, string, string][] = [
    ['Ctrl+K', 'Araç ya da ayar bul', 'Find a tool or setting'],
    ['Ctrl+Z', 'Geri al (araç açıkken önce aracın adımları, sonra aracın kendisi)', 'Undo (inside a tool: its steps first, then the tool)'],
    ['Ctrl+Y · Ctrl+Shift+Z', 'Yinele', 'Redo'],
    ['Ctrl+S', 'Kaydet', 'Save'],
    ['Ctrl+E', 'Dışa aktar', 'Export'],
    ['Ctrl+Shift+C · Ctrl+Shift+V', 'Görünümü kopyala / yapıştır', 'Copy / paste look'],
    ['\\ (basılı)', 'Orijinali göster', 'Show original (hold)'],
    ['Esc', 'Aracı kapat', 'Close tool'],
    ['F · 1', 'Ekrana sığdır · gerçek boyut', 'Fit · actual size'],
    ['+ · −', 'Yakınlaş · uzaklaş', 'Zoom in · out'],
    ['Boşluk + sürükle', 'Kaydır', 'Pan'],
    ['Ok tuşları', 'Kaydırıcıyı ince ayarla (Shift ile 10 kat)', 'Nudge slider (×10 with Shift)'],
    ['?', 'Bu pencere', 'This window']
  ]
  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="sc-title" onClick={() => setOpen(false)}>
      <div className="dialog shortcuts" onClick={(e) => e.stopPropagation()}>
        <h2 id="sc-title"><Keyboard size={18} /> {tr('Klavye kısayolları', 'Keyboard shortcuts')}</h2>
        <table>
          <tbody>{rows.map(([k, a, b]) => <tr key={k}><td><kbd>{k}</kbd></td><td>{tr(a, b)}</td></tr>)}</tbody>
        </table>
        <div className="row"><div className="grow" /><button className="btn primary" autoFocus onClick={() => setOpen(false)}>{tr('Tamam', 'OK')}</button></div>
      </div>
    </div>
  )
}
