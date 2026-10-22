import { describe, expect, it } from 'vitest'
import { usedGenerativeAI, withMetadata } from '../../src/renderer/src/lib/metadata'
import type { EditDoc } from '../../src/shared/schema'

const doc = (ops: { type: string; params: Record<string, unknown> }[]) => ({ rasterOps: ops.map((o, i) => ({ id: String(i), file: '', at: '', ...o })) }) as unknown as EditDoc
const ascii = (u: Uint8Array) => Array.from(u, (c) => String.fromCharCode(c)).join('')
// en küçük geçerli JPEG başlığı (SOI + EOI yeter: yalnız bölüm ekleme sınanır)
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
// 1×1 PNG
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0))

describe('üretken YZ tespiti', () => {
  it('params.ai açık bilgisi öncelikli', () => {
    expect(usedGenerativeAI(doc([{ type: 'gen', params: { prompt: 'x', ai: false } }]))).toBe(false)
    expect(usedGenerativeAI(doc([{ type: 'paint', params: { tool: 'abs', ai: true } }]))).toBe(true)
  })
  it('eski projelerde tahmin: komutlu üretim ve FLUX genişletme', () => {
    expect(usedGenerativeAI(doc([{ type: 'gen', params: { prompt: 'sahil' } }]))).toBe(true)
    expect(usedGenerativeAI(doc([{ type: 'gen', params: { tool: 'expand', method: 'lama' } }]))).toBe(false)
    expect(usedGenerativeAI(doc([{ type: 'liquify', params: {} }]))).toBe(false)
  })
})

describe('meta veri yazma', () => {
  it('JPEG: XMP eklenir, YZ varsa DigitalSourceType', () => {
    const a = ascii(withMetadata(jpeg, { keepExif: false, ai: true, version: '1' }))
    expect(a.startsWith('\xff\xd8\xff\xe1')).toBe(true)
    expect(a).toContain('compositeWithTrainedAlgorithmicMedia')
    expect(a.endsWith('\xff\xd9')).toBe(true)
    expect(ascii(withMetadata(jpeg, { keepExif: false, ai: false, version: '1' }))).not.toContain('DigitalSourceType')
  })
  it('PNG: IHDR ardından iTXt, geçerli CRC', () => {
    const out = withMetadata(png, { keepExif: false, ai: true, version: '1' })
    expect(ascii(out.subarray(37, 41))).toBe('iTXt')
    const len = new DataView(out.buffer).getUint32(33)
    const crc = new DataView(out.buffer).getUint32(41 + len)
    // CRC'yi bağımsız hesapla
    let c = 0xffffffff
    for (const b of out.subarray(37, 41 + len)) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1 }
    expect(crc).toBe((c ^ 0xffffffff) >>> 0)
    expect(ascii(out.subarray(out.length - 8, out.length - 4))).toBe('IEND')
  })
})
