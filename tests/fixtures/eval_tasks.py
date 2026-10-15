# Görsel eleştirmen ajanı için görev dosyaları: dev-models/eval/out/ajan/gorev-<bölüm>.json
#   python tests/fixtures/eval_tasks.py
# Her görevde: puanlanacak anahtarlar (karşılaştırma sayfasıyla aynı), görseller ve panel düzeni.
# Ölçüm sayıları (kimlik, dB) bilerek verilmez: ajan önce gözüyle karar versin.
import json, os

ROOT = os.path.abspath('.')
OUT = os.path.join(ROOT, 'dev-models', 'eval', 'out')
SETD = os.path.join(ROOT, 'dev-models', 'eval', 'set')
AJ = os.path.join(OUT, 'ajan')
os.makedirs(AJ, exist_ok=True)
SET = {m['id']: m for m in json.load(open(os.path.join(SETD, 'set.json'), encoding='utf-8'))}


def load(n):
    p = os.path.join(OUT, n + '.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else []


def P(*a):
    return os.path.join(*a).replace('\\', '/')


def item(id_, **kw):
    return {'foto': id_, 'zorluk': SET.get(id_, {}).get('why', ''), 'asil': P(SETD, id_ + '.jpg'), **kw}


tasks = {}

# kesim: iki ayrı dosya (dama tahtası üstünde konu), asıl fotoğrafla karşılaştır
tasks['kesim'] = {
    'arac': 'Arka plan kesme',
    'olcut': 'Konu eksiksiz mi (saç teli, tüy, parmak, ince nesneler), arka plandan parça/hayalet kalmış mı, kenar yumuşak ve doğru mu? Hangi nesnenin "konu" olduğuna fotoğrafın amacına göre karar ver.',
    'isler': [item(r['id'], dosyalar={m: P(OUT, 'cutout', f"{r['id']}__{m}.jpg") for m in ['isnet', 'birefnet']},
                   anahtarlar={'isnet': f"cutout|{r['id']}|isnet", 'birefnet': f"cutout|{r['id']}|birefnet"})
              for r in load('cutout') if r['model'] == 'isnet'],
}

tasks['kalite-derinlik'] = {
    'arac': 'Kalite artırma (4×) ve derinlik haritası',
    'olcut': 'KALİTE: şeritte 4 panel: 0 asıl, 1 bikübik, 2 Real-ESRGAN, 3 UltraSharp V2. 2 ve 3\'ü asılla karşılaştır: ayrıntı geri gelmiş mi, uydurma doku/yağlı boya/plastik görünüm, halo, aşırı keskinlik var mı, yazılar okunur mu. DERİNLİK: şeritte 3 panel: 0 foto, 1 Small, 2 Base; açık = yakın. Yakın/uzak sırası doğru mu, konu kenarları keskin mi, arka plan tutarlı mı.',
    'isler': [item(r['id'], tur='kalite', serit=P(OUT, 'upscale', r['id'] + '.jpg'), panel_sayisi=4,
                   paneller={'esrgan': 2, 'ultrasharp': 3}, referans_panel=0,
                   anahtarlar={'esrgan': f"upscale|{r['id']}|esrgan", 'ultrasharp': f"upscale|{r['id']}|ultrasharp"})
              for r in load('upscale') if not r.get('err')]
             + [item(r['id'], tur='derinlik', serit=P(OUT, 'depth', r['id'] + '.jpg'), panel_sayisi=3,
                     paneller={'small': 1, 'base': 2}, referans_panel=0,
                     anahtarlar={'small': f"depth|{r['id']}|small", 'base': f"depth|{r['id']}|base"})
                for r in load('depth') if not r.get('err')],
}

R2 = [('codeformer', 2), ('codeformer-w@0.5', 3), ('codeformer-w@0.9', 4), ('gfpgan', 5), ('gpen', 6), ('restoreformer', 7)]
for deg in ['hafif', 'agir']:
    tasks[f'yuz-{deg}'] = {
        'arac': 'Yüz onarma (bulanık/bozuk yüzü netleştirme)',
        'olcut': 'Şeritte 8 panel: 0 temiz asıl, 1 bozulmuş girdi, 2–7 onarıcılar. Her onarıcıyı 0 (asıl) ve 1 (girdi) ile karşılaştır. EN ÖNEMLİ: kişi hâlâ aynı kişi mi (göz şekli/rengi, burun, dudak, yaş, ifade, ten rengi)? Sonra: gerçekten netleşmiş mi, plastik/boyalı cilt, yapay göz parlaması, yüz ile saç/boyun arasında dikiş, yüzün geri kalanla uyumu. Netleştirip kişiyi değiştiren onarıcı düşük puan alır.',
        'isler': [item(r['id'], serit=P(OUT, 'restore2', f"{r['id']}__{deg}.jpg"), panel_sayisi=8, paneller=dict(R2), referans_panel=0, girdi_panel=1,
                       anahtarlar={v: f"restore2|{r['id']}__{deg}|{v}" for v, _ in R2})
                  for r in load('restore2') if r.get('deg') == deg and not r.get('err')],
    }
# eski CodeFormer karışım ölçümü (0,5 / 0,8 / 1) — hafif bölüme ek
tasks['yuz-hafif']['isler'] += [item(r['id'], serit=P(OUT, 'restore', r['id'] + '.jpg'), panel_sayisi=5, paneller={'0.5': 2, '0.8': 3, '1': 4}, referans_panel=0, girdi_panel=1,
                                     anahtarlar={b: f"restore|{r['id']}|{b}" for b in ['0.5', '0.8', '1']}, not_='şu anki CodeFormer, asılla karışım oranları 0,5 / 0,8 / 1')
                                for r in load('restore') if not r.get('err')]

PROMPTS = {'arka-plan': 'Arka planı karlı dağ manzarası yap; kişi, yüz, saç ve kıyafet aynen kalsın.', 'studyo': 'Profesyonel stüdyo portresi yap: yumuşak eşit ışık, açık gri fon; yüz ve kimlik aynen kalsın.'}
f4 = {(r['id'], r['prompt']) for r in load('flux4')}
tasks['flux-sohbet'] = {
    'arac': 'YZ Editör (FLUX.2 klein 4B ve 9B) + stil danışmanı',
    'olcut': 'FLUX: istenen değişiklik yapılmış mı, kişi aynı kişi mi (yüz, ten, yaş, saç), sonuç gerçekçi mi (eller, kulak, gözlük, kenarlar, ışık tutarlılığı, yapay pürüzsüzlük)? 4B ve 9B\'yi ayrı ayrı puanla. SOHBET: soru, cevap ve fotoğraf verilir; fotoğrafı doğru görmüş mü, öneri somut ve doğru mu, Türkçesi düzgün mü, gereksiz uzun mu?',
    'isler': [item(i, tur='flux', komut=PROMPTS[p], dosyalar={q: P(OUT, q, f'{i}__{p}.jpg') for q in ['flux4', 'flux9']},
                   anahtarlar={q: f'flux|{i}|{p}|{q}' for q in ['flux4', 'flux9']}) for i, p in sorted(f4)]
             + [item(r['id'], tur='sohbet', soru=r['q'], cevap=r.get('text', ''), anahtarlar={'cevap': f"vlm|{r['id']}"}) for r in load('vlm')],
}

tasks['silme'] = {
    'arac': 'Nesne silme',
    'olcut': 'Şeritte 3 panel: 0 asıl (silinecek alan pembe çerçeveli), 1 LaMa, 2 FLUX (erase) ya da LaMa+FLUX (erase2). Çerçevedeki nesne gerçekten gitmiş mi, yerine gelen doku doğal mı, bulanık leke/hayalet/tekrar desen/dikiş/renk farkı var mı, çevre bozulmuş mu? Hiçbir şey silmeyen sonuç 1 alır.',
    'isler': [item(r['id'], tur='erase', alan=r['name'], serit=P(OUT, 'erase', f"{r['id']}__{r['name']}.jpg"), panel_sayisi=3, paneller={'lama': 1, 'flux': 2}, referans_panel=0,
                   anahtarlar={'lama': f"erase|{r['id']}__{r['name']}|lama", 'flux': f"erase|{r['id']}__{r['name']}|flux"}) for r in load('erase') if not r.get('err')]
             + [item(r['id'], tur='erase2', alan=r['name'], serit=P(OUT, 'erase2', f"{r['id']}__{r['name']}.jpg"), panel_sayisi=3, paneller={'lama': 1, 'gen': 2}, referans_panel=0,
                     anahtarlar={'lama': f"erase2|{r['id']}__{r['name']}|lama", 'gen': f"erase2|{r['id']}__{r['name']}|gen"}) for r in load('erase2') if not r.get('err')],
}

for k, t in tasks.items():
    t['bolum'] = k
    t['cikti'] = P(AJ, k + '.json')
    t['yardimci'] = P(ROOT, 'tests', 'fixtures', 'panel.py')
    t['python'] = P(ROOT, 'dev-models', 'engine', 'python', 'python.exe')
    t['calisma_klasoru'] = P(AJ, 'kirpim', k)
    json.dump(t, open(os.path.join(AJ, f'gorev-{k}.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(k, len(t['isler']), 'iş,', sum(len(i['anahtarlar']) for i in t['isler']), 'puan')
