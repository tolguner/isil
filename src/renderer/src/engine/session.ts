// Etkin projenin görüntü kaynakları, analiz önbelleği ve dışa aktarma.
import type { EditDoc, Project, Settings } from '@shared/schema'
import { platform } from '@/lib/platform'
import { Renderer, legCanvasOk, type OutputInfo } from './renderer'
import { addHairVolume, addMlsField, allProtect, buildField, foldGuard, contourPairs, buildMasks, buildProtectMask, faceOps, faceUniforms, FaceGeo, faceHasSkinWork, type MaskSet } from './face'
import { applyBodyBands, applyManualBody, bodyOps, legBand, maskField } from './body'
import { drawLayers } from './layers'
import { detectFaces, detectPose, segmentPerson, type PersonParts, type Pt } from '@/ai/vision'

export const PREVIEW_MAX = 2048

async function decode(blob: Blob, maxSide?: number): Promise<ImageBitmap> {
  const full = await createImageBitmap(blob, { imageOrientation: 'from-image' })
  if (!maxSide || Math.max(full.width, full.height) <= maxSide) return full
  const s = maxSide / Math.max(full.width, full.height)
  const bm = await createImageBitmap(full, { resizeWidth: Math.round(full.width * s), resizeHeight: Math.round(full.height * s), resizeQuality: 'high' })
  full.close()
  return bm
}

export function encodeCanvas(c: HTMLCanvasElement | OffscreenCanvas, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality })
  return new Promise((res, rej) => (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('kodlama başarısız'))), type, quality))
}

export function imageDataToCanvas(d: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = d.width
  c.height = d.height
  c.getContext('2d')!.putImageData(d, 0, 0)
  return c
}

class Session {
  project: Project | null = null
  baseKey = ''
  baseBlob: Blob | null = null
  /** Kalıcı işlemlerden (silgi, YZ, kalite artır…) önceki ilk fotoğraf: "Orijinali göster" için. */
  original: ImageBitmap | null = null
  originalKey = ''
  preview: ImageBitmap | null = null
  W = 0
  H = 0
  maskKey = ''
  maskBitmap: ImageBitmap | null = null
  renderer: Renderer | null = null
  canvas: HTMLCanvasElement | null = null
  faces: Pt[][] | null = null
  facesKey = ''
  seg: PersonParts | null = null
  segKey = ''
  pose: Pt[] | null = null
  poseKey = ''
  masks: MaskSet | null = null
  masksKey = ''
  protect: ImageData | null = null
  protectKey = ''
  liveField: { field: Float32Array; gw: number; gh: number } | null = null
  bgImage: ImageBitmap | null = null
  bgKey = ''
  lastOut: OutputInfo | null = null
  listeners = new Set<() => void>()

  onChange(fn: () => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
  emit() {
    for (const f of this.listeners) f()
  }

  attach(canvas: HTMLCanvasElement) {
    if (this.canvas === canvas && this.renderer) return
    this.renderer?.dispose()
    this.canvas = canvas
    this.renderer = new Renderer(canvas)
    if (this.preview) this.renderer.setBase(this.preview)
    if (this.maskBitmap) this.renderer.setSubjectMask(this.maskBitmap)
    if (this.original) this.renderer.setOriginal(this.originalFitted())
    this.masksKey = this.protectKey = ''
    this.bgKey = ''
  }

  detach() {
    this.renderer?.dispose()
    this.renderer = null
    this.canvas = null
  }

  reset() {
    this.project = null
    this.baseKey = this.maskKey = this.facesKey = this.segKey = this.poseKey = this.masksKey = this.protectKey = this.bgKey = ''
    this.preview?.close()
    this.preview = null
    this.baseBlob = null
    this.W = this.H = 0
    this.lastOut = null
    this.faces = this.pose = null
    this.seg = null
    this.masks = null
    this.liveField = null
    this.maskBitmap = null
    this.original?.close()
    this.original = null
    this.originalKey = ''
  }

  /**
   * Karşılaştırma görüntüsü. YZ genişlet tuvali büyüttüyse orijinal, şimdiki tuvaldeki yerine (kesirli dikdörtgen,
   * genişletme işlemlerinin from/to/at bilgisinden) siyah zeminle konur; yoksa gerilmiş ya da yakınlaşmış görünürdü.
   */
  private originalFitted(doc?: EditDoc): TexImageSource | null {
    const o = this.original, p = this.preview
    if (!o || !p) return o
    let r = { x: 0, y: 0, w: 1, h: 1 }
    for (const op of doc?.rasterOps ?? []) {
      const q = op.params as { tool?: string; from?: [number, number]; to?: [number, number]; at?: [number, number] }
      if (q.tool !== 'expand' || !q.from || !q.to || !q.at) continue
      r = { x: (r.x * q.from[0] + q.at[0]) / q.to[0], y: (r.y * q.from[1] + q.at[1]) / q.to[1], w: (r.w * q.from[0]) / q.to[0], h: (r.h * q.from[1]) / q.to[1] }
    }
    if (r.w === 1 && r.h === 1 && Math.abs(o.width / o.height - p.width / p.height) < 0.01) return o
    const c = document.createElement('canvas')
    c.width = p.width
    c.height = p.height
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
    if (r.w === 1 && r.h === 1) {
      // oran başka bir işlemle değişti: ortala, sığdır
      const k = Math.min(p.width / o.width, p.height / o.height)
      ctx.drawImage(o, (c.width - o.width * k) / 2, (c.height - o.height * k) / 2, o.width * k, o.height * k)
    } else ctx.drawImage(o, r.x * c.width, r.y * c.height, r.w * c.width, r.h * c.height)
    return c
  }

  /** doc.base / doc.mask değişmişse kaynakları yükler. */
  async sync(project: Project, doc: EditDoc) {
    this.project = project
    const key = project.id + ':' + (doc.base ?? project.sourceFile)
    if (key !== this.baseKey) {
      const blob = await platform.getFile(project.id, doc.base ?? project.sourceFile)
      const prev = await decode(blob, PREVIEW_MAX)
      const probe = await createImageBitmap(blob, { imageOrientation: 'from-image' })
      this.W = probe.width
      this.H = probe.height
      probe.close()
      this.preview?.close()
      this.preview = prev
      this.baseBlob = blob
      this.baseKey = key
      this.renderer?.setBase(prev)
      this.faces = null
      this.facesKey = ''
      this.pose = null
      this.seg = null
      this.masks = null
      this.masksKey = this.protectKey = ''
      this.liveField = null
    }
    // karşılaştırma: belge kalıcı işlem içeriyorsa ilk kaynağı ayrıca yükle
    const okey = doc.base ? project.id + ':' + project.sourceFile + ':' + doc.base : ''
    if (okey !== this.originalKey) {
      this.original?.close()
      this.original = okey ? await decode(await platform.getFile(project.id, project.sourceFile), PREVIEW_MAX) : null
      this.originalKey = okey
      this.renderer?.setOriginal(this.originalFitted(doc))
    }
    const mkey = project.id + ':' + (doc.mask ?? '')
    if (mkey !== this.maskKey) {
      this.maskBitmap?.close()
      this.maskBitmap = doc.mask ? await decode(await platform.getFile(project.id, doc.mask), PREVIEW_MAX) : null
      this.maskKey = mkey
      this.renderer?.setSubjectMask(this.maskBitmap)
    }
    const fill = doc.background.fill
    const bk = fill?.type === 'image' ? fill.file : ''
    if (bk !== this.bgKey) {
      this.bgImage?.close()
      this.bgImage = bk ? await decode(await platform.getFile(project.id, bk), PREVIEW_MAX) : null
      this.bgKey = bk
      this.renderer?.setBgImage(this.bgImage)
    }
  }

  async ensureFaces(): Promise<Pt[][]> {
    if (this.faces && this.facesKey === this.baseKey) return this.faces
    if (!this.preview) return []
    this.faces = await detectFaces(this.preview)
    this.facesKey = this.baseKey
    this.masksKey = this.protectKey = ''
    this.emit()
    return this.faces
  }

  async ensureSeg(): Promise<PersonParts | null> {
    if (this.seg && this.segKey === this.baseKey) return this.seg
    if (!this.preview) return null
    try {
      this.seg = await segmentPerson(this.preview)
    } catch (e) {
      console.warn('segmentasyon başarısız', e)
      this.seg = null
    }
    this.segKey = this.baseKey
    this.masksKey = this.protectKey = ''
    return this.seg
  }

  async ensurePose(): Promise<Pt[] | null> {
    if (this.poseKey === this.baseKey) return this.pose
    if (!this.preview) return null
    this.pose = await detectPose(this.preview)
    this.poseKey = this.baseKey
    this.emit()
    return this.pose
  }

  faceGeos(W = this.W, H = this.H) {
    return (this.faces ?? []).map((f) => new FaceGeo(f, W, H))
  }

  /** Bükme alanı: yüz + vücut + canlı liquify. */
  warpField(doc: EditDoc) {
    const W = this.W, H = this.H
    const ops = []
    if (this.faces) {
      const geos = this.faceGeos()
      for (const e of doc.retouch.faces) {
        const g = geos[e.index]
        if (g) ops.push(...faceOps(g, e.shape, e.side))
      }
    }
    // kontur kaydırıcıları: MLS alanı canlı liquify alanının üstüne eklenir
    let base = this.liveField
    if (this.faces) {
      const geos = this.faceGeos()
      const pairs = doc.retouch.faces.map((e) => (geos[e.index] ? contourPairs(geos[e.index], e.shape, e.side) : null)).filter((x) => !!x)
      if (pairs.length) {
        const gw = base?.gw ?? 192, gh = base?.gh ?? Math.max(16, Math.round((192 * H) / W))
        const field = base ? Float32Array.from(base.field) : new Float32Array(gw * gh * 2)
        for (const pr of pairs) addMlsField(field, gw, gh, W, H, pr)
        base = { field, gw, gh }
      }
      // saç hacmi (bölütleme gerekir)
      const hv = doc.retouch.faces.filter((e) => e.shape.hairVolume && geos[e.index])
      if (hv.length && this.seg) {
        const gw = base?.gw ?? 192, gh = base?.gh ?? Math.max(16, Math.round((192 * H) / W))
        const field = base ? Float32Array.from(base.field) : new Float32Array(gw * gh * 2)
        for (const e of hv) addHairVolume(field, gw, gh, W, H, geos[e.index], e.shape.hairVolume / 100, this.seg)
        base = { field, gw, gh }
      }
    }
    let res = buildField(ops, W, H, base?.field ?? null, base?.gw, base?.gh)
    if (doc.body && this.pose) {
      const gw = res?.gw ?? 192, gh = res?.gh ?? Math.max(16, Math.round((192 * H) / W))
      res ??= { field: new Float32Array(gw * gh * 2), gw, gh }
      const body = this.bodyField(doc, gw, gh)!
      for (let k = 0; k < body.length; k++) res.field[k] += body[k]
    }
    if (doc.body?.manual && (doc.body.manual.stretch || doc.body.manual.slim)) {
      if (!res) {
        const gw = 192, gh = Math.max(16, Math.round((192 * H) / W))
        res = { field: new Float32Array(gw * gh * 2), gw, gh }
      }
      const cx = this.pose ? (this.pose[11].x + this.pose[12].x + this.pose[23].x + this.pose[24].x) / 4 : 0.5
      applyManualBody(res.field, res.gw, res.gh, doc.body.manual, cx)
    }
    // katlanma denetimi: canlı liquify alanı (base) yerinde düzenlendiği için kopya üzerinde
    if (res) {
      if (res.field === this.liveField?.field) res = { ...res, field: Float32Array.from(res.field) }
      this.foldScale = foldGuard(res.field, res.gw, res.gh, W, H)
    }
    return res
  }

  /** Bacak uzatma tuvali büyüterek mi yapılıyor (düz kırpma, arka plan korunmuyor). */
  legCanvas(doc: EditDoc) {
    return !!doc.body && legCanvasOk(doc)
  }

  /** Son bükme alanında katlanma denetiminin uyguladığı ölçek (1 = dokunulmadı). */
  foldScale = 1

  /**
   * Yalnız vücut şekli alanı (otomatik kaydırıcılar + bacak bandı; elle bölge hariç).
   * "Arka planı koru" açıksa şekil kısmı kişi maskesiyle sınırlanır, bacak uzatma sınırlanmaz.
   */
  bodyField(doc: EditDoc, gw = 192, gh = Math.max(16, Math.round((192 * this.H) / this.W)), unmasked = false): Float32Array | null {
    if (!doc.body || !this.pose) return null
    const W = this.W, H = this.H
    const body = buildField(bodyOps(this.pose, doc.body.shape, W, H), W, H, new Float32Array(gw * gh * 2), gw, gh)!
    applyBodyBands(body.field, gw, gh, this.pose, doc.body.shape, W, H, this.seg, { slim: true })
    // unmasked: katmanlı işleme (kişi tam alanla bükülür, arka plan ayrıca tamamlanır)
    if (unmasked) {
      applyBodyBands(body.field, gw, gh, this.pose, doc.body.shape, W, H, this.seg, { legs: true })
      return body.field
    }
    if (doc.body.protect && this.seg) maskField(body.field, gw, gh, this.seg)
    // bacak uzatma: tuval büyütülebiliyorsa çıktıda yapılır (renderer.legBand), yoksa alanda.
    // "Arka planı koru" bacakta canlı uygulanmaz (maskeli dikey kaydırma kenarlarda iz bırakıyordu);
    // "Boşluğu YZ ile doldur" katman yöntemiyle temiz uygular.
    if (!this.legCanvas(doc)) applyBodyBands(body.field, gw, gh, this.pose, doc.body.shape, W, H, this.seg, { legs: true })
    return body.field
  }

  /** Renderer'ı belgeyle eşitle (maskeler, uniform'lar, bükme). */
  prepare(r: Renderer, doc: EditDoc) {
    const geos = this.faces ? this.faceGeos() : []
    const skinWork = doc.retouch.faces.some(faceHasSkinWork)
    const hairAmt = (doc.retouch.faces[0]?.makeup.hair?.amount ?? 0) / 100
    if ((skinWork && geos.length) || (hairAmt && this.seg)) {
      const needHair = hairAmt > 0
      const key = this.baseKey + ':' + geos.length + ':' + (this.seg ? 's' : '') + (needHair ? 'h' : '')
      if (key !== this.masksKey || !this.masks) {
        this.masks = buildMasks(geos, this.W, this.H, this.seg, needHair)
        this.masksKey = key
        r.setFaceMasks(this.masks.a, this.masks.b, this.masks.c)
      }
      r.faces = faceUniforms(doc.retouch.faces, geos.length)
      const hair = doc.retouch.faces[0]?.makeup.hair
      r.hair = hair && hair.amount ? { rgb: hexToRgb(hair.color || '#7a3b2e'), amount: hair.amount / 100 } : null
      this.syncProtect(r, doc)
    } else {
      r.faces = null
      r.hair = null
    }
    r.legBand = this.legCanvas(doc) ? legBand(this.pose, doc.body!.shape) : null
    const wf = this.warpField(doc)
    r.setWarp(wf?.field ?? null, wf?.gw, wf?.gh)
  }

  /** İşaret koruma maskesini belgeyle eşitle (izler değişince yeniden çizilir). */
  private syncProtect(r: Renderer, doc: EditDoc) {
    const strokes = allProtect(doc.retouch.faces)
    const key = this.baseKey + ':' + JSON.stringify(strokes)
    if (key === this.protectKey) return
    this.protect = buildProtectMask(strokes, this.W, this.H)
    this.protectKey = key
    r.setProtectMask(this.protect)
  }

  draw(doc: EditDoc, opts: { compare?: boolean; skipGeometry?: boolean; skipBackground?: boolean } = {}) {
    const r = this.renderer
    if (!r || !r.base) return null
    this.prepare(r, doc)
    const out = r.render(doc, { neutral: opts.compare, skipGeometry: opts.skipGeometry, skipBackground: opts.skipBackground })
    r.present(out)
    this.lastOut = out
    return out
  }

  /** Tam çözünürlükte dışa aktarma. */
  async exportBlob(doc: EditDoc, s: Pick<Settings, 'exportFormat' | 'exportQuality' | 'exportMaxSide'>, opts: { maxSide?: number } = {}): Promise<{ blob: Blob; w: number; h: number }> {
    if (!this.baseBlob) throw new Error('görüntü yok')
    const full = await decode(this.baseBlob)
    const off = document.createElement('canvas')
    const r = new Renderer(off)
    try {
      const maxSide = opts.maxSide ?? (s.exportMaxSide || undefined)
      r.setBase(full)
      if (this.maskBitmap && this.project && doc.mask) r.setSubjectMask(await decode(await platform.getFile(this.project.id, doc.mask)))
      if (this.bgImage && this.project && doc.background.fill?.type === 'image') r.setBgImage(await decode(await platform.getFile(this.project.id, doc.background.fill.file)))
      if (this.masks) r.setFaceMasks(this.masks.a, this.masks.b, this.masks.c)
      r.setProtectMask(buildProtectMask(allProtect(doc.retouch.faces), this.W, this.H))
      this.masksKey = this.masksKey // maskeler normalize uv ile örneklenir; aynı kalır
      const saved = this.masks
      this.prepareExport(r, doc, saved)
      const out = r.render(doc, { maxSide })
      const img = r.read(out.target)
      const c = imageDataToCanvas(img)
      const ctx = c.getContext('2d')!
      await document.fonts.ready
      drawLayers(ctx, doc.layers, c.width, c.height)
      let type = s.exportFormat === 'png' ? 'image/png' : s.exportFormat === 'webp' ? 'image/webp' : 'image/jpeg'
      // şeffaflık varsa JPEG yerine PNG
      const transparent = doc.background.fill?.type === 'transparent' || (doc.background.useCutout && !doc.background.fill)
      if (transparent && type === 'image/jpeg') type = 'image/png'
      if (type === 'image/jpeg') {
        const flat = document.createElement('canvas')
        flat.width = c.width
        flat.height = c.height
        const fctx = flat.getContext('2d')!
        fctx.fillStyle = '#ffffff'
        fctx.fillRect(0, 0, c.width, c.height)
        fctx.drawImage(c, 0, 0)
        return { blob: await encodeCanvas(flat, type, s.exportQuality / 100), w: c.width, h: c.height }
      }
      return { blob: await encodeCanvas(c, type, s.exportQuality / 100), w: c.width, h: c.height }
    } finally {
      full.close()
      r.dispose()
    }
  }

  private prepareExport(r: Renderer, doc: EditDoc, masks: MaskSet | null) {
    const geos = this.faces ? this.faceGeos() : []
    if (masks && geos.length) {
      r.faces = faceUniforms(doc.retouch.faces, geos.length)
      const hair = doc.retouch.faces[0]?.makeup.hair
      r.hair = hair && hair.amount ? { rgb: hexToRgb(hair.color || '#7a3b2e'), amount: hair.amount / 100 } : null
    }
    r.legBand = this.legCanvas(doc) ? legBand(this.pose, doc.body!.shape) : null
    const wf = this.warpField(doc)
    r.setWarp(wf?.field ?? null, wf?.gw, wf?.gh)
  }

  private pvRenderer: Renderer | null = null
  private pvKey = ''
  private pvMasks: MaskSet | null = null
  private pvMasksKey = ''
  private pvProtectKey = ''

  /**
   * Ön ayar önizlemesi: ana tuvale ve oturum durumuna dokunmadan ayrı bir motorla önizleme çizer
   * (tek dokunuş rötuş kartları için; cilt maskeleri burada ayrıca üretilir).
   */
  async renderPreview(doc: EditDoc, maxSide = 1000): Promise<HTMLCanvasElement | null> {
    if (!this.preview) return null
    this.pvRenderer ??= new Renderer(document.createElement('canvas'))
    const r = this.pvRenderer
    if (this.pvKey !== this.baseKey) {
      r.setBase(this.preview)
      this.pvKey = this.baseKey
      this.pvMasksKey = this.pvProtectKey = ''
    }
    const geos = this.faces ? this.faceGeos() : []
    if (doc.retouch.faces.some(faceHasSkinWork) && geos.length) {
      const key = this.baseKey + ':' + geos.length
      if (key !== this.pvMasksKey || !this.pvMasks) {
        this.pvMasks = buildMasks(geos, this.W, this.H, this.seg, false)
        this.pvMasksKey = key
        r.setFaceMasks(this.pvMasks.a, this.pvMasks.b, this.pvMasks.c)
      }
      const pk = this.baseKey + ':' + JSON.stringify(allProtect(doc.retouch.faces))
      if (pk !== this.pvProtectKey) {
        r.setProtectMask(buildProtectMask(allProtect(doc.retouch.faces), this.W, this.H))
        this.pvProtectKey = pk
      }
      r.faces = faceUniforms(doc.retouch.faces, geos.length)
    } else r.faces = null
    r.hair = null
    r.legBand = this.legCanvas(doc) ? legBand(this.pose, doc.body!.shape) : null
    const wf = this.warpField(doc)
    r.setWarp(wf?.field ?? null, wf?.gw, wf?.gh)
    const out = r.render(doc, { maxSide })
    return imageDataToCanvas(r.read(out.target))
  }

  /** Küçük resim (JPEG, uzun kenar 480). */
  async thumbnail(doc: EditDoc): Promise<Uint8Array | null> {
    const r = this.renderer
    if (!r || !r.base) return null
    this.prepare(r, doc)
    const out = r.render(doc, { maxSide: 480 })
    const img = r.read(out.target)
    const c = imageDataToCanvas(img)
    drawLayers(c.getContext('2d')!, doc.layers, c.width, c.height)
    const flat = document.createElement('canvas')
    flat.width = c.width
    flat.height = c.height
    const f = flat.getContext('2d')!
    f.fillStyle = '#16171b'
    f.fillRect(0, 0, c.width, c.height)
    f.drawImage(c, 0, 0)
    const blob = await encodeCanvas(flat, 'image/jpeg', 0.82)
    // yeniden ekranı çiz (thumbnail hedefleri ana hedefleri değiştirmiş olabilir)
    this.draw(doc)
    return new Uint8Array(await blob.arrayBuffer())
  }

  /** Ayar/filtre olmadan, bükme dahil tam çözünürlüklü kaynak (raster işlem girişi). */
  async fullBase(): Promise<ImageBitmap> {
    if (!this.baseBlob) throw new Error('görüntü yok')
    return decode(this.baseBlob)
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const session = new Session()
