import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditor } from '../../src/renderer/src/store/editor'
import { emptyDoc, type Project } from '../../src/shared/schema'

const project = { id: 'p', name: 'p', sourceFile: 'a.jpg', doc: emptyDoc() } as unknown as Project
const S = () => useEditor.getState()

describe('araç içinde adım adım geri alma', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    S().openProject(project)
    S().openTool('adjust')
  })

  it('aralıklı değişiklikler ayrı adım, sürükleme tek adım', () => {
    S().update((d) => { d.adjust.exposure = 10 })
    vi.advanceTimersByTime(1000)
    // sürükleme: arka arkaya üç değer
    S().update((d) => { d.adjust.contrast = 5 })
    S().update((d) => { d.adjust.contrast = 15 })
    S().update((d) => { d.adjust.contrast = 25 })
    expect(S().toolPast.length).toBe(2)
    S().undo()
    expect(S().doc.adjust.contrast).toBe(0)
    expect(S().doc.adjust.exposure).toBe(10)
    expect(S().tool).toBe('adjust')
    S().redo()
    expect(S().doc.adjust.contrast).toBe(25)
  })

  it('aracın adımları bitince geri alma aracı iptal eder', () => {
    S().update((d) => { d.adjust.exposure = 10 })
    S().undo()
    expect(S().tool).toBe('adjust')
    expect(S().doc.adjust.exposure).toBe(0)
    S().undo()
    expect(S().tool).toBeNull()
  })

  it('uygulanan araç tek adım olarak ana geçmişe girer', () => {
    S().update((d) => { d.adjust.exposure = 10 })
    vi.advanceTimersByTime(1000)
    S().update((d) => { d.adjust.exposure = 20 })
    S().closeTool(true)
    expect(S().past.length).toBe(1)
    S().undo()
    expect(S().doc.adjust.exposure).toBe(0)
  })
})

describe('geçmiş paneli', () => {
  it('adımlar adlandırılır ve bir adıma gidilip geri gelinebilir', async () => {
    const { describeStep } = await import('../../src/renderer/src/lib/history')
    S().openProject(project)
    S().commit((d) => { d.adjust.exposure = 10 })
    S().commit((d) => { d.filter = { id: 'x', amount: 50 } })
    S().commit((d) => { d.rasterOps.push({ id: 'r', type: 'gen', file: 'f', params: { tool: 'expand' }, at: '' }) })
    const states = [...S().past, S().doc]
    expect(describeStep(states[0], states[1])[0]).toBe('Ayarlar')
    expect(describeStep(states[1], states[2])[0]).toBe('Filtre')
    expect(describeStep(states[2], states[3])[0]).toBe('YZ genişlet')
    S().jumpTo(1)
    expect(S().doc.adjust.exposure).toBe(10)
    expect(S().doc.filter).toBeNull()
    expect(S().future.length).toBe(2)
    S().redo(); S().redo()
    expect(S().doc.rasterOps.length).toBe(1)
  })
  it('kayıtlı geçmiş proje açılınca geri yüklenir', () => {
    const d1 = emptyDoc(); const d2 = emptyDoc(); d2.adjust.contrast = 30
    S().openProject({ ...project, doc: d2, history: { past: [d1], future: [] } } as unknown as Project)
    expect(S().past.length).toBe(1)
    S().undo()
    expect(S().doc.adjust.contrast).toBe(0)
  })
})
