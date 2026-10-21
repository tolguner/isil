// Vücut panellerinin kapısı: fotoğrafta 18 yaşından küçük görünen biri varsa panel yerine açıklama gösterilir.
// Yaş yerel görsel dil modeliyle bir kez sorulur; model kurulu değilse panel açık kalır (bkz. ai/agecheck.ts).
import { useEffect, useState, type ReactNode } from 'react'
import { ShieldAlert } from 'lucide-react'
import { session } from '@/engine/session'
import { ageVerdict, MINOR_TEXT, type AgeVerdict } from '@/ai/agecheck'

export function MinorGate({ children }: { children: ReactNode }) {
  const [v, setV] = useState<AgeVerdict | 'checking'>('checking')
  useEffect(() => {
    let live = true
    const img = session.preview
    if (!img) { setV('unknown'); return }
    void ageVerdict(img).then((r) => live && setV(r)).catch(() => live && setV('unknown'))
    return () => { live = false }
  }, [session.baseKey])
  if (v === 'minor') return <div className="card" role="alert"><b><ShieldAlert size={14} /> {MINOR_TEXT()}</b></div>
  return <>{children}</>
}
