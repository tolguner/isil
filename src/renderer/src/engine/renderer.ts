import { ADJUST_KEYS, HUE_BANDS, type EditDoc, type Fill } from '@shared/schema'
import { Program, TargetPool, createTexture, makeQuad, type Target, type Tex } from './gl'
import { BLUR, COPY, EFFECT, MAIN, PRESENT, RETOUCH } from './shaders'
import { buildCurveLut } from './curves'
import { effectById, filterById, type Tint } from './presets'

export interface FaceUniforms {
  skin: Float32Array; skin2: Float32Array; tone: Float32Array
  lip: Float32Array; blush: Float32Array; lid: Float32Array; brow: Float32Array; sculpt: Float32Array; skinX: Float32Array
}
export function emptyFaceUniforms(): FaceUniforms {
  const z = () => new Float32Array(32)
  return { skin: z(), skin2: z(), tone: z(), lip: z(), blush: z(), lid: z(), brow: z(), sculpt: z(), skinX: z() }
}

export interface RenderOptions {
  neutral?: boolean        // karşılaştırma: renk/rötuş/efekt yok, geometri aynı
  skipEffects?: boolean
  skipGeometry?: boolean   // kırpma aracı açıkken tam görüntü
  skipBackground?: boolean
  maxSide?: number         // çıktı uzun kenarı sınırı
}

export interface OutputInfo { target: Target; w: number; h: number; place: [number, number, number, number] }

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function ratioValue(r: string | null): number | null {
  if (!r || r === 'free' || r === 'original') return null
  const [a, b] = r.split(':').map(Number)
  return a > 0 && b > 0 ? a / b : null
}

/** Kırpma sonrası görüntü boyutu (px) — çeyrek dönüş dahil. */
export function cropSize(doc: EditDoc, w: number, h: number) {
  const rot = doc.crop.quarter % 2 === 1
  const rw = rot ? h : w
  const rh = rot ? w : h
  return { w: doc.crop.w * rw, h: doc.crop.h * rh, rw, rh }
}

/** Bacak uzatmada tuval büyütme yalnız düz kırpmada (döndürme/çeyrek/perspektif yok) yapılır. */
export function legCanvasOk(doc: EditDoc) {
  const c = doc.crop
  return c.quarter % 4 === 0 && !c.rotation && !c.perspH && !c.perspV
}

export class Renderer {
  gl: WebGL2RenderingContext
  private vao: WebGLVertexArrayObject
  private pool: TargetPool
  private pMain: Program; private pBlur: Program; private pCopy: Program
  private pRetouch: Program; private pFx: Program; private pPresent: Program
  base: Tex | null = null
  /** Karşılaştırmada gösterilecek ilk kaynak (kalıcı işlem yoksa null: base kullanılır). */
  private orig: Tex | null = null
  private mask: Tex | null = null
  private maskA: Tex | null = null; private maskB: Tex | null = null; private maskC: Tex | null = null; private maskP: Tex | null = null; private eyeFx: Tex | null = null; private iris: Tex | null = null; private skinTex: Tex | null = null
  private warp: Tex | null = null
  private bgImg: Tex | null = null
  private curve: Tex
  private blank: Tex
  faces: FaceUniforms | null = null
  /** Bacak uzatma (kaynak uv bandı): tuval bu oranda uzar, satırlar çıktı uzayında eşlenir. */
  legBand: { y0: number; y1: number; s: number } | null = null
  hair: { rgb: [number, number, number]; amount: number } | null = null
  seed = Math.random()
  maxTex: number

  constructor(public canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false }) as WebGL2RenderingContext | null
    if (!gl) throw new Error('WebGL2 desteklenmiyor')
    this.gl = gl
    gl.getExtension('EXT_color_buffer_float')
    gl.getExtension('OES_texture_float_linear')
    this.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE)
    this.vao = makeQuad(gl)
    this.pool = new TargetPool(gl)
    this.pMain = new Program(gl, MAIN)
    this.pBlur = new Program(gl, BLUR)
    this.pCopy = new Program(gl, COPY)
    this.pRetouch = new Program(gl, RETOUCH)
    this.pFx = new Program(gl, EFFECT)
    this.pPresent = new Program(gl, PRESENT)
    this.curve = createTexture(gl, null, 256, 1)
    this.blank = createTexture(gl, null, 1, 1, { data: new Uint8Array([0, 0, 0, 0]) })
  }

  dispose() {
    this.pool.dispose()
    const gl = this.gl
    for (const t of [this.base, this.orig, this.mask, this.maskA, this.maskB, this.maskC, this.maskP, this.eyeFx, this.iris, this.skinTex, this.warp, this.bgImg, this.curve, this.blank]) if (t) gl.deleteTexture(t.tex)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }

  private replace(old: Tex | null, src: TexImageSource | null): Tex | null {
    if (old) this.gl.deleteTexture(old.tex)
    return src ? createTexture(this.gl, src) : null
  }

  setBase(src: TexImageSource) {
    this.base = this.replace(this.base, src)
  }
  setOriginal(src: TexImageSource | null) {
    this.orig = this.replace(this.orig, src)
  }
  setSubjectMask(src: TexImageSource | null) {
    this.mask = this.replace(this.mask, src)
  }
  setFaceMasks(a: TexImageSource | null, b: TexImageSource | null, c: TexImageSource | null) {
    this.maskA = this.replace(this.maskA, a)
    this.maskB = this.replace(this.maskB, b)
    this.maskC = this.replace(this.maskC, c)
  }
  /** Gerçek gözenek dokusu döşemesi (tekrarlanır). */
  setSkinTex(src: TexImageSource) {
    const gl = this.gl
    if (this.skinTex) gl.deleteTexture(this.skinTex.tex)
    this.skinTex = createTexture(gl, src)
    gl.bindTexture(gl.TEXTURE_2D, this.skinTex.tex)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  }
  /** Göz makyajı: fx normal karıştırılan katman, iris (rgb renk, a ağırlık); null = yok. */
  setEyeFx(fx: TexImageSource | null, iris: TexImageSource | null) {
    this.eyeFx = this.replace(this.eyeFx, fx)
    this.iris = this.replace(this.iris, iris)
  }
  /** İşaret koruma maskesi (R: 1 = dokunma); null = koruma yok. */
  setProtectMask(src: TexImageSource | null) {
    this.maskP = this.replace(this.maskP, src)
  }
  setBgImage(src: TexImageSource | null) {
    this.bgImg = this.replace(this.bgImg, src)
  }
  /** Yer değiştirme alanı: gw×gh, (dx,dy) kaynak uv cinsinden "örnekleme ofseti". */
  setWarp(field: Float32Array | null, gw = 0, gh = 0) {
    const gl = this.gl
    if (!field) {
      if (this.warp) gl.deleteTexture(this.warp.tex)
      this.warp = null
      return
    }
    if (!this.warp || this.warp.w !== gw || this.warp.h !== gh) {
      if (this.warp) gl.deleteTexture(this.warp.tex)
      this.warp = createTexture(gl, null, gw, gh, { internal: gl.RG16F, format: gl.RG, type: gl.FLOAT, data: field })
    } else {
      gl.bindTexture(gl.TEXTURE_2D, this.warp.tex)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gw, gh, gl.RG, gl.FLOAT, field)
    }
  }

  private draw(target: Target | null, w: number, h: number) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null)
    gl.viewport(0, 0, w, h)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  /** Ayrılabilir Gauss; yarıçap px cinsinden (kaynak çözünürlüğünde). */
  blur(src: Tex, radiusPx: number, name: string): Tex {
    const ds = Math.max(1, radiusPx / 4)
    const w = Math.max(2, src.w / ds)
    const h = Math.max(2, src.h / ds)
    const a = this.pool.get(name + 'a', w, h)
    const b = this.pool.get(name + 'b', w, h)
    const p = this.pBlur.use()
    let input: Tex = src
    for (let pass = 0; pass < 2; pass++) {
      p.tex('uTex', 0, input.tex).f('uStep', 1 / w, 0)
      this.draw(a, w, h)
      p.tex('uTex', 0, a.tex).f('uStep', 0, 1 / h)
      this.draw(b, w, h)
      input = b
    }
    return b
  }

  /** Rötuş geçişi (kaynak uzayında). */
  private retouch(src: Tex): Tex {
    if (!this.faces || !this.maskA) return src
    const maxSide = Math.max(src.w, src.h)
    const bs = this.blur(src, maxSide * 0.0035, 'bs')
    const bsCopy = this.pool.get('bsCopy', bs.w, bs.h)
    this.pCopy.use().tex('uTex', 0, bs.tex)
    this.draw(bsCopy, bs.w, bs.h)
    const bm = this.blur(src, maxSide * 0.011, 'bm')
    const out = this.pool.get('retouch', src.w, src.h)
    const f = this.faces
    const p = this.pRetouch.use()
    p.tex('uBase', 0, src.tex).tex('uBlurS', 1, bsCopy.tex).tex('uBlurM', 2, bm.tex)
      .tex('uMaskA', 3, this.maskA.tex).tex('uMaskB', 4, (this.maskB ?? this.blank).tex).tex('uMaskC', 5, (this.maskC ?? this.blank).tex)
      .tex('uMaskP', 6, (this.maskP ?? this.blank).tex)
      .tex('uEyeFx', 7, (this.eyeFx ?? this.blank).tex).tex('uIris', 8, (this.iris ?? this.blank).tex).f('uEyeOn', this.eyeFx ? 1 : 0)
      .tex('uSkinTex', 9, (this.skinTex ?? this.blank).tex).f('uSkinTexOn', this.skinTex ? 1 : 0)
      .fv('uSkin', f.skin, 4).fv('uSkin2', f.skin2, 4).fv('uTone', f.tone, 4).fv('uLip', f.lip, 4)
      .fv('uBlush', f.blush, 4).fv('uLid', f.lid, 4).fv('uBrow', f.brow, 4).fv('uSculpt', f.sculpt, 4).fv('uSkinX', f.skinX, 4)
    if (this.hair && this.hair.amount > 0) p.f('uHair', ...this.hair.rgb, this.hair.amount).f('uHairOn', 1)
    else p.f('uHairOn', 0)
    this.draw(out, src.w, src.h)
    return out
  }

  /**
   * Bacak bandını görüntü uv'sine (kırpma sonrası) çevir. Döndürme, çeyrek dönüş ya da perspektif varsa
   * null: o durumda uzatma bükme alanında yapılır (session.legCanvas).
   */
  legRows(doc: EditDoc, opts: RenderOptions = {}): { y0: number; band: number; s: number } | null {
    const b = this.legBand
    if (!b || opts.neutral) return null
    if (opts.skipGeometry) return { y0: b.y0, band: b.y1 - b.y0, s: b.s }
    const c = doc.crop
    if (!legCanvasOk(doc)) return null
    let a = (b.y0 - c.y) / c.h, e = (b.y1 - c.y) / c.h
    if (c.flipV) [a, e] = [1 - e, 1 - a]
    a = Math.max(0, Math.min(1, a))
    e = Math.max(0, Math.min(1, e))
    return e - a > 0.01 ? { y0: a, band: e - a, s: b.s } : null
  }

  /** Çıktı tuvali boyutu ve görüntü yerleşimi. */
  layout(doc: EditDoc, opts: RenderOptions = {}) {
    if (!this.base) throw new Error('görüntü yok')
    const { w: cw0, h: ch0, rw, rh } = opts.skipGeometry ? { w: this.base.w, h: this.base.h, rw: this.base.w, rh: this.base.h } : cropSize(doc, this.base.w, this.base.h)
    const rows = this.legRows(doc, opts)
    let cw = cw0
    let ch = ch0 * (rows ? 1 + rows.band * rows.s : 1)
    let place: [number, number, number, number] = [0, 0, 1, 1]
    const r = opts.skipBackground ? null : ratioValue(doc.background.ratio)
    const box = r ? doc.background.box : null
    if (r && box) {
      // şablon: fotoğraf kutunun içine sığdırılır (kırpma kutuyla aynı orandaysa tam doldurur)
      const [bx, by, bw, bh] = box
      const ir = cw / ch, br = (bw * r) / bh
      if (ir > br) {
        const W = cw / bw, H = W / r
        place = [bx, by + (bh - ch / H) / 2, bw, ch / H]
        cw = W
        ch = H
      } else {
        const H = ch / bh, W = H * r
        place = [bx + (bw - cw / W) / 2, by, cw / W, bh]
        cw = W
        ch = H
      }
    } else if (r) {
      const ir = cw / ch
      if (r > ir) {
        const W = ch * r
        place = [(1 - cw / W) / 2, 0, cw / W, 1]
        cw = W
      } else {
        const H = cw / r
        place = [0, (1 - ch / H) / 2, 1, ch / H]
        ch = H
      }
    }
    const cap = Math.min(opts.maxSide ?? Infinity, this.maxTex)
    const s = Math.min(1, cap / Math.max(cw, ch))
    return { w: Math.max(1, Math.round(cw * s)), h: Math.max(1, Math.round(ch * s)), place, rw, rh }
  }

  render(doc: EditDoc, opts: RenderOptions = {}): OutputInfo {
    const gl = this.gl
    if (!this.base) throw new Error('görüntü yok')
    const neutral = !!opts.neutral
    const src = neutral ? (this.orig ?? this.base) : this.retouch(this.base)
    const maxSide = Math.max(this.base.w, this.base.h)
    const blurL = this.blur(src, maxSide * 0.02, 'bl')
    const blurLCopy = this.pool.get('blCopy', blurL.w, blurL.h)
    this.pCopy.use().tex('uTex', 0, blurL.tex)
    this.draw(blurLCopy, blurL.w, blurL.h)

    const L = this.layout(doc, opts)
    const out = this.pool.get('main', L.w, L.h)

    // filtre + kullanıcı ayarları
    const filter = neutral ? null : filterById(doc.filter?.id)
    const famt = (doc.filter?.amount ?? 0) / 100
    const A = new Float32Array(20)
    ADJUST_KEYS.forEach((k, i) => {
      const u = neutral ? 0 : doc.adjust[k] / 100
      const fv = filter ? (filter.adjust[k] ?? 0) * famt : 0
      A[i] = u + fv
    })
    const hsl = new Float32Array(24)
    HUE_BANDS.forEach((b, i) => {
      const v = doc.hsl[b]
      hsl[i * 3] = neutral ? 0 : v.h / 100
      hsl[i * 3 + 1] = neutral ? 0 : v.s / 100
      hsl[i * 3 + 2] = neutral ? 0 : v.l / 100
    })
    const lut = neutral ? null : buildCurveLut(doc.curves, filter?.curve, famt)
    if (lut) {
      gl.bindTexture(gl.TEXTURE_2D, this.curve.tex)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, lut)
    }
    const split = (t: Tint | undefined) => (t ? [t[0], t[1], t[2], t[3] * famt] : [0.5, 0.5, 0.5, 0])

    // arka plan dolgusu
    const fill: Fill | null = opts.skipBackground ? null : doc.background.fill
    let fillType = 0
    let fa = [0, 0, 0, 1]
    let fb = [0, 0, 0, 1]
    let angle = 90
    let bgBlur: Tex = this.blank
    if (fill) {
      if (fill.type === 'color') { fillType = 1; fa = [...hexToRgb(fill.color), 1] }
      else if (fill.type === 'gradient') { fillType = 2; fa = [...hexToRgb(fill.from), 1]; fb = [...hexToRgb(fill.to), 1]; angle = fill.angle }
      else if (fill.type === 'blur') {
        fillType = 3
        const bb = this.blur(src, maxSide * (0.01 + fill.amount / 100 * 0.05), 'bgb')
        const bbc = this.pool.get('bgbCopy', bb.w, bb.h)
        this.pCopy.use().tex('uTex', 0, bb.tex)
        this.draw(bbc, bb.w, bb.h)
        bgBlur = bbc
      } else if (fill.type === 'image') fillType = this.bgImg ? 4 : 1
      else if (fill.type === 'transparent') fillType = 5
    }
    const useMask = !neutral && !!this.mask && doc.background.useCutout
    if (useMask && fillType === 0) fillType = 5

    const c = doc.crop
    const geo = opts.skipGeometry
      ? { cc: [0.5, 0.5], cs: [1, 1], rot: 0, q: 0, flip: [0, 0], persp: [0, 0] }
      : {
          cc: [c.x + c.w / 2, c.y + c.h / 2],
          cs: [c.w, c.h],
          rot: (c.rotation * Math.PI) / 180,
          q: c.quarter % 4,
          flip: [c.flipH ? 1 : 0, c.flipV ? 1 : 0],
          persp: [c.perspH / 100, c.perspV / 100]
        }
    // ince dönüşte kenar boşluğu kalmasın diye kırpmayı küçült
    const ar = (geo.cs[0] * L.rw) / (geo.cs[1] * L.rh)
    const zf = Math.abs(Math.cos(geo.rot)) + Math.abs(Math.sin(geo.rot)) * Math.max(ar, 1 / ar)
    const p = this.pMain.use()
    p.tex('uSrc', 0, src.tex).tex('uBlurL', 1, blurLCopy.tex)
      .tex('uWarp', 2, (this.warp ?? this.blank).tex).tex('uMask', 3, (this.mask ?? this.blank).tex)
      .tex('uCurve', 4, this.curve.tex).tex('uBgImg', 5, (this.bgImg ?? this.blank).tex).tex('uBgBlur', 6, bgBlur.tex)
      .f('uRotSize', L.rw, L.rh).f('uCropC', geo.cc[0], geo.cc[1]).f('uCropS', geo.cs[0] / zf, geo.cs[1] / zf)
      .f('uRot', geo.rot).i('uQuarter', geo.q).f('uFlip', geo.flip[0], geo.flip[1]).f('uPersp', geo.persp[0], geo.persp[1])
      .f('uPlace', ...L.place).f('uOutSize', L.w, L.h)
      .f('uWarpOn', !neutral && this.warp ? 1 : 0).f('uMaskOn', useMask ? 1 : 0).f('uTexel', 1 / Math.max(src.h, 1))
      .f('uSrcSize', src.w, src.h)
      .i('uFill', fillType).f('uFillA', fa[0], fa[1], fa[2], fa[3]).f('uFillB', fb[0], fb[1], fb[2], fb[3]).f('uFillAngle', angle)
      .fv('uA', A, 1).fv('uHsl', hsl, 3)
      .f('uSplitS', ...(split(filter?.splitS) as [number, number, number, number]))
      .f('uSplitH', ...(split(filter?.splitH) as [number, number, number, number]))
      .f('uCurveOn', lut ? 1 : 0)
    // seçmeli ayar noktaları
    const loc = neutral ? [] : (doc.local ?? []).slice(0, 8)
    const LP = new Float32Array(32), LC = new Float32Array(32), LA = new Float32Array(32)
    loc.forEach((q, i) => {
      LP.set([q.x, q.y, q.r, q.tol / 100], i * 4)
      LC.set([...q.color, 0], i * 4)
      LA.set([q.adj.b / 100, q.adj.c / 100, q.adj.s / 100, q.adj.w / 100], i * 4)
    })
    p.i('uLocalN', loc.length).fv('uLocP', LP, 4).fv('uLocC', LC, 4).fv('uLocA', LA, 4)
    const rows = this.legRows(doc, opts)
    p.f('uRow', rows?.y0 ?? 0, rows?.band ?? 0, rows?.s ?? 0).f('uRowOn', rows ? 1 : 0)
    this.draw(out, L.w, L.h)

    let result: Target = out
    if (!neutral && !opts.skipEffects && doc.effects.length) {
      let ping = 0
      for (const ref of doc.effects) {
        const def = effectById(ref.id)
        if (!def || ref.amount <= 0) continue
        const blurT = def.blur ? this.blur(result, Math.max(L.w, L.h) * def.blur, 'fxb') : null
        let blurCopy: Tex = this.blank
        if (blurT) {
          const bc = this.pool.get('fxbCopy', blurT.w, blurT.h)
          this.pCopy.use().tex('uTex', 0, blurT.tex)
          this.draw(bc, blurT.w, blurT.h)
          blurCopy = bc
        }
        const dst = this.pool.get(ping ? 'fxA' : 'fxB', L.w, L.h)
        ping ^= 1
        this.pFx.use().tex('uTex', 0, result.tex).tex('uBlur', 1, blurCopy.tex)
          .i('uFx', def.fx).f('uAmt', ref.amount / 100).f('uSeed', this.seed).f('uSize', L.w, L.h)
        this.draw(dst, L.w, L.h)
        result = dst
      }
    }
    return { target: result, w: L.w, h: L.h, place: L.place }
  }

  /** Çıktıyı görünür tuvale çizer (tuval boyutu çıktı boyutuna ayarlanır). */
  present(o: OutputInfo) {
    const cv = this.canvas
    if (cv.width !== o.w || cv.height !== o.h) {
      cv.width = o.w
      cv.height = o.h
    }
    this.pPresent.use().tex('uTex', 0, o.target.tex).f('uSize', o.w, o.h)
    this.draw(null, o.w, o.h)
  }

  /** Bir hedefi RGBA piksel olarak oku (satır 0 = üst). */
  read(t: Target): ImageData {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo)
    const px = new Uint8ClampedArray(t.w * t.h * 4)
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.UNSIGNED_BYTE, px)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return new ImageData(px, t.w, t.h)
  }

  /** Sadece bükme (liquify/yüz) uygulanmış kaynak — raster işlemi olarak pişirmek için. */
  bakeWarp(): ImageData {
    if (!this.base) throw new Error('görüntü yok')
    const doc0 = neutralGeometryDoc()
    const L = { w: this.base.w, h: this.base.h }
    const out = this.pool.get('bake', L.w, L.h)
    const A = new Float32Array(20)
    const p = this.pMain.use()
    p.tex('uSrc', 0, this.base.tex).tex('uBlurL', 1, this.base.tex).tex('uWarp', 2, (this.warp ?? this.blank).tex)
      .tex('uMask', 3, this.blank.tex).tex('uCurve', 4, this.curve.tex).tex('uBgImg', 5, this.blank.tex).tex('uBgBlur', 6, this.blank.tex)
      .f('uRotSize', L.w, L.h).f('uCropC', 0.5, 0.5).f('uCropS', 1, 1).f('uRot', 0).i('uQuarter', 0).f('uFlip', 0, 0).f('uPersp', 0, 0)
      .f('uPlace', 0, 0, 1, 1).f('uOutSize', L.w, L.h).f('uWarpOn', this.warp ? 1 : 0).f('uMaskOn', 0).f('uTexel', 1 / L.h)
      .f('uSrcSize', L.w, L.h).i('uFill', 0).fv('uA', A, 1).fv('uHsl', new Float32Array(24), 3)
      .f('uSplitS', 0, 0, 0, 0).f('uSplitH', 0, 0, 0, 0).f('uCurveOn', 0)
    this.draw(out, L.w, L.h)
    void doc0
    return this.read(out)
  }
}

function neutralGeometryDoc() {
  return null
}
