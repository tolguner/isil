import type { CurvePoint, Curves } from '@shared/schema'

/** Monoton kübik (Fritsch–Carlson) eğri → 256 değer. */
export function sampleCurve(points: CurvePoint[], n = 256): Float32Array {
  const pts = [...points].sort((a, b) => a[0] - b[0])
  const out = new Float32Array(n)
  if (pts.length < 2) {
    for (let i = 0; i < n; i++) out[i] = i / (n - 1)
    return out
  }
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const m = pts.length
  const d: number[] = []
  for (let i = 0; i < m - 1; i++) d.push((ys[i + 1] - ys[i]) / Math.max(xs[i + 1] - xs[i], 1e-6))
  const t: number[] = [d[0]]
  for (let i = 1; i < m - 1; i++) t.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2)
  t.push(d[m - 2])
  for (let i = 0; i < m - 1; i++) {
    if (d[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i] / d[i]
    const b = t[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const k = 3 / Math.sqrt(s)
      t[i] = k * a * d[i]
      t[i + 1] = k * b * d[i]
    }
  }
  for (let k = 0; k < n; k++) {
    const x = k / (n - 1)
    let i = 0
    if (x <= xs[0]) {
      out[k] = ys[0]
      continue
    }
    if (x >= xs[m - 1]) {
      out[k] = ys[m - 1]
      continue
    }
    while (i < m - 2 && x > xs[i + 1]) i++
    const h = xs[i + 1] - xs[i]
    const u = (x - xs[i]) / h
    const h00 = 2 * u ** 3 - 3 * u ** 2 + 1
    const h10 = u ** 3 - 2 * u ** 2 + u
    const h01 = -2 * u ** 3 + 3 * u ** 2
    const h11 = u ** 3 - u ** 2
    out[k] = Math.min(1, Math.max(0, h00 * ys[i] + h10 * h * t[i] + h01 * ys[i + 1] + h11 * h * t[i + 1]))
  }
  return out
}

export function isIdentity(c: CurvePoint[]) {
  return c.length === 2 && c[0][0] === 0 && c[0][1] === 0 && c[1][0] === 1 && c[1][1] === 1
}

/** Kullanıcı eğrileri + filtre eğrileri (miktar ile karıştırılmış) → RGBA8 LUT (256×1). */
export function buildCurveLut(user: Curves, filter: Partial<Curves> | undefined, amount: number): Uint8Array | null {
  const userId = isIdentity(user.rgb) && isIdentity(user.r) && isIdentity(user.g) && isIdentity(user.b)
  const fId = !filter || amount === 0
  if (userId && fId) return null
  const ident = sampleCurve([[0, 0], [1, 1]])
  const mixC = (pts: CurvePoint[] | undefined) => {
    if (!pts) return ident
    const s = sampleCurve(pts)
    return s.map((v, i) => ident[i] + (v - ident[i]) * amount)
  }
  const uRgb = sampleCurve(user.rgb)
  const ch = [sampleCurve(user.r), sampleCurve(user.g), sampleCurve(user.b)]
  const fRgb = mixC(filter?.rgb)
  const fch = [mixC(filter?.r), mixC(filter?.g), mixC(filter?.b)]
  const lut = new Uint8Array(256 * 4)
  const at = (arr: Float32Array, v: number) => arr[Math.round(Math.min(1, Math.max(0, v)) * 255)]
  for (let i = 0; i < 256; i++) {
    const x = i / 255
    for (let c = 0; c < 3; c++) {
      let v = at(uRgb, x)
      v = at(ch[c], v)
      v = at(fRgb, v)
      v = at(fch[c], v)
      lut[i * 4 + c] = Math.round(v * 255)
    }
    lut[i * 4 + 3] = 255
  }
  return lut
}
