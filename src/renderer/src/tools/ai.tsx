import { IDENTITY_WARN, identityScores, restoreFaces } from '@/ai/identity'
import { useEffect, useState } from 'react'
import { Wand2, Bot, Send, ImagePlus, X, Cpu } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useT, useLang } from '@/lib/i18n'
import { Tabs, Preset, Switch } from '@/components/ui'
import { session } from '@/engine/session'
import { animeStyle, toCanvas } from '@/ai/ops'
import { engineStatus, localEdit, localEditKeepPeople } from '@/ai/generative'
import { restyle, type RestyleKind } from '@/ai/restyle'
import { platform } from '@/lib/platform'
import { goSettings } from '@/lib/projects'
import type { ToolDef, View } from './types'
import { WorkFooter, WorkOverlayImage, busy, setWorkResult, useWork, useWorkLifecycle, work } from './raster'

function useEngine() {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    engineStatus().then((s) => setOk(s.available))
  }, [])
  return ok
}

function EngineCard() {
  const tr = useT()
  return (
    <div className="card">
      <b><Cpu size={14} /> {tr('Yerel YZ motoru', 'Local AI engine')}</b>
      <p className="note">
        {tr(
          'Yazıyla düzenleme bilgisayarında FLUX.2 klein ile çalışır; internet ve ücret yok. İlk kullanımda motor ve model bir kez indirilir. Düzenleme senin ekran kartında 20–60 saniye sürebilir.',
          'Prompt editing runs on your computer with FLUX.2 klein — no internet, no fees. The engine and model download once on first use. An edit can take 20–60 seconds on your GPU.'
        )}
      </p>
    </div>
  )
}

// 4. alan: kişileri koru (yalnız arka plan değişir)
const QUICK: [string, string, string, boolean?][] = [
  ['Arka planı gün batımında bir plaja çevir', 'Change the background to a beach at sunset', '🏖️', true],
  ['Kişiyi doğal biçimde gülümset', 'Make the person smile naturally', '😊'],
  ['Kapalı gözleri doğal biçimde aç', 'Open closed eyes naturally', '👁️'],
  ['Arkadaki yabancı insanları kaldır', 'Remove the strangers in the background', '🚶'],
  ['Polaroid anlık fotoğraf gibi göster', 'Make it look like an instant Polaroid photo', '📷'],
  ['Sinematik, dramatik bir ışık ekle', 'Add cinematic, dramatic lighting', '🎬'],
  ['Manzarayı karlı bir kış gününe çevir', 'Turn the scene into a snowy winter day', '❄️', true],
  ['Kıyafeti şık siyah bir takım elbiseye çevir', 'Change the outfit to an elegant black suit', '🧥'],
  ['Saçı uzun ve dalgalı yap', 'Make the hair long and wavy', '💇'],
  ['Arkaya profesyonel stüdyo fonu koy (açık gri, yumuşak ışık)', 'Put a professional studio backdrop behind (light grey, soft light)', '🖼️', true],
  ['Flaşla çekilmiş gece fotoğrafı gibi yap', 'Make it look like a flash photo at night', '⚡'],
  ['Fotoğrafı eski, hasarlı bir fotoğraftan onarılmış gibi temizle ve renklendir', 'Restore and colorize as if repairing an old damaged photo', '🧽']
]

function AiEditorPanel() {
  const tr = useT()
  const lang = useLang()
  const ok = useEngine()
  useWorkLifecycle()
  const w = useWork()
  const [prompt, setPrompt] = useState('')
  const [refs, setRefs] = useState<{ url: string; bm: ImageBitmap }[]>([])
  const [history, setHistory] = useState<string[]>([])
  const [keep, setKeep] = useState(false)
  const [ident, setIdent] = useState<{ min: number; before: HTMLCanvasElement; res: HTMLCanvasElement } | null>(null)
  const run = async (text: string, keepPeople = keep) => {
    if (!text.trim() || !work.full) return
    try {
      const res = keepPeople
        ? await localEditKeepPeople(work.full, text.trim())
        : await localEdit(work.full, `${text.trim()}. Keep the person's identity, the composition and everything not mentioned unchanged. Photorealistic.`, refs.map((r) => r.bm))
      if (res) {
        setWorkResult(res)
        setHistory((h) => [text.trim(), ...h].slice(0, 6))
        setIdent(null)
        // kimlik ölçümü: yüz benzerliği düştüyse uyar ve yüzleri geri koymayı öner
        const before = work.full
        const faces = session.faces ?? []
        if (before && faces.length) void identityScores(before, res, faces).then((sc) => sc && setIdent({ min: Math.min(...sc), before, res })).catch(() => {})
      }
    } catch (e) {
      useEditor.getState().toast('error', tr('Düzenleme başarısız: ', 'Edit failed: ') + (e as Error).message)
    }
  }
  return (
    <>
      {ok === false ? <p className="note">{tr('Yerel YZ motoru yalnızca masaüstü uygulamasında çalışır.', 'The local AI engine only runs in the desktop app.')}</p> : <EngineCard />}
      <label className="field">
        <span>{tr('Ne yapmak istersin?', 'What should change?')}</span>
        <textarea className="textarea" value={prompt} placeholder={tr('Örn: arka plana sakura ağaçları ekle', 'e.g. add cherry blossom trees to the background')} onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void run(prompt) }} />
      </label>
      <div className="setting" style={{ padding: '4px 0' }}>
        <div><b>{tr('Kişileri koru', 'Keep people')}</b><span>{tr('Yalnız arka plan değişir; yüz ve kıyafet aynen kalır', 'Only the background changes; faces and clothes stay as they are')}</span></div>
        <Switch on={keep} onChange={setKeep} label={tr('Kişileri koru', 'Keep people')} />
      </div>
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
        <button className="btn sm primary" style={{ marginLeft: 'auto' }} disabled={!prompt.trim() || !ok} onClick={() => run(prompt)}><Send size={14} /> {tr('Oluştur', 'Generate')}</button>
      </div>
      <div className="group-label">{tr('Hazır komutlar', 'Quick prompts')}</div>
      <div className="stack">
        {QUICK.map(([a, b, e, protect]) => (
          <button key={a} className="btn sm wrap" style={{ justifyContent: 'flex-start' }} disabled={!ok} onClick={() => { const t = lang === 'en' ? b : a; setPrompt(t); setKeep(!!protect); void run(t, !!protect) }}>{e} {lang === 'en' ? b : a}</button>
        ))}
      </div>
      {!!history.length && (
        <>
          <div className="group-label">{tr('Son komutlar', 'Recent')}</div>
          {history.map((h) => <button key={h} className="link" style={{ display: 'block', marginBottom: 6 }} onClick={() => setPrompt(h)}>{h}</button>)}
        </>
      )}
      {ident && ident.min < IDENTITY_WARN && w.changed && (
        <div className="card" role="status">
          <b>{tr(`Yüz değişmiş olabilir (benzerlik %${Math.round(ident.min * 100)})`, `The face may have changed (similarity ${Math.round(ident.min * 100)}%)`)}</b>
          <p className="note">{tr('Yapay zekâ kişinin yüzünü değiştirmiş görünüyor. Düzenlemeyi koruyup orijinal yüzleri geri koyabilirsin.', 'The AI seems to have changed the person’s face. You can keep the edit and put the original faces back.')}</p>
          <button className="btn sm" onClick={() => { setWorkResult(restoreFaces(ident.before, ident.res, session.faces ?? [])); setIdent(null) }}>{tr('Yüzleri geri koy', 'Restore faces')}</button>
        </div>
      )}
      {w.changed && <p className="note">{tr('Sonucu beğenmezsen İptal ile geri dönebilir ya da yeni bir komutla üzerine devam edebilirsin.', 'Not happy? Cancel to go back, or keep refining with another prompt.')}</p>}
      <WorkFooter type="gen" params={{ prompt }} />
    </>
  )
}

export const STYLES: { id: string; cat: string; label: [string, string]; prompt: string; local?: 'anime' }[] = [
  { id: 'anime-local', cat: 'trend', label: ['Anime (yerel)', 'Anime (local)'], prompt: '', local: 'anime' },
  { id: 'anime', cat: 'trend', label: ['Anime', 'Anime'], prompt: 'Redraw this photo as a high quality modern anime illustration, clean line art, soft cel shading, keep the same pose, outfit and composition.' },
  { id: 'figure', cat: 'trend', label: ['3B figür', '3D figure'], prompt: 'Turn the person into a cute collectible 3D vinyl figure on a desk, glossy plastic, studio lighting, keep their outfit and hairstyle.' },
  { id: 'plush', cat: 'trend', label: ['Peluş', 'Plush'], prompt: 'Turn the subject into a soft knitted plush toy version, fuzzy yarn texture, same colors and pose.' },
  { id: 'clay', cat: 'trend', label: ['Kil animasyon', 'Claymation'], prompt: 'Restyle the whole image as stop-motion claymation: smooth matte plasticine figures with subtle handmade texture, warm studio lighting, keep the same pose and colors.' },
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
  { id: 'wardrobe-suit', cat: 'wardrobe', label: ['Takım elbise', 'Suit'], prompt: 'a tailored navy suit with a white shirt' },
  { id: 'wardrobe-dress', cat: 'wardrobe', label: ['Gece elbisesi', 'Evening dress'], prompt: 'an elegant black evening dress' },
  { id: 'wardrobe-street', cat: 'wardrobe', label: ['Sokak stili', 'Streetwear'], prompt: 'trendy streetwear with an oversized hoodie' },
  { id: 'hair-blonde', cat: 'hair', label: ['Sarı saç', 'Blonde'], prompt: 'natural honey blonde hair, same hairstyle' },
  { id: 'hair-pink', cat: 'hair', label: ['Pastel pembe', 'Pastel pink'], prompt: 'pastel pink hair, same hairstyle' },
  { id: 'hair-curly', cat: 'hair', label: ['Kıvırcık', 'Curly'], prompt: 'voluminous curly hair in the same color' },
  { id: 'hair-bob', cat: 'hair', label: ['Kısa küt', 'Short bob'], prompt: 'a short chin-length bob haircut in the same color' },
  { id: 'hair-black', cat: 'hair', label: ['Siyah', 'Black'], prompt: 'glossy jet black hair, same hairstyle' },
  { id: 'wardrobe-leather', cat: 'wardrobe', label: ['Deri ceket', 'Leather jacket'], prompt: 'a black leather biker jacket over a white t-shirt' },
  { id: 'wardrobe-knit', cat: 'wardrobe', label: ['Örgü kazak', 'Knit sweater'], prompt: 'a cozy cream cable-knit sweater' }
]
const STYLE_CATS: [string, string, string][] = [['trend', 'Öne çıkan', 'Trending'], ['art', 'Sanat', 'Art'], ['world', 'Dünyalar', 'Worlds'], ['retro', 'Retro', 'Retro'], ['wardrobe', 'Gardırop', 'Wardrobe'], ['hair', 'Saç', 'Hair']]

/** Stil kartı örneği: aynı kamu malı portreden önceden üretilmiş küçük görsel (public/style-previews). */
function StyleSample({ id, mark }: { id: string; mark: string }) {
  const [ok, setOk] = useState(true)
  return ok ? (
    <span style={{ position: 'relative', width: '100%', height: '100%', display: 'block' }}>
      <img src={`style-previews/${id}.jpg`} alt="" draggable={false} onError={() => setOk(false)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <span style={{ position: 'absolute', right: 4, bottom: 2, fontSize: 12, textShadow: '0 1px 2px #000' }}>{mark}</span>
    </span>
  ) : <>{mark}</>
}

function AiFxPanel() {
  const tr = useT()
  const ok = useEngine()
  useWorkLifecycle()
  const [cat, setCat] = useState('trend')
  const [sel, setSel] = useState<string | null>(null)
  // AnimeGANv2 yalnız kişisel kullanım lisanslı: izin verilmediyse yerel anime stili gösterilmez
  const personal = useEditor((st) => !!st.settings.personalModels)
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
    try {
      const kind: RestyleKind | null = s.cat === 'hair' ? 'hair' : s.cat === 'wardrobe' ? 'outfit' : null
      const res = kind ? await restyleSafe(kind, s.prompt) : await localEdit(work.full, s.prompt)
      if (res) setWorkResult(res)
    } catch (e) {
      useEditor.getState().toast('error', tr('Stil uygulanamadı: ', 'Style failed: ') + (e as Error).message)
    }
  }
  const restyleSafe = async (kind: RestyleKind, what: string) => {
    try {
      return await restyle(work.full!, kind, what)
    } catch (e) {
      const m = (e as Error).message
      if (m === 'no-hair' || m === 'no-outfit') {
        useEditor.getState().toast('error', m === 'no-hair' ? tr('Fotoğrafta saç bulunamadı.', 'No hair found in the photo.') : tr('Fotoğrafta kıyafet bulunamadı.', 'No clothing found in the photo.'))
        return null
      }
      throw e
    }
  }
  const [custom, setCustom] = useState('')
  const kindNow: RestyleKind | null = cat === 'hair' ? 'hair' : cat === 'wardrobe' ? 'outfit' : null
  return (
    <>
      {ok === false ? <p className="note">{tr('Yerel YZ motoru yalnızca masaüstü uygulamasında çalışır.', 'The local AI engine only runs in the desktop app.')}</p> : <EngineCard />}
      <Tabs items={STYLE_CATS.map(([id, a, b]) => ({ id, label: tr(a, b) }))} value={cat} onChange={setCat} />
      {kindNow && (
        <>
          <p className="note">{kindNow === 'hair'
            ? tr('Yalnız saç yeniden çizilir; yüzün ve arka plan piksel piksel aynı kalır.', 'Only the hair is redrawn; the face and background stay pixel-identical.')
            : tr('Yalnız kıyafet yeniden çizilir; yüz, saç ve arka plan piksel piksel aynı kalır.', 'Only the clothes are redrawn; face, hair and background stay pixel-identical.')}</p>
          <form className="row" style={{ gap: 6, marginBottom: 8 }} onSubmit={(e) => { e.preventDefault(); const w = custom.trim(); if (w && work.full) { setSel(null); void restyleSafe(kindNow, w).then((r) => r && setWorkResult(r)).catch((er) => useEditor.getState().toast('error', String((er as Error).message))) } }}>
            <input className="input" style={{ flex: 1 }} value={custom} onChange={(e) => setCustom(e.target.value)}
              placeholder={kindNow === 'hair' ? tr('Kendi tarifin: ör. dalgalı kızıl saç', 'Your own: e.g. wavy red hair') : tr('Kendi tarifin: ör. kırmızı ekose gömlek', 'Your own: e.g. red plaid shirt')}
              aria-label={tr('Kendi tarifin', 'Your own description')} />
            <button className="btn sm primary" type="submit" disabled={!custom.trim()}>{tr('Uygula', 'Apply')}</button>
          </form>
        </>
      )}
      <div className="presets">
        {STYLES.filter((s) => s.cat === cat && (s.local !== 'anime' || personal)).map((s) => (
          <Preset key={s.id} label={tr(s.label[0], s.label[1])} on={sel === s.id} onClick={() => run(s.id)} bg={s.local ? 'linear-gradient(160deg,#3a2a5a,#ffb547)' : 'linear-gradient(160deg,#2a2e36,#5a4a7a)'}>
            <StyleSample id={s.id} mark={s.local ? '⚡' : '✦'} />
          </Preset>
        ))}
      </div>
      <p className="note">{tr('⚡ anında çalışan hafif model; ✦ FLUX.2 klein ile daha ayrıntılı (daha uzun sürer). Hepsi bilgisayarında.', '⚡ instant lightweight model; ✦ more detailed with FLUX.2 klein (takes longer). All on your computer.')}</p>
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
