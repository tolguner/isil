import { useEffect, useRef, useState } from 'react'
import { ImagePlus, Send, Cpu, Wand2 } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT, useLang } from '@/lib/i18n'
import { platform, type PickedFile } from '@/lib/platform'
import { startEditing } from '@/lib/projects'
import type { EditDoc } from '@shared/schema'
import type { TabId } from '@/store/editor'
import { engineStatus, localChat, type ChatMsg } from '@/ai/generative'

interface Msg { role: 'user' | 'bot'; text: string; img?: string; bm?: ImageBitmap | null; file?: PickedFile }

// Işıl'ın gerçek araç adları: danışman yalnız bunları önersin (uydurma menüler öneriyordu)
const TOOLS_TR = 'YZ Editör, Tarifler, Rötuş (Tek dokunuş, Yüz, Cilt, Makyaj, Toparla, Ten tonu, Saç, Rötuş fırçası, Işıklandır, Vücut), Filtreler, Hızlı hava, Ayarla (Akıllı, Seçmeli, HSL, Eğriler, Kalite artır), Kırp (YZ genişlet), Temizle (Sihirli silgi, Yoldan geçenler, Klonla), Efektler (Portre bulanıklığı), YZ efekt, Kesim, Arka plan, Şekillendir, Metin, Çıkartma (Dövme)'
const TOOLS_EN = 'AI Editor, Recipes, Retouch (One tap, Face, Skin, Makeup, Lift, Skin tone, Hair, Retouch brush, Relight, Body), Looks, Quick mood, Adjust (Smart, Selective, HSL, Curves, Enhance), Crop (AI expand), Clean up (Magic eraser, Passers-by, Clone), Effects (Portrait blur), AI effects, Cutout, Backdrop, Reshape, Text, Stickers (Tattoo)'
const SYSTEM_TR = `Sen Işıl fotoğraf uygulamasının güzellik ve stil danışmanısın. Önce fotoğrafta gördüğünü bir cümleyle söyle, sonra en fazla 4 kısa ve somut öneri ver (toplam 80 kelimeyi geçme). Uygulamadan araç önereceksen YALNIZ şu adları kullan: ${TOOLS_TR}. Başka menü ya da özellik uydurma. Renk önerilerinde gerçek ürün tonları kullan (ör. fondötende "koyu kahve, karamel, bal" gibi). Tıbbi tavsiye verme. Düzgün Türkçe yaz.`
const SYSTEM_EN = `You are the beauty and style advisor of the Işıl photo app. First say in one sentence what you see, then give at most 4 short, concrete suggestions (under 80 words total). If you suggest an app tool, use ONLY these names: ${TOOLS_EN}. Never invent menus or features. Use real product shades for color advice. No medical advice.`

const STARTERS: [string, string][] = [
  ['Bu fotoğrafta bana hangi ruj tonu yakışır?', 'Which lipstick shade suits me in this photo?'],
  ['Yüz şeklime uygun saç modeli öner', 'Suggest a haircut for my face shape'],
  ['Bu fotoğrafı daha profesyonel nasıl gösteririm?', 'How can I make this photo look more professional?'],
  ['Renk paletime göre kıyafet renkleri öner', 'Suggest outfit colors for my palette']
]


/**
 * Danışmanın yanıtında geçen araç adları → tek tıkla açılacak araç (ve istenirse makul bir başlangıç ayarı).
 * Model yalnız listedeki adları kullanmaya yönlendirildiği için ad eşleştirmesi güvenilir.
 */
const LINKS: { names: string[]; label: [string, string]; tab: TabId; tool: string; apply?: (d: EditDoc) => void }[] = [
  { names: ['tek dokunuş', 'one tap', 'one-tap'], label: ['Tek dokunuş güzellik', 'One-tap beauty'], tab: 'retouch', tool: 'beauty' },
  { names: ['cilt', 'skin'], label: ['Cilt', 'Skin'], tab: 'retouch', tool: 'skin', apply: (d) => { d.retouch.faces = [{ index: 0, side: 'both', shape: {}, skin: { smooth: 30, blemish: 45, undereye: 30, texture: 20 }, makeup: {} }] } },
  { names: ['makyaj', 'makeup', 'ruj', 'lipstick'], label: ['Makyaj', 'Makeup'], tab: 'retouch', tool: 'makeup' },
  { names: ['toparla', 'lift'], label: ['Toparla', 'Lift'], tab: 'retouch', tool: 'lift' },
  { names: ['ten tonu', 'skin tone'], label: ['Ten tonu', 'Skin tone'], tab: 'retouch', tool: 'tone' },
  { names: ['saç', 'hair'], label: ['Saç', 'Hair'], tab: 'retouch', tool: 'hair' },
  { names: ['işıklandır', 'relight'], label: ['Işıklandır', 'Relight'], tab: 'retouch', tool: 'relight' },
  { names: ['vücut', 'body'], label: ['Vücut', 'Body'], tab: 'retouch', tool: 'body' },
  { names: ['yüz', 'face'], label: ['Yüz şekli', 'Face shape'], tab: 'retouch', tool: 'faceShape' },
  { names: ['filtre', 'looks'], label: ['Filtreler', 'Looks'], tab: 'filters', tool: 'filters' },
  { names: ['akıllı', 'smart'], label: ['Akıllı ayar', 'Smart adjust'], tab: 'adjust', tool: 'auto' },
  { names: ['seçmeli', 'selective'], label: ['Seçmeli', 'Selective'], tab: 'adjust', tool: 'selective' },
  { names: ['kalite artır', 'enhance'], label: ['Kalite artır', 'Enhance'], tab: 'adjust', tool: 'enhance' },
  { names: ['yz genişlet', 'ai expand'], label: ['YZ genişlet', 'AI expand'], tab: 'crop', tool: 'expand' },
  { names: ['kırp', 'crop'], label: ['Kırp', 'Crop'], tab: 'crop', tool: 'crop' },
  { names: ['yoldan geçenler', 'passers-by'], label: ['Yoldan geçenler', 'Passers-by'], tab: 'cleanup', tool: 'passersby' },
  { names: ['sihirli silgi', 'magic eraser'], label: ['Sihirli silgi', 'Magic eraser'], tab: 'cleanup', tool: 'erase' },
  { names: ['portre bulanıklığı', 'portrait blur'], label: ['Portre bulanıklığı', 'Portrait blur'], tab: 'effects', tool: 'pblur' },
  { names: ['arka plan', 'backdrop'], label: ['Arka plan', 'Backdrop'], tab: 'background', tool: 'background' },
  { names: ['kesim', 'cutout'], label: ['Kesim', 'Cutout'], tab: 'cutout', tool: 'cutout' },
  { names: ['yz editör', 'ai editor'], label: ['YZ Editör', 'AI Editor'], tab: 'ai', tool: 'aiedit' },
  { names: ['tarif', 'recipes'], label: ['Tarifler', 'Recipes'], tab: 'recipes', tool: 'recipes' }
]

/** Yanıttaki araçlar (sırayla, tekrarsız). "yüz" gibi kısa adlar yalnız tam kelime olarak eşleşir. */
export function toolsIn(text: string) {
  const t = text.toLocaleLowerCase('tr')
  const found: typeof LINKS = []
  for (const l of LINKS) {
    const hit = l.names.some((n) => new RegExp(`(^|[^\\p{L}])${n}(?![\\p{L}])`, 'u').test(t))
    if (hit && !found.some((f) => f.tool === l.tool)) found.push(l)
  }
  // "yüz" çok genel: başka bir yüz aracı da geçiyorsa gösterme
  return found.filter((f) => f.tool !== 'faceShape' || found.length === 1).slice(0, 4)
}

export function Stylist() {
  const tr = useT()
  const lang = useLang()
  const [ok, setOk] = useState<boolean | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [img, setImg] = useState<{ url: string; bm: ImageBitmap; file: PickedFile } | null>(null)
  const [sending, setSending] = useState(false)
  const [partial, setPartial] = useState('')
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => {
    engineStatus().then((x) => setOk(x.available))
  }, [])
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, partial])

  const send = async (t: string) => {
    if (!t.trim() || sending) return
    const userMsg: Msg = { role: 'user', text: t.trim(), img: img?.url, bm: img?.bm ?? null, file: img?.file }
    const history = [...msgs, userMsg]
    setMsgs(history)
    setText('')
    setImg(null)
    setSending(true)
    setPartial('')
    // yanıt yazıldıkça göster
    const off = platform.onEngineProgress((p) => {
      if (p.stage === 'chat' && p.text) setPartial(p.text)
      if (p.stage === 'load') setPartial(tr('Model belleğe yükleniyor…', 'Loading the model…'))
    })
    try {
      // son 8 mesaj + yalnızca son görsel (bellek için)
      const lastImg = [...history].reverse().find((m) => m.bm)
      const conv: ChatMsg[] = history.slice(-8).map((m) => ({ role: m.role === 'bot' ? 'assistant' : 'user', text: m.text, image: m === lastImg ? m.bm : null }))
      const r = await localChat(conv, lang === 'en' ? SYSTEM_EN : SYSTEM_TR)
      if (r === null) setMsgs((m) => m.slice(0, -1))
      else setMsgs((m) => [...m, { role: 'bot', text: r || '…' }])
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', text: tr('Yanıt alınamadı: ', 'No answer: ') + (e as Error).message }])
    } finally {
      off()
      setPartial('')
      setSending(false)
    }
  }

  /** Öneriyi uygula: konuşmadaki fotoğrafı düzenleyicide aç, aracı aç, varsa başlangıç ayarını uygula. */
  const openTool = async (file: PickedFile, l: (typeof LINKS)[number]) => {
    await startEditing(file)
    const st = useEditor.getState()
    if (st.screen !== 'editor') return
    st.setTab(l.tab)
    st.openTool(l.tool)
    if (l.apply) st.update(l.apply)
  }

  return (
    <div className="page" style={{ display: 'flex' }}>
      <div className="chat">
        <div className="chat-log" ref={log} aria-live="polite">
          {msgs.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 40 }}>
              <h1 style={{ fontFamily: 'Playfair Display', fontStyle: 'italic', fontWeight: 400, fontSize: 40, margin: 0 }}>{tr('Merhaba.', 'Hello.')}</h1>
              <p className="muted">{tr('Stil danışmanın. Bir fotoğraf ekle ve güzellik ya da stil hakkında sor.', 'Your style advisor. Add a photo and ask about beauty or style.')}</p>
              <div className="card" style={{ maxWidth: 460, margin: '16px auto', textAlign: 'left' }}>
                <b><Cpu size={14} /> {tr('Bilgisayarında çalışır', 'Runs on your computer')}</b>
                <p className="note">{ok === false ? tr('Yerel YZ yalnızca masaüstü uygulamasında çalışır.', 'Local AI only runs in the desktop app.') : tr('Qwen3-VL 4B modeli ilk soruda bir kez indirilir (≈3,5 GB). Sohbetin ve fotoğrafların dışarı gönderilmez.', 'The Qwen3-VL 4B model downloads once on your first question (≈3.5 GB). Your chat and photos never leave your computer.')}</p>
              </div>
              <div className="row wrap" style={{ justifyContent: 'center', marginTop: 16 }}>
                {STARTERS.map(([a, b]) => (
                  <button key={a} className="btn sm" disabled={ok === false} onClick={() => send(lang === 'en' ? b : a)}>{lang === 'en' ? b : a}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => {
            const file = m.role === 'bot' ? [...msgs.slice(0, i)].reverse().find((x) => x.file)?.file : undefined
            const links = m.role === 'bot' && file ? toolsIn(m.text) : []
            return (
              <div key={i} className={'msg ' + m.role}>
                {m.img && <img src={m.img} alt="" />}
                {m.text}
                {links.length > 0 && (
                  <div className="msg-actions" role="group" aria-label={tr('Önerileri uygula', 'Apply suggestions')}>
                    {links.map((l) => (
                      <button key={l.tool} className="btn sm" onClick={() => void openTool(file!, l)}><Wand2 size={13} /> {tr(l.label[0], l.label[1])}</button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {sending && <div className="msg bot">{partial || <span className="spinner" style={{ width: 16, height: 16, margin: 0, display: 'inline-block' }} />}</div>}
        </div>
        <div className="chat-input">
          <button className="icon-btn" title={tr('Fotoğraf ekle', 'Add photo')} aria-label={tr('Fotoğraf ekle', 'Add photo')} onClick={async () => {
            const f = await platform.openFiles(false)
            if (!f[0]) return
            const b = new Blob([f[0].bytes as BlobPart])
            setImg({ url: URL.createObjectURL(b), bm: await createImageBitmap(b), file: f[0] })
          }}><ImagePlus size={18} /></button>
          {img && <img src={img.url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />}
          <textarea className="textarea" rows={1} value={text} placeholder={tr('Güzellik ve stil hakkında sor…', 'Ask about beauty and style…')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(text) } }} />
          <button className="btn primary" disabled={!text.trim() || sending || ok === false} onClick={() => send(text)} aria-label={tr('Gönder', 'Send')}><Send size={16} /></button>
        </div>
      </div>
    </div>
  )
}
