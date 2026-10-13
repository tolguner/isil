import { useEditor } from '@/store/editor'

/** İki dilli metin: tr(…, …). Bileşenlerde: const tr = useT(); tr('Ayarla', 'Adjust') */
export function useT() {
  const lang = useEditor((s) => s.settings.language)
  return (trText: string, enText: string) => (lang === 'en' ? enText : trText)
}
export function tNow(trText: string, enText: string) {
  return useEditor.getState().settings.language === 'en' ? enText : trText
}
export function useLang() {
  return useEditor((s) => s.settings.language)
}
export type Named = { tr: string; en: string }
export function useName() {
  const lang = useLang()
  return (n: Named) => n[lang]
}
