import { useEffect, useState } from 'react'
import { Wand2, Bot, Send, ImagePlus, X, KeyRound } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT, useLang } from '@/lib/i18n'
import { Tabs, Preset } from '@/components/ui'
import { session } from '@/engine/session'
import { animeStyle, toCanvas } from '@/ai/ops'
import { ensureCloud, geminiAvailable, geminiEdit } from '@/ai/gemini'
import { platform } from '@/lib/platform'
import type { ToolDef, View } from './types'
import { WorkFooter, WorkOverlayImage, busy, setWorkResult, useWork, useWorkLifecycle, work } from './raster'

function useGemini() {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    geminiAvailable().then(setOk)
  }, [])
  return ok
}

function KeyCard() {
  const tr = useT()
  return (
    <div className="card">
      <b><KeyRound size={14} /> {tr('Gemini anahtarı gerekli', 'Gemini key required')}</b>
      <p className="note">
        {tr(
          'Serbest yazıyla düzenleme bulut modeli gerektirir. Ayarlar’dan kendi Google Gemini API anahtarını eklersen bu araçlar açılır; ücretsiz kotan varsa ücret ödemezsin. Yerel çalışan alternatifler aşağıda.',
          'Free-form editing needs a cloud model. Add your own Google Gemini API key in Settings to unlock these tools; with a free quota it costs nothing. Local alternatives are below.'
        )}
      </p>
      <button className="btn sm primary" onClick={() => useEditor.getState().go('settings')}>{tr('Ayarlara git', 'Open Settings')}</button>
    </div>
  )
}

const QUICK: [string, string, string][] = [
  ['Arka planı gün batımında bir plaja çevir', 'Change the background to a beach at sunset', '🏖️'],
  ['Kişiyi doğal biçimde gülümset', 'Make the person smile naturally', '😊'],
  ['Kapalı gözleri doğal biçimde aç', 'Open closed eyes naturally', '👁️'],
  ['Arkadaki yabancı insanları kaldır', 'Remove the strangers in the background', '🚶'],
  ['Polaroid anlık fotoğraf gibi göster', 'Make it look like an instant Polaroid photo', '📷'],
  ['Sinematik, dramatik bir ışık ekle', 'Add cinematic, dramatic lighting', '🎬'],
  ['Manzarayı karlı bir kış gününe çevir', 'Turn the scene into a snowy winter day', '❄️'],
  ['Kıyafeti şık siyah bir takım elbiseye çevir', 'Change the outfit to an elegant black suit', '🧥'],
  ['Saçı uzun ve dalgalı yap', 'Make the hair long and wavy', '💇'],
  ['Profesyonel stüdyo portresi gibi yap, gri fon', 'Make it a professional studio portrait, grey backdrop', '🖼️'],
  ['Flaşla çekilmiş gece fotoğrafı gibi yap', 'Make it look like a flash photo at night', '⚡'],
  ['Fotoğrafı eski, hasarlı bir fotoğraftan onarılmış gibi temizle ve renklendir', 'Restore and colorize as if repairing an old damaged photo', '🧽']
]

function AiEditorPanel() {
  const tr = useT()
  const lang = useLang()
  const ok = useGemini()
  useWorkLifecycle()
  const w = useWork()
  const [prompt, setPrompt] = useState('')
  const [refs, setRefs] = useState<{ url: string; bm: ImageBitmap }[]>([])
  const [history, setHistory] = useState<string[]>([])
  const run = async (text: string) => {
    if (!text.trim() || !work.full) return
    if (!(await ensureCloud())) return
    const res = await busy(tr('Yapay zekâ düzenliyor…', 'AI is editing…'), () =>
      geminiEdit(work.full!, `${text.trim()}\n\nKeep the person's identity, the composition and everything not mentioned unchanged. Return a photorealistic result.`, refs.map((r) => r.bm))
    )
    if (res) {
      setWorkResult(res)
      setHistory((h) => [text.trim(), ...h].slice(0, 6))
    }
  }
  return (
    <>
      {ok === false && <KeyCard />}
      <label className="field">
        <span>{tr('Ne yapmak istersin?', 'What should change?')}</span>
        <textarea className="textarea" value={prompt} placeholder={tr('Örn: arka plana sakura ağaçları ekle', 'e.g. add cherry blossom trees to the background')} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void run(prompt) }} />
      </label>
      <div className="row wrap">
        {refs.map((r, i) => (
          <span key={r.url} style={{ position: 'relative' }}>
            <img src={r.url} alt={tr('Referans', 'Reference')} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
            <button className="icon-btn" style={{ position: 'absolute', top: -10, right: -10, width: 22, height: 22, background: 'var(--c-surface-3)' }} onClick={() => setRefs(refs.filter((_, k) => k !== i))} aria-label={tr('Kaldır', 'Remove')}><X size={12} /></button>
          </span>
        ))}
        <button className="btn sm" onClick={async () => {
          const f = await platform.openFiles(false)
          if (!f[0]) return
          const blob = new Blob([f[0].bytes as BlobPart])
          setRefs([...refs, { url: URL.createObjectURL(blob), bm: await createImageBitmap(blob) }].slice(0, 3))
        }}><ImagePlus size={14} /> {tr('Referans', 'Reference')}</button>
        <button className="btn sm primary" style={{ marginLeft: 'auto' }} disabled={!prompt.trim() || ok === false} onClick={() => run(prompt)}><Send size={14} /> {tr('Oluştur', 'Generate')}</button>
      </div>
      <div className="group-label">{tr('Hazır komutlar', 'Quick prompts')}</div>
      <div className="stack">
        {QUICK.map(([a, b, e]) => (
          <button key={a} className="btn sm" style={{ justifyContent: 'flex-start' }} disabled={ok === false} onClick={() => { const t = lang === 'en' ? b : a; setPrompt(t); void run(t) }}>{e} {lang === 'en' ? b : a}</button>
        ))}
      </div>
      {!!history.length && (
        <>
          <div className="group-label">{tr('Son komutlar', 'Recent')}</div>
          {history.map((h) => <button key={h} className="link" style={{ display: 'block', marginBottom: 6 }} onClick={() => setPrompt(h)}>{h}</button>)}
        </>
      )}
      {w.changed && <p className="note">{tr('Sonucu beğenmezsen İptal ile geri dönebilir ya da yeni bir komutla üzerine devam edebilirsin.', 'Not happy? Cancel to go back, or keep refining with another prompt.')}</p>}
      <WorkFooter type="gen" params={{ prompt }} />
    </>
  )
}

const STYLES: { id: string; cat: string; label: [string, string]; prompt: string; local?: 'anime' }[] = [
  { id: 'anime-local', cat: 'trend', label: ['Anime (yerel)', 'Anime (local)'], prompt: '', local: 'anime' },
  { id: 'anime', cat: 'trend', label: ['Anime', 'Anime'], prompt: 'Redraw this photo as a high quality modern anime illustration, clean line art, soft cel shading, keep the same pose, outfit and composition.' },
  { id: 'figure', cat: 'trend', label: ['3B figür', '3D figure'], prompt: 'Turn the person into a cute collectible 3D vinyl figure on a desk, glossy plastic, studio lighting, keep their outfit and hairstyle.' },
  { id: 'plush', cat: 'trend', label: ['Peluş', 'Plush'], prompt: 'Turn the subject into a soft knitted plush toy version, fuzzy yarn texture, same colors and pose.' },
  { id: 'clay', cat: 'trend', label: ['Kil animasyon', 'Claymation'], prompt: 'Restyle the whole image as stop-motion claymation, visible fingerprints in clay, warm lighting.' },
  { id: 'comic', cat: 'art', label: ['Çizgi roman', 'Comic'], prompt: 'Redraw as a bold comic book panel with ink outlines, halftone dots and vivid flat colors.' },
  { id: 'oil', cat: 'art', label: ['Yağlı boya', 'Oil painting'], prompt: 'Repaint as a classical oil painting with visible brush strokes and rich impasto texture.' },
  { id: 'water', cat: 'art', label: ['Suluboya', 'Watercolor'], prompt: 'Repaint as a delicate watercolor illustration with soft bleeding edges on textured paper.' },
  { id: 'sketch', cat: 'art', label: ['Karakalem', 'Pencil sketch'], prompt: 'Redraw as a detailed graphite pencil sketch on white paper.' },
  { id: 'pixel', cat: 'art', label: ['Piksel sanat', 'Pixel art'], prompt: 'Redraw as 16-bit pixel art with a limited palette.' },
  { id: 'cyber', cat: 'world', label: ['Siberpunk', 'Cyberpunk'], prompt: 'Transform the scene into a neon cyberpunk city at night with rain reflections, keep the person recognizable.' },
  { id: 'game', cat: 'world', label: ['Oyun dünyası', 'Game world'], prompt: 'Make it look like a screenshot from a stylized open-world video game, keep the person as the main character.' },
  { id: 'fantasy', cat: 'world', label: ['Fantastik', 'Fantasy'], prompt: 'Place the subject in an enchanted fantasy forest with glowing fireflies, painterly light.' },
  { id: 'space', cat: 'world', label: ['Uzay', 'Space'], prompt: 'Place the person in a realistic astronaut suit floating above Earth, keep their face.' },
  { id: 'y2k', cat: 'retro', label: ['2000’ler', 'Y2K'], prompt: 'Make it look like a 2003 digital camera photo with flash, date stamp and slight noise.' },
  { id: '90s', cat: 'retro', label: ['90’lar film', '90s film'], prompt: 'Make it look like a 1990s 35mm film snapshot, warm colors, grain, light leak.' },
  { id: 'vintage', cat: 'retro', label: ['Vintage portre', 'Vintage portrait'], prompt: 'Make it a 1950s studio portrait photograph, black and white, soft vignette.' },
  { id: 'wardrobe-suit', cat: 'wardrobe', label: ['Takım elbise', 'Suit'], prompt: 'Change the outfit to a tailored navy suit, keep everything else identical.' },
  { id: 'wardrobe-dress', cat: 'wardrobe', label: ['Gece elbisesi', 'Evening dress'], prompt: 'Change the outfit to an elegant evening dress, keep everything else identical.' },
  { id: 'wardrobe-street', cat: 'wardrobe', label: ['Sokak stili', 'Streetwear'], prompt: 'Change the outfit to trendy streetwear with an oversized hoodie, keep everything else identical.' },
  { id: 'hair-blonde', cat: 'hair', label: ['Sarı saç', 'Blonde'], prompt: 'Change only the hair color to natural honey blonde.' },
  { id: 'hair-pink', cat: 'hair', label: ['Pastel pembe', 'Pastel pink'], prompt: 'Change only the hair color to pastel pink.' },
  { id: 'hair-curly', cat: 'hair', label: ['Kıvırcık', 'Curly'], prompt: 'Make the hair voluminous and curly, keep color and face unchanged.' }
]
const STYLE_CATS: [string, string, string][] = [['trend', 'Öne çıkan', 'Trending'], ['art', 'Sanat', 'Art'], ['world', 'Dünyalar', 'Worlds'], ['retro', 'Retro', 'Retro'], ['wardrobe', 'Gardırop', 'Wardrobe'], ['hair', 'Saç', 'Hair']]

function AiFxPanel() {
  const tr = useT()
  const ok = useGemini()
  useWorkLifecycle()
  const [cat, setCat] = useState('trend')
  const [sel, setSel] = useState<string | null>(null)
  const run = async (id: string) => {
    const s = STYLES.find((x) => x.id === id)!
    setSel(id)
    if (!work.full) return
    if (s.local === 'anime') {
      const res = await busy(tr('Stil uygulanıyor…', 'Applying style…'), async () => {
        const src = work.full!
        const out = await animeStyle(src)
        return out
      })
      if (res) setWorkResult(res)
      return
    }
    if (!(await ensureCloud())) return
    const res = await busy(tr('Yapay zekâ çiziyor…', 'AI is drawing…'), () => geminiEdit(work.full!, s.prompt))
    if (res) setWorkResult(res)
  }
  return (
    <>
      {ok === false && <KeyCard />}
      <Tabs items={STYLE_CATS.map(([id, a, b]) => ({ id, label: tr(a, b) }))} value={cat} onChange={setCat} />
      <div className="presets">
        {STYLES.filter((s) => s.cat === cat).map((s) => (
          <Preset key={s.id} label={tr(s.label[0], s.label[1])} on={sel === s.id} onClick={() => run(s.id)} bg={s.local ? 'linear-gradient(160deg,#3a2a5a,#ffb547)' : 'linear-gradient(160deg,#2a2e36,#5a4a7a)'}>
            {s.local ? '⚡' : '✦'}
          </Preset>
        ))}
      </div>
      <p className="note">{tr('⚡ işaretliler bilgisayarında çalışır; ✦ işaretliler Gemini anahtarınla bulutta çalışır.', '⚡ runs on your computer; ✦ runs in the cloud with your Gemini key.')}</p>
      <WorkFooter type="style" params={{ style: sel }} />
    </>
  )
}

function AiOverlay({ view }: { view: View }) {
  return <WorkOverlayImage view={view} />
}

export const AI_TOOLS: ToolDef[] = [{ id: 'aiedit', label: ['YZ Editör', 'AI Editor'], icon: Wand2, Panel: AiEditorPanel, Overlay: AiOverlay, sourceSpace: true, noFooter: true }]
export const AIFX_TOOLS: ToolDef[] = [{ id: 'aifx', label: ['YZ efektleri', 'AI effects'], icon: Bot, Panel: AiFxPanel, Overlay: AiOverlay, sourceSpace: true, noFooter: true }]
void toCanvas
void session
