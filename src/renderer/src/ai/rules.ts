// Saf kurallar (tarayıcı ve model gerektirmez; birim testleri tests/unit altında):
// komut engeli ve yaş kapısı yanıtının yorumu.

// Kötüye kullanım koruması, 1. katman: üretken düzenlemeye giden komutlarda çıplaklık, soyma ve cinsel içerik
// istekleri engellenir. Türkçe ve İngilizce; büyük-küçük harf, Türkçe karakterler ve basit harf oyunları
// (n.u.d.e, nud3) normalize edilir. Bu liste tek başına yeterli değildir; çıktı denetimi ve yaş denetimi ayrı katmanlar.

/** Türkçe karakterleri sadeleştir, rakam-harf oyunlarını çöz, noktalama ve tekrarları kaldır. */
export function normalizePrompt(s: string) {
  return s
    .toLocaleLowerCase('tr')
    .replace(/[ıİ]/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/7/g, 't').replace(/@/g, 'a').replace(/\$/g, 's')
    .replace(/(\w)[.\-_*]+(?=\w)/g, '$1') // n.u.d.e → nude
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// kelime kökleri (normalize edilmiş metinde kelime başında aranır)
const BLOCK = [
  // İngilizce
  'nude', 'nudity', 'naked', 'undress', 'unclothe', 'strip', 'topless', 'bottomless', 'nsfw', 'porn', 'xxx', 'sexual', 'sexy', 'erotic', 'lingerie',
  'underwear', 'bra', 'panties', 'thong', 'bikini', 'nipple', 'breast', 'boob', 'boobs', 'tits', 'genital', 'penis', 'vagina', 'pussy', 'butt naked', 'see through',
  'transparent clothes', 'wet shirt', 'no clothes', 'without clothes', 'remove clothes', 'remove her clothes', 'remove his clothes', 'take off', 'onlyfans', 'fetish', 'bdsm',
  // Türkçe (normalize: ç→c, ş→s, ı→i, ğ→g, ö→o, ü→u)
  'ciplak', 'cipla', 'soy', 'soyma', 'soymak', 'soyar', 'soyun', 'soyul', 'kiyafetsiz', 'kiyafetini cikar', 'kiyafetlerini cikar', 'elbisesiz', 'ustsuz', 'altsiz', 'meme', 'memeler', 'memeleri', 'gogus', 'gogus ucu',
  'ic camasir', 'icamasir', 'sutyen', 'kulot', 'tanga', 'bikini', 'mayo', 'seffaf kiyafet', 'transparan', 'erotik', 'seksi', 'seks', 'cinsel', 'porno', 'mustehcen',
  'genital', 'penis', 'vajina', 'am', 'kalca acik', 'dekolte'
]

// 4 harf ve kısa olanlar yalnız tam kelime olarak eşleşir (bra ≠ bracelet, soy ≠ soyadı); uzunlar kelime başında kök
// olarak (nude → nudes, undress → undressed). Masum kalıplar ayrıca izinli.
const ALLOW = ['take off the glasses', 'take off glasses', 'take off the hat', 'take off hat', 'take off the jacket', 'take off jacket', 'striped', 'stripes', 'comic strip']

/** Komut engellenmeli mi? Engellenirse nedenini (eşleşen ifade) döndürür. */
export function blockedPrompt(prompt: string): string | null {
  let t = ' ' + normalizePrompt(prompt) + ' '
  for (const a of ALLOW) t = t.split(' ' + a + ' ').join(' _ ')
  for (const w of BLOCK) {
    const key = w.trim()
    if (t.includes(key.length <= 4 ? ' ' + key + ' ' : ' ' + key)) return key
  }
  return null
}

/** Yanıtı karara çevir: yalnız açık bir "NO" yetişkin sayılır. */
export function parseVerdict(answer: string | null): 'minor' | 'adult' {
  const a = (answer ?? '').trim().toUpperCase()
  if (/^(NO|HAYIR)\b/.test(a)) return 'adult'
  return 'minor'
}

