import { describe, expect, it } from 'vitest'
import { blockedPrompt, normalizePrompt, parseVerdict } from '../../src/renderer/src/ai/rules'

describe('komut engeli', () => {
  it.each(['make her naked', 'Kıyafetlerini çıkar', 'n.u.d.e photo', 'ÇIPLAK yap', 'soy onu', 'remove his clothes', 'sexy lingerie', 'g0ğüs dekoltesi', 'iç çamaşırı giydir'])('engeller: %s', (p) => {
    expect(blockedPrompt(p)).not.toBeNull()
  })
  it.each(['arka planı sahil yap', 'soyadını yaz', 'change shirt to a red striped shirt', 'take off the glasses', 'add a gold bracelet', 'comic strip style', 'memleket manzarası', 'mayonez reklamı', 'kırmızı elbise giydir', 'turn into anime'])('izin verir: %s', (p) => {
    expect(blockedPrompt(p)).toBeNull()
  })
  it('Türkçe karakterleri ve harf oyunlarını sadeleştirir', () => {
    expect(normalizePrompt('ÇIPLAK  Ş.e.k.İ.l')).toBe('ciplak sekil')
    expect(normalizePrompt('nud3')).toBe('nude')
  })
})

describe('yaş kapısı yanıtı', () => {
  it('yalnız açık "hayır" yetişkin sayılır', () => {
    expect(parseVerdict('NO')).toBe('adult')
    expect(parseVerdict('No.')).toBe('adult')
    expect(parseVerdict('hayır')).toBe('adult')
  })
  it.each(['YES', 'UNSURE', 'I am not sure', '', null, 'Nobody can tell'])('küçük sayar: %s', (a) => {
    expect(parseVerdict(a as string | null)).toBe('minor')
  })
})
