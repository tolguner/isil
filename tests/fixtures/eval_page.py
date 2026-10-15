# Aşama 2 karşılaştırma sayfası: dev-models/eval/out/*.json + görseller → dev-models/eval/out/index.html
#   python tests/fixtures/eval_page.py
# Puanlar tarayıcının localStorage'ına yazılır ("isil-eval" anahtarı); sayfadaki düğmeyle JSON olarak kopyalanır.
import html, json, os

OUT = 'dev-models/eval/out'
SET = {m['id']: m for m in json.load(open('dev-models/eval/set/set.json', encoding='utf-8'))}


def load(name):
    p = os.path.join(OUT, name + '.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else []


def esc(s):
    return html.escape(str(s))


# görsel eleştirmen ajanının puanları (dev-models/eval/out/ajan/<bölüm>.json)
AGENT, AGENT_SUM = {}, {}
AJ = os.path.join(OUT, 'ajan')
if os.path.isdir(AJ):
    for f in sorted(os.listdir(AJ)):
        if f.endswith('.json') and not f.startswith('gorev-'):
            try:
                d = json.load(open(os.path.join(AJ, f), encoding='utf-8'))
            except Exception:
                continue
            AGENT.update(d.get('puanlar', {}))
            AGENT_SUM[d.get('bolum', f[:-5])] = d.get('ozet', '')


def rate(key):
    a = AGENT.get(key) or {}
    ap, an = a.get('puan'), a.get('not', '')
    badge = f'<span class="ai" title="{esc(an)}">ajan {ap if ap is not None else "–"}</span>' if a else '<span class="ai none">ajan –</span>'
    note = f'<span class="ainote">{esc(an)}</span>' if an else ''
    return (f'<div class="rate" data-k="{esc(key)}" data-ai="{ap if ap is not None else ""}">{badge}'
            + ''.join(f'<button data-v="{i}">{i}</button>' for i in range(1, 6)) + f'</div>{note}')


def why(id_):
    m = SET.get(id_, {})
    return f'<span class="why">{esc(m.get("why", ""))}</span>'


sections = []

# --- kesim
rows = {}
for r in load('cutout'):
    rows.setdefault(r['id'], {})[r['model']] = r
cards = []
for id_, ms in rows.items():
    cols = ''
    for model, label in [('isnet', 'ISNet (standart)'), ('birefnet', 'BiRefNet (detaylı, motor)')]:
        r = ms.get(model, {})
        f = f'cutout/{id_}__{model}.jpg'
        img = f'<img loading="lazy" src="{f}">' if os.path.exists(os.path.join(OUT, f)) else '<div class="miss">yok</div>'
        cols += f'<figure>{img}<figcaption>{label} · {r.get("ms", "-")} ms</figcaption>{rate(f"cutout|{id_}|{model}")}</figure>'
    cards.append(f'<article><h3>{esc(id_)} {why(id_)}</h3><div class="row">{cols}</div></article>')
sections.append(('kesim', 'Arka plan kesme', 'Saç teli, tüy ve ince kenarlara bakın; konunun bir parçası kesilmiş mi, arka plandan parça kalmış mı?', cards))

# --- kalite artırma
cards = []
for r in load('upscale'):
    p = r.get('psnr') or {}
    cards.append(f'<article><h3>{esc(r["id"])} {why(r["id"])}</h3><img class="wide" loading="lazy" src="upscale/{r["id"]}.jpg">'
                 f'<p class="cap">soldan sağa: <b>asıl</b> · bikübik ({p.get("bicubic")} dB) · Real-ESRGAN ({p.get("esrgan")} dB, {(r.get("ms") or {}).get("esrgan")} ms) · UltraSharp V2 ({p.get("ultrasharp")} dB, {(r.get("ms") or {}).get("ultrasharp")} ms)</p>'
                 f'<div class="row2"><span>Real-ESRGAN</span>{rate("upscale|" + r["id"] + "|esrgan")}<span>UltraSharp V2</span>{rate("upscale|" + r["id"] + "|ultrasharp")}</div></article>')
sections.append(('kalite', 'Kalite artırma (4×)', '384 px kırpım 4 kat küçültülüp yeniden büyütüldü; asıla en yakın ve en doğal görünen hangisi? dB yüksekse piksel olarak asla daha yakın (ama doğallığı ölçmez).', cards))

# --- yüz onarma
cards = []
for r in load('restore'):
    if r.get('err'):
        continue
    d = r.get('degraded', {})
    parts = ' · '.join(f'karışım {b}: kimlik {r[k]["sim"]}, {r[k]["psnr"]} dB' for b, k in [('0,5', 'b0.5'), ('0,8', 'b0.8'), ('1', 'b1')] if k in r)
    cards.append(f'<article><h3>{esc(r["id"])} {why(r["id"])}</h3><img class="wide" loading="lazy" src="restore/{r["id"]}.jpg">'
                 f'<p class="cap">soldan sağa: <b>temiz</b> · bozulmuş (kimlik {d.get("sim")}, {d.get("psnr")} dB) · CodeFormer karışım 0,5 · 0,8 · 1<br>{parts}</p>'
                 f'<div class="row2"><span>0,5</span>{rate("restore|" + r["id"] + "|0.5")}<span>0,8</span>{rate("restore|" + r["id"] + "|0.8")}<span>1</span>{rate("restore|" + r["id"] + "|1")}</div></article>')
sections.append(('yuz', 'Yüz onarma (CodeFormer)', 'Kimlik: 1 = aynı kişi, 0,4 altı = başka biri gibi. Yüz netleşirken kişi hâlâ kendisi gibi mi?', cards))

# --- yüz onarma adayları
cards = []
VAR = [('codeformer', 'CodeFormer (şu anki)'), ('codeformer-w@0.5', 'CodeFormer sadakat 0,5'), ('codeformer-w@0.9', 'CodeFormer sadakat 0,9'), ('gfpgan', 'GFPGAN 1.4'), ('gpen', 'GPEN-BFR 512'), ('restoreformer', 'RestoreFormer++')]
for r in load('restore2'):
    if r.get('err'):
        continue
    k = f'{r["id"]}__{r["deg"]}'
    caps = ' · '.join(f'{lab}: {r[v]["sim"]}' for v, lab in VAR if v in r)
    rates = ''.join(f'<span>{lab}</span>{rate("restore2|" + k + "|" + v)}' for v, lab in VAR)
    cards.append(f'<article><h3>{esc(r["id"])} · {"hafif" if r["deg"] == "hafif" else "ağır"} bozulma</h3><img class="wide" loading="lazy" src="restore2/{k}.jpg">'
                 f'<p class="cap">soldan sağa: <b>temiz</b> · bozulmuş (kimlik {r.get("bozuk", {}).get("sim")}) · {" · ".join(l for _, l in VAR)}<br>kimlik: {caps}</p><div class="row2">{rates}</div></article>')
sections.append(('yuz2', 'Yüz onarma adayları', 'Hangisi yüzü netleştirirken kişiyi kendisi gibi bırakıyor? Kimlik 1’e ne kadar yakınsa o kadar aynı kişi.', cards))

# --- üretken silme
cards = []
for r in load('erase2'):
    if r.get('err'):
        continue
    ms = r.get('ms') or {}
    k = f'{r["id"]}__{r["name"]}'
    cards.append(f'<article><h3>{esc(r["id"])} · {esc(r["name"])}</h3><img class="wide" loading="lazy" src="erase2/{k}.jpg">'
                 f'<p class="cap">işaretli alan · LaMa, GPU ({ms.get("lama")} ms) · LaMa ile doldur + FLUX rötuş ({ms.get("gen")} ms)</p>'
                 f'<div class="row2"><span>LaMa</span>{rate("erase2|" + k + "|lama")}<span>LaMa + FLUX</span>{rate("erase2|" + k + "|gen")}</div></article>')
sections.append(('silme2', 'Üretken silme', 'Büyük alanlarda iz kalıyor mu, yerine gelen sahne doğal mı?', cards))

# --- derinlik
cards = []
for r in load('depth'):
    if r.get('err'):
        continue
    ms = r.get('ms') or {}
    cards.append(f'<article><h3>{esc(r["id"])}</h3><img class="wide" loading="lazy" src="depth/{r["id"]}.jpg">'
                 f'<p class="cap">foto · Depth V2 Small ({ms.get("depth-small")} ms, tarayıcı) · Depth V2 Base ({ms.get("depth")} ms, motor) — açık = yakın</p>'
                 f'<div class="row2"><span>Small</span>{rate("depth|" + r["id"] + "|small")}<span>Base</span>{rate("depth|" + r["id"] + "|base")}</div></article>')
sections.append(('derinlik', 'Derinlik (ışıklandırma, odak)', 'Kenarlar keskin mi, yakın/uzak sırası doğru mu?', cards))

# --- silme
cards = []
for r in load('erase'):
    if r.get('err'):
        continue
    ms = r.get('ms') or {}
    k = f'{r["id"]}__{r["name"]}'
    cards.append(f'<article><h3>{esc(r["id"])} · {esc(r["name"])}</h3><img class="wide" loading="lazy" src="erase/{k}.jpg">'
                 f'<p class="cap">işaretli alan · LaMa ({ms.get("lama")} ms) · FLUX.2 klein inpaint ({ms.get("flux")} ms)</p>'
                 f'<div class="row2"><span>LaMa</span>{rate("erase|" + k + "|lama")}<span>FLUX</span>{rate("erase|" + k + "|flux")}</div></article>')
sections.append(('silme', 'Nesne silme', 'Silinen yerde iz, bulanık leke ya da tuhaf bir nesne kaldı mı?', cards))

# --- FLUX 4B / 9B
f4 = {(r['id'], r['prompt']): r for r in load('flux4')}
f9 = {(r['id'], r['prompt']): r for r in load('flux9')}
cards = []
for key in sorted(set(f4) | set(f9)):
    id_, pn = key
    cols = f'<figure><img loading="lazy" src="../set/{id_}.jpg"><figcaption>asıl</figcaption></figure>'
    for q, d, label in [('flux4', f4, '4B (hızlı)'), ('flux9', f9, '9B (en iyi)')]:
        r = d.get(key, {})
        f = f'{q}/{id_}__{pn}.jpg'
        img = f'<img loading="lazy" src="{f}">' if os.path.exists(os.path.join(OUT, f)) else '<div class="miss">yok</div>'
        cols += f'<figure>{img}<figcaption>{label} · kimlik {r.get("sim")} · {round((r.get("ms") or 0) / 1000)} sn</figcaption>{rate(f"flux|{id_}|{pn}|{q}")}</figure>'
    cards.append(f'<article><h3>{esc(id_)} · {esc(pn)}</h3><div class="row">{cols}</div></article>')
sections.append(('flux', 'YZ Editör (FLUX.2 klein)', 'İstenen değişiklik yapılmış mı, kişi hâlâ aynı kişi mi, sonuç gerçekçi mi?', cards))

# --- sohbet
cards = []
for r in load('vlm'):
    cards.append(f'<article class="chat"><img loading="lazy" src="../set/{r["id"]}.jpg"><div><p class="q">{esc(r["q"])}</p><p class="a">{esc(r.get("text") or r.get("err"))}</p>'
                 f'<p class="cap">{round((r.get("ms") or 0) / 1000)} sn</p>{rate("vlm|" + r["id"])}</div></article>')
sections.append(('sohbet', 'Stil danışmanı (Qwen3-VL 4B)', 'Fotoğrafı doğru görmüş mü, önerisi somut ve yerinde mi?', cards))

credits = ''.join(f'<li>{esc(m["id"])}: <a href="{esc(m["page"])}">{esc(m.get("title", ""))}</a> — {esc(m["artist"])} · {esc(m["license"])}</li>' for m in SET.values() if m.get('page'))

nav = ''.join(f'<a href="#{k}">{esc(t)} <small>({len(c)})</small></a>' for k, t, _, c in sections)
SUMMAP = {'kesim': ['kesim'], 'kalite': ['kalite-derinlik'], 'derinlik': ['kalite-derinlik'], 'yuz': ['yuz-hafif'], 'yuz2': ['yuz-hafif', 'yuz-agir'], 'silme': ['silme'], 'silme2': ['silme'], 'flux': ['flux-sohbet'], 'sohbet': ['flux-sohbet']}
def summ(k):
    parts = [AGENT_SUM[b] for b in SUMMAP.get(k, []) if AGENT_SUM.get(b)]
    return ''.join(f'<div class="aisum"><b>Ajanın özeti:</b> {esc(x)}</div>' for x in dict.fromkeys(parts))
body = ''.join(f'<section id="{k}"><h2>{esc(t)}</h2><p class="hint">{esc(h)}</p>{summ(k)}{"".join(c) or "<p>sonuç yok</p>"}</section>' for k, t, h, c in sections)

page = f'''<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Işıl YZ kalite ölçümü</title>
<style>
:root {{ --bg:#0f1012; --s:#17191d; --s2:#20232a; --t:#eceef2; --m:#9aa0ab; --a:#f5a524; }}
* {{ box-sizing:border-box }}
body {{ margin:0; background:var(--bg); color:var(--t); font:14px/1.5 system-ui,Segoe UI,sans-serif }}
header {{ position:sticky; top:0; z-index:2; background:#0f1012ee; backdrop-filter:blur(6px); border-bottom:1px solid #2a2d33; padding:10px 16px; display:flex; gap:14px; flex-wrap:wrap; align-items:center }}
header b {{ margin-right:8px }} header a {{ color:var(--t); text-decoration:none; opacity:.8 }} header a:hover {{ opacity:1 }}
#done {{ margin-left:auto; color:var(--m) }} button.copy {{ background:var(--a); color:#111; border:0; border-radius:6px; padding:6px 10px; font-weight:600; cursor:pointer }}
main {{ max-width:1500px; margin:0 auto; padding:16px }}
section h2 {{ margin:28px 0 4px }} .hint {{ color:var(--m); margin:0 0 12px }}
article {{ background:var(--s); border-radius:10px; padding:12px; margin:0 0 14px }}
article h3 {{ margin:0 0 8px; font-size:14px }} .why {{ color:var(--m); font-weight:400; margin-left:6px }}
.row {{ display:flex; gap:10px; flex-wrap:wrap }} figure {{ margin:0; flex:1 1 280px; max-width:480px }}
figure img, img.wide {{ width:100%; border-radius:6px; display:block; background:#000 }} img.wide {{ max-height:520px; object-fit:contain }}
figcaption, .cap {{ color:var(--m); font-size:12px; margin:6px 0 }}
.row2 {{ display:flex; gap:10px; align-items:center; flex-wrap:wrap }} .row2 span {{ color:var(--m); font-size:12px; min-width:70px }}
.rate {{ display:inline-flex; gap:4px }} .rate button {{ width:30px; height:28px; border-radius:6px; border:1px solid #333842; background:var(--s2); color:var(--t); cursor:pointer }}
.rate button.on {{ background:var(--a); color:#111; border-color:var(--a); font-weight:700 }}
.ai {{ font-size:12px; padding:3px 8px; border-radius:6px; background:#2a3550; color:#cfe0ff; margin-right:6px; white-space:nowrap }} .ai.none {{ opacity:.4 }}
.rate button.aipick {{ box-shadow: inset 0 0 0 2px #6fa3ff }}
.ainote {{ display:block; color:#b9c6e4; font-size:12px; margin:4px 0 8px }}
.aisum {{ background:#1b2233; border-left:3px solid #6fa3ff; padding:8px 12px; border-radius:6px; margin:0 0 12px; color:#d6e2ff }}
body.lowonly article {{ display:none }} body.lowonly article.low {{ display:block }}
.miss {{ height:200px; display:grid; place-items:center; background:#000; color:var(--m); border-radius:6px }}
.chat {{ display:grid; grid-template-columns:220px 1fr; gap:14px }} .chat img {{ width:100%; border-radius:6px }} .q {{ font-weight:600 }} .a {{ white-space:pre-wrap }}
footer {{ color:var(--m); font-size:12px; padding:20px 16px 60px; max-width:1500px; margin:0 auto }} footer a {{ color:var(--m) }}
@media (max-width:700px) {{ .chat {{ grid-template-columns:1fr }} }}
</style></head><body>
<header><b>Işıl · YZ kalite ölçümü</b>{nav}<span id="done"></span><label style="color:var(--m)"><input type="checkbox" id="lowonly"> yalnız ajanın ≤2 verdikleri</label><button class="copy" id="copy">Puanları kopyala</button></header>
<main><p class="hint">Mavi "ajan" etiketi ve mavi çerçeveli düğme görsel eleştirmen ajanının puanı; altındaki not gerekçesi. Katılmıyorsan kendi puanına bas (turuncu) — senin puanın ajanınkini geçersiz kılar, tekrar basınca kalkar. Bitince "Puanları kopyala" ile buraya yapıştır.</p>{body}</main>
<footer><b>Deneme seti kaynakları</b> (Wikimedia Commons; yalnız ölçüm için, uygulamaya girmez)<ul>{credits}</ul></footer>
<script>
const K = 'isil-eval'
const load = () => {{ try {{ return JSON.parse(localStorage.getItem(K) || '{{}}') }} catch {{ return {{}} }} }}
const save = (s) => {{ try {{ localStorage.setItem(K, JSON.stringify(s)) }} catch {{}} }}
const st = load()
const all = document.querySelectorAll('.rate')
const paint = () => {{
  all.forEach((r) => r.querySelectorAll('button').forEach((b) => {{ b.classList.toggle('on', st[r.dataset.k] === +b.dataset.v); b.classList.toggle('aipick', r.dataset.ai !== '' && +r.dataset.ai === +b.dataset.v) }}))
  const ai = [...all].filter((r) => r.dataset.ai !== '').length
  const diff = Object.keys(st).filter((k) => {{ const r = document.querySelector(`.rate[data-k="${{CSS.escape(k)}}"]`); return r && r.dataset.ai !== '' && +r.dataset.ai !== st[k] }}).length
  document.getElementById('done').textContent = `ajan ${{ai}}/${{all.length}} · sen ${{Object.keys(st).length}} (${{diff}} farklı)`
}}
document.querySelectorAll('article').forEach((a) => {{ if ([...a.querySelectorAll('.rate')].some((r) => r.dataset.ai !== '' && +r.dataset.ai <= 2)) a.classList.add('low') }})
document.getElementById('lowonly').onchange = (e) => document.body.classList.toggle('lowonly', e.target.checked)
all.forEach((r) => r.addEventListener('click', (e) => {{ const v = +e.target.dataset.v; if (!v) return; if (st[r.dataset.k] === v) delete st[r.dataset.k]; else st[r.dataset.k] = v; save(st); paint() }}))
document.getElementById('copy').onclick = async () => {{ const t = JSON.stringify(Object.fromEntries([...all].map((r) => [r.dataset.k, {{ ajan: r.dataset.ai === '' ? null : +r.dataset.ai, tolga: st[r.dataset.k] ?? null }}]).filter(([, v]) => v.tolga !== null)), null, 1); try {{ await navigator.clipboard.writeText(t); alert('Kopyalandı (' + Object.keys(st).length + ' puan)') }} catch {{ prompt('Kopyalayın:', t) }} }}
window.__ratings = () => st
paint()
</script></body></html>'''
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(page)
print('yazıldı', sum(len(c) for _, _, _, c in sections), 'kart')
