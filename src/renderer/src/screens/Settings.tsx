import { useEffect, useState } from 'react'
import { Download, Trash2, Check, Cpu } from 'lucide-react'
import type { Settings } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { platform } from '@/lib/platform'
import { useT } from '@/lib/i18n'
import { Segmented, Switch, confirmDialog } from '@/components/ui'
import { visibleModels, ensureModel, modelReady } from '@/ai/models'
import { PARTS, engineStatus } from '@/ai/generative'
import type { EngineStatus } from '@/lib/platform'

export function SettingsPage() {
  const tr = useT()
  const s = useEditor((x) => x.settings)
  const set = async (p: Partial<Settings>) => useEditor.getState().setSettings(await platform.setSettings(p))
  const [eng, setEng] = useState<EngineStatus | null>(null)
  const [stepText, setStepText] = useState('')
  const [installing, setInstalling] = useState<string | null>(null)
  const [prog, setProg] = useState<number | null>(null)
  const [ready, setReady] = useState<Record<string, boolean>>({})

  const refresh = async () => {
    setEng(await engineStatus())
    const r: Record<string, boolean> = {}
    for (const m of visibleModels()) r[m.id] = await modelReady(m.id)
    setReady(r)
  }
  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="page">
      <div className="page-inner">
        <h1>{tr('Ayarlar', 'Settings')}</h1>

        <section>
          <div className="group-label">{tr('Genel', 'General')}</div>
          <div className="setting">
            <div><b>{tr('Dil', 'Language')}</b><span>{tr('Arayüz dili', 'Interface language')}</span></div>
            <div style={{ width: 200 }}><Segmented items={[{ id: 'tr', label: 'Türkçe' }, { id: 'en', label: 'English' }]} value={s.language} onChange={(v) => set({ language: v })} /></div>
          </div>
          <div className="setting">
            <div><b>{tr('Projeyi otomatik kaydet', 'Autosave projects')}</b><span>{tr('Düzenlerken her değişiklik kaydedilir', 'Every change is saved while you edit')}</span></div>
            <Switch label="autosave" on={s.autosave} onChange={(v) => set({ autosave: v })} />
          </div>
        </section>

        <section>
          <div className="group-label">{tr('Dışa aktarma', 'Export')}</div>
          <div className="setting">
            <div><b>{tr('Varsayılan biçim', 'Default format')}</b></div>
            <div style={{ width: 240 }}><Segmented items={[{ id: 'jpeg', label: 'JPG' }, { id: 'png', label: 'PNG' }, { id: 'webp', label: 'WebP' }]} value={s.exportFormat} onChange={(v) => set({ exportFormat: v })} /></div>
          </div>
          <div className="setting">
            <div><b>{tr('Kalite', 'Quality')}</b><span>JPG / WebP</span></div>
            <input className="input" style={{ width: 90 }} type="number" min={50} max={100} value={s.exportQuality} onChange={(e) => set({ exportQuality: Math.min(100, Math.max(50, Number(e.target.value) || 92)) })} />
          </div>
        </section>

        <section>
          <div className="group-label">{tr('Yerel yapay zekâ modelleri', 'Local AI models')}</div>
          <p className="note">{tr('Bu modeller bir kez indirilir ve bilgisayarında çalışır; fotoğrafların dışarı gönderilmez. Yüz, vücut, saç ve dokun-seç modelleri uygulamayla birlikte gelir.', 'These download once and run on your computer; your photos never leave it. Face, body, hair and tap-select models ship with the app.')} {tr('YZ motoru kuruluysa güçlü modeller (BiRefNet, UltraSharp V2, GFPGAN, Depth V2 Base) kullanılır; değilse hafif sürümleri.', 'With the AI engine installed the strong models (BiRefNet, UltraSharp V2, GFPGAN, Depth V2 Base) are used; otherwise their light versions.')}</p>
          {visibleModels().map((m) => (
            <div className="setting" key={m.id}>
              <div>
                <b>{tr(m.task[0], m.task[1])}</b>
                <span>{m.name[0]} · {Math.round((m.size + (m.extra?.size ?? 0)) / 1e6)} MB · {m.license}{m.native ? tr(' · YZ motoruyla GPU’da çalışır', ' · runs on the GPU with the AI engine') : ''}</span>
              </div>
              {ready[m.id] ? (
                <div className="row">
                  <span className="muted"><Check size={14} /> {tr('Hazır', 'Ready')}</span>
                  {platform.isElectron && (
                    <button className="btn sm ghost" onClick={async () => {
                      const ok = await confirmDialog({ title: tr('Model silinsin mi?', 'Delete model?'), text: tr('Gerektiğinde yeniden indirilebilir.', 'It can be downloaded again when needed.'), confirm: tr('Sil', 'Delete'), danger: true })
                      if (!ok) return
                      await platform.deleteModel(m.file)
                      if (m.extra) await platform.deleteModel(m.extra.file)
                      void refresh()
                    }}><Trash2 size={14} /></button>
                  )}
                </div>
              ) : (
                <button className="btn sm" disabled={!platform.isElectron} onClick={async () => { await ensureModel(m.id, false); void refresh() }}><Download size={14} /> {tr('İndir', 'Download')}</button>
              )}
            </div>
          ))}
        </section>

        <section>
          <div className="group-label">{tr('Yerel üretken yapay zekâ', 'Local generative AI')}</div>
          <p className="note">
            {tr(
              'YZ Editör, YZ efektleri, YZ ile değiştir ve stil danışmanı tamamen bilgisayarında çalışır: FLUX.2 klein (görsel düzenleme) ve Qwen3-VL (sohbet). Motor; Python, PyTorch (CUDA) ve diffusers’tan oluşur, NVIDIA ekran kartı önerilir. Ücret ve internet gerekmez; fotoğrafların dışarı gönderilmez.',
              'AI Editor, AI effects, AI replace and the style advisor run entirely on your computer: FLUX.2 klein (image editing) and Qwen3-VL (chat). The engine is Python, PyTorch (CUDA) and diffusers; an NVIDIA GPU is recommended. No fees or internet; your photos never leave your computer.'
            )}
          </p>
          {eng && !eng.available && <div className="card"><b><Cpu size={14} /> {tr('Kullanılamıyor', 'Unavailable')}</b><p className="note">{eng.blocked ?? tr('Yerel motor yalnızca masaüstü uygulamasında çalışır.', 'The local engine only runs in the desktop app.')}</p></div>}
          {eng?.available && (
            <>
              <div className="setting">
                <div><b>{tr('Kalite', 'Quality')}</b><span>{tr('En iyi: 9B model; kimliği ve ayrıntıyı daha iyi korur ama yaklaşık 3 kat yavaş ve ≈12 GB ek indirme', 'Best: 9B model; keeps identity and detail better but about 3× slower and ≈12 GB extra download')}</span></div>
                <div style={{ width: 220 }}><Segmented items={[{ id: 'fast', label: tr('Hızlı (4B)', 'Fast (4B)') }, { id: 'best', label: tr('En iyi (9B)', 'Best (9B)') }]} value={s.genQuality} onChange={(v) => set({ genQuality: v })} /></div>
              </div>
              {Object.entries(PARTS).map(([id, p]) => (
                <div className="setting" key={id}>
                  <div><b>{tr(p.name[0], p.name[1])}</b><span>{p.size}{eng.device && id === 'runtime' ? ` · ${eng.device}` : ''}</span></div>
                  {eng.installed[id] ? (
                    <span className="muted"><Check size={14} /> {tr('Kurulu', 'Installed')}</span>
                  ) : installing === id ? (
                    <span className="muted" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prog !== null ? `%${Math.round(prog * 100)}` : stepText || tr('Kuruluyor…', 'Installing…')}</span>
                  ) : (
                    <button className="btn sm" disabled={!!installing} onClick={async () => {
                      setInstalling(id)
                      setProg(null)
                      setStepText('')
                      const off = platform.onEngineProgress((pp) => {
                        if (pp.stage === 'download' && pp.total) setProg((pp.got ?? 0) / pp.total)
                        else if (pp.text) {
                          setProg(null)
                          setStepText(pp.text)
                        }
                      })
                      try {
                        await platform.engineInstall(id)
                      } catch (e) {
                        useEditor.getState().toast('error', tr('Kurulum başarısız: ', 'Install failed: ') + (e as Error).message)
                      } finally {
                        off()
                        setInstalling(null)
                        void refresh()
                      }
                    }}><Download size={14} /> {tr('Kur', 'Install')}</button>
                  )}
                </div>
              ))}
            </>
          )}
        </section>

        <section>
          <div className="group-label">{tr('Hakkında', 'About')}</div>
          <p className="note">
            Işıl {__APP_VERSION__} · {tr('Kişisel kullanım ve portfolyo projesi.', 'Personal and portfolio project.')} {tr('Açık kaynak bileşenler', 'Open-source components')}: Electron, React, MediaPipe (Apache-2.0), ONNX Runtime (MIT), PyTorch (BSD-3), diffusers / transformers (Apache-2.0), FLUX.2 klein 4B (Apache-2.0) / 9B (FLUX Non-Commercial), Qwen3 / Qwen3-VL (Apache-2.0), BiRefNet (MIT), LaMa (Apache-2.0), Real-ESRGAN (BSD-3), 4x-UltraSharp V2 (CC BY-NC-SA 4.0), GFPGAN 1.4 (Apache-2.0), Depth Anything V2 Small (Apache-2.0) / Base (CC BY-NC 4.0), AnimeGANv2, Lucide (ISC), Inter ve diğer yazı tipleri (OFL).
          </p>
        </section>
      </div>
    </div>
  )
}
