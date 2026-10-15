// Komut paleti (Ctrl+K): araç ya da eylemi adıyla bul. Masaüstü alışkanlığı; Peachy ve Canva'da "araç arama" var.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { useEditor } from '@/store/editor'
import { useLang } from '@/lib/i18n'
import { TABS } from '@/tools'
import { copyLook, pasteLook } from '@/lib/edits-clipboard'
import { saveNow, leaveEditorTo } from '@/lib/projects'

interface Cmd { id: string; label: string; hint: string; keys: string; run: () => void }

// Türkçe karakterleri sadeleştirerek ara ("isik" → "ışık")
const fold = (s: string) => s.toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').normalize('NFD').replace(/[̀-ͯ]/g, '')

export function CommandPalette() {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const en = lang === 'en'

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setQ('')
        setSel(0)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0)
  }, [open])

  const cmds = useMemo<Cmd[]>(() => {
    const st = () => useEditor.getState()
    const list: Cmd[] = []
    for (const t of TABS) {
      for (const tool of t.tools) {
        const tabName = t.label[en ? 1 : 0], toolName = tool.label[en ? 1 : 0]
        list.push({
          id: `${t.id}/${tool.id}`,
          label: toolName === tabName ? toolName : `${toolName}`,
          hint: tabName,
          keys: [t.label[0], t.label[1], tool.label[0], tool.label[1]].join(' '),
          run: () => {
            st().setTab(t.id)
            if (st().tool !== tool.id) st().openTool(tool.id)
          }
        })
      }
    }
    const act = (id: string, tr: string, enl: string, hint: string, run: () => void) => list.push({ id, label: en ? enl : tr, hint, keys: tr + ' ' + enl, run })
    act('export', 'Dışa aktar', 'Export', 'Ctrl+E', () => document.getElementById('export-btn')?.click())
    act('copy', 'Ayarları kopyala', 'Copy edits', 'Ctrl+Shift+C', copyLook)
    act('paste', 'Ayarları yapıştır', 'Paste edits', 'Ctrl+Shift+V', pasteLook)
    act('undo', 'Geri al', 'Undo', 'Ctrl+Z', () => st().undo())
    act('redo', 'İleri al', 'Redo', 'Ctrl+Y', () => st().redo())
    act('save', 'Kaydet', 'Save', 'Ctrl+S', () => void saveNow())
    act('home', 'Ana sayfa', 'Home', '', () => void leaveEditorTo('home'))
    act('settings', 'Ayarlar', 'Settings', '', () => void leaveEditorTo('settings'))
    return list
  }, [en])

  const found = useMemo(() => {
    const f = fold(q.trim())
    if (!f) return cmds
    return cmds
      .map((c) => {
        const k = fold(c.keys + ' ' + c.label)
        const score = fold(c.label).startsWith(f) ? 0 : k.includes(f) ? 1 : f.split(/\s+/).every((w) => k.includes(w)) ? 2 : 9
        return { c, score }
      })
      .filter((x) => x.score < 9)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.c)
  }, [q, cmds])

  if (!open) return null
  const go = (c?: Cmd) => {
    if (!c) return
    setOpen(false)
    c.run()
  }
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="dialog palette" role="dialog" aria-modal="true" aria-label={en ? 'Find a tool' : 'Araç bul'}>
        <div className="palette-input">
          <Search size={16} aria-hidden />
          <input
            ref={input}
            className="input"
            value={q}
            placeholder={en ? 'Find a tool or action…' : 'Araç ya da eylem ara…'}
            aria-label={en ? 'Search' : 'Ara'}
            aria-controls="palette-list"
            aria-activedescendant={found[sel] ? 'pal-' + found[sel].id : undefined}
            onChange={(e) => { setQ(e.target.value); setSel(0) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(found.length - 1, s + 1)) }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
              else if (e.key === 'Enter') { e.preventDefault(); go(found[sel]) }
              else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
            }}
          />
        </div>
        <ul id="palette-list" role="listbox" className="palette-list">
          {found.slice(0, 12).map((c, i) => (
            <li key={c.id} id={'pal-' + c.id} role="option" aria-selected={i === sel} className={i === sel ? 'on' : ''} onMouseEnter={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); go(c) }}>
              <span>{c.label}</span>
              <span className="muted">{c.hint}</span>
            </li>
          ))}
          {!found.length && <li className="muted">{en ? 'Nothing found' : 'Bulunamadı'}</li>}
        </ul>
      </div>
    </div>
  )
}
