import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Send, KeyRound } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT, useLang } from '@/lib/i18n'
import { platform } from '@/lib/platform'
import { ensureCloud, geminiAvailable, geminiChat } from '@/ai/gemini'

interface Msg { role: 'user' | 'bot'; text: string; img?: string }

const SYSTEM_TR = 'Sen Işıl uygulamasının güzellik ve stil danışmanısın. Kısa, samimi ve somut öneriler ver: makyaj, saç, kıyafet renkleri, fotoğraf pozları ve Işıl’daki hangi aracın (Rötuş, Filtreler, Tarifler, Arka plan) kullanılacağı. Tıbbi tavsiye verme. Kullanıcı Türkçe yazıyorsa Türkçe yanıtla.'
const SYSTEM_EN = 'You are the beauty and style advisor of the Işıl photo app. Give short, warm, concrete advice: makeup, hair, outfit colors, photo poses and which Işıl tool to use (Retouch, Looks, Recipes, Backdrop). No medical advice.'

const STARTERS: [string, string][] = [
  ['Bu fotoğrafta bana hangi ruj tonu yakışır?', 'Which lipstick shade suits me in this photo?'],
  ['Yüz şeklime uygun saç modeli öner', 'Suggest a haircut for my face shape'],
  ['Bu fotoğrafı daha profesyonel nasıl gösteririm?', 'How can I make this photo look more professional?'],
  ['Renk paletime göre kıyafet renkleri öner', 'Suggest outfit colors for my palette']
]

export function Stylist() {
  const tr = useT()
  const lang = useLang()
  const [ok, setOk] = useState<boolean | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [img, setImg] = useState<{ url: string; bm: ImageBitmap } | null>(null)
  const [sending, setSending] = useState(false)
  const prev = useRef<string | undefined>(undefined)
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    geminiAvailable().then(setOk)
  }, [])
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [msgs])

  const send = async (t: string) => {
    if (!t.trim() || sending) return
    if (!(await ensureCloud())) return
    const userMsg: Msg = { role: 'user', text: t.trim(), img: img?.url }
    setMsgs((m) => [...m, userMsg])
    setText('')
    setSending(true)
    try {
      const r = await geminiChat(t.trim(), img?.bm, prev.current, lang === 'en' ? SYSTEM_EN : SYSTEM_TR)
      prev.current = r.id
      setMsgs((m) => [...m, { role: 'bot', text: r.text || '…' }])
      setImg(null)
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', text: tr('Yanıt alınamadı: ', 'No answer: ') + (e as Error).message }])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="page" style={{ display: 'flex' }}>
      <div className="chat">
        <div className="chat-log" ref={log} aria-live="polite">
          {msgs.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 40 }}>
              <h1 style={{ fontFamily: 'Playfair Display', fontStyle: 'italic', fontWeight: 400, fontSize: 40, margin: 0 }}>{tr('Merhaba.', 'Hello.')}</h1>
              <p className="muted">{tr('Stil danışmanın. Bir fotoğraf ekle ve güzellik ya da stil hakkında sor.', 'Your style advisor. Add a photo and ask about beauty or style.')}</p>
              {ok === false && (
                <div className="card" style={{ maxWidth: 460, margin: '16px auto', textAlign: 'left' }}>
                  <b><KeyRound size={14} /> {tr('Gemini anahtarı gerekli', 'Gemini key required')}</b>
                  <p className="note">{tr('Sohbet, kendi Gemini anahtarınla çalışır. Metin modellerinde genellikle ücretsiz kota bulunur.', 'Chat uses your own Gemini key. Text models usually have a free quota.')}</p>
                  <button className="btn sm primary" onClick={() => useEditor.getState().go('settings')}>{tr('Ayarlara git', 'Open Settings')}</button>
                </div>
              )}
              <div className="row wrap" style={{ justifyContent: 'center', marginTop: 16 }}>
                {STARTERS.map(([a, b]) => (
                  <button key={a} className="btn sm" disabled={ok === false} onClick={() => send(lang === 'en' ? b : a)}>{lang === 'en' ? b : a}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={'msg ' + m.role}>
              {m.img && <img src={m.img} alt="" />}
              {m.text}
            </div>
          ))}
          {sending && <div className="msg bot"><span className="spinner" style={{ width: 16, height: 16, margin: 0, display: 'inline-block' }} /></div>}
        </div>
        <div className="chat-input">
          <button className="icon-btn" title={tr('Fotoğraf ekle', 'Add photo')} aria-label={tr('Fotoğraf ekle', 'Add photo')} onClick={async () => {
            const f = await platform.openFiles(false)
            if (!f[0]) return
            const b = new Blob([f[0].bytes as BlobPart])
            setImg({ url: URL.createObjectURL(b), bm: await createImageBitmap(b) })
          }}><ImagePlus size={18} /></button>
          {img && <img src={img.url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />}
          <textarea className="textarea" rows={1} value={text} placeholder={tr('Güzellik ve stil hakkında sor…', 'Ask about beauty and style…')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text) } }} />
          <button className="btn primary" disabled={!text.trim() || sending || ok === false} onClick={() => send(text)} aria-label={tr('Gönder', 'Send')}><Send size={16} /></button>
        </div>
      </div>
    </div>
  )
}
