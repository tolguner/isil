import { useEffect, useState } from 'react'
import { Download, Trash2, Check, KeyRound } from 'lucide-react'
import type { Settings } from '@shared/schema'
import { useEditor } from '@/store/editor'
import { platform } from '@/lib/platform'
import { useT } from '@/lib/i18n'
import { Segmented, Switch, confirmDialog } from '@/components/ui'
import { MODELS, ensureModel, modelReady } from '@/ai/models'

export function SettingsPage() {
  const tr = useT()
  const s = useEditor((x) => x.settings)
  const set = async (p: Partial<Settings>) => useEditor.getState().setSettings(await platform.setSettings(p))
  const [hasKey, setHasKey] = useState(false)
  const [key, setKey] = useState('')
  const [ready, setReady] = useState<Record<string, boolean>>({})

  const refresh = async () => {
    setHasKey(await platform.hasSecret())
    const r: Record<string, boolean> = {}
    for (const m of MODELS) r[m.id] = await modelReady(m.id)
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
          <p className="note">{tr('Bu modeller bir kez indirilir ve bilgisayarında çalışır; fotoğrafların dışarı gönderilmez. Yüz, vücut, saç ve dokun-seç modelleri uygulamayla birlikte gelir.', 'These download once and run on your computer; your photos never leave it. Face, body, hair and tap-select models ship with the app.')}</p>
          {MODELS.map((m) => (
            <div className="setting" key={m.id}>
              <div>
                <b>{tr(m.task[0], m.task[1])}</b>
                <span>{m.name[0]} · {Math.round((m.size + (m.extra?.size ?? 0)) / 1e6)} MB · {m.license}</span>
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
          <div className="group-label">{tr('Bulut yapay zekâ (isteğe bağlı)', 'Cloud AI (optional)')}</div>
          <p className="note">
            {tr(
              'YZ Editör, YZ efektleri, YZ ile değiştir ve stil danışmanı kendi Google Gemini API anahtarınla çalışır. Anahtar bu bilgisayarda Windows şifrelemesiyle saklanır ve yalnızca Google’a gönderilir. Ücretsiz kotan olup olmadığını Google AI Studio’dan kontrol edebilirsin.',
              'AI Editor, AI effects, AI replace and the style advisor use your own Google Gemini API key. The key is stored encrypted on this computer and is only sent to Google. Check your free quota in Google AI Studio.'
            )}
          </p>
          <div className="setting">
            <div><b><KeyRound size={14} /> Gemini API</b><span>{hasKey ? tr('Anahtar kayıtlı', 'Key saved') : tr('Anahtar yok', 'No key')}</span></div>
            {hasKey ? (
              <button className="btn sm danger" onClick={async () => { await platform.setSecret(null); void refresh() }}>{tr('Anahtarı kaldır', 'Remove key')}</button>
            ) : (
              <div className="row">
                <input className="input" style={{ width: 260 }} type="password" placeholder="AIza…" value={key} onChange={(e) => setKey(e.target.value)} disabled={!platform.isElectron} aria-label="Gemini API key" />
                <button className="btn sm primary" disabled={!key.trim() || !platform.isElectron} onClick={async () => {
                  try {
                    await platform.setSecret(key.trim())
                    setKey('')
                    useEditor.getState().toast('success', tr('Anahtar kaydedildi', 'Key saved'))
                  } catch (e) {
                    useEditor.getState().toast('error', String((e as Error).message))
                  }
                  void refresh()
                }}>{tr('Kaydet', 'Save')}</button>
              </div>
            )}
          </div>
          {s.cloudConsent && (
            <div className="setting">
              <div><b>{tr('Bulut onayı verildi', 'Cloud consent given')}</b><span>{tr('Geri alırsan bir sonraki bulut işleminde yeniden sorulur.', 'If revoked, you will be asked again next time.')}</span></div>
              <button className="btn sm ghost" onClick={() => set({ cloudConsent: false })}>{tr('Geri al', 'Revoke')}</button>
            </div>
          )}
          {!platform.isElectron && <p className="note">{tr('Tarayıcı önizlemesinde bulut ve model indirme kapalıdır.', 'Cloud and model downloads are disabled in the browser preview.')}</p>}
        </section>

        <section>
          <div className="group-label">{tr('Hakkında', 'About')}</div>
          <p className="note">
            Işıl 0.1 · {tr('Kişisel kullanım ve portfolyo projesi.', 'Personal and portfolio project.')} {tr('Açık kaynak bileşenler', 'Open-source components')}: Electron, React, MediaPipe (Apache-2.0), ONNX Runtime (MIT), BiRefNet (MIT), LaMa (Apache-2.0), Real-ESRGAN (BSD-3), Depth Anything V2 Small (Apache-2.0), AnimeGANv2, Lucide (ISC), Inter ve diğer yazı tipleri (OFL).
          </p>
        </section>
      </div>
    </div>
  )
}
