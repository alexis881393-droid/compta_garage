import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { date, dollars } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import ResumeSemaine, { CascadeCompta } from '../components/ResumeSemaine'
import type { Message, Resume } from '../lib/types'

type Archive = { id: number; debut: string; fin: string; resume: Resume | null }

export default function Globale() {
  const { peut } = useAuth()
  const [resume, setResume] = useState<Resume | null>(null)
  const [archives, setArchives] = useState<Archive[]>([])
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)

  const charger = useCallback(async () => {
    if (!supabase) return
    const [r, a] = await Promise.all([
      supabase.rpc('resume_semaine'),
      supabase
        .from('semaines')
        .select('id, debut, fin, resume')
        .not('fin', 'is', null)
        .order('fin', { ascending: false }),
    ])
    const err = r.error ?? a.error
    if (err) setMessage({ ok: false, texte: err.message })
    setResume((r.data as Resume | null) ?? null)
    setArchives((a.data as Archive[] | null) ?? [])
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  const cloturer = async () => {
    if (!supabase) return
    const ok = window.confirm(
      'Clôturer la semaine ? Les résultats sont archivés et la compta repart de zéro. ' +
        'Cette action est définitive.',
    )
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('cloturer_semaine')
    setBusy(false)
    setMessage(
      error
        ? { ok: false, texte: error.message }
        : { ok: true, texte: 'Semaine clôturée et archivée. Nouvelle semaine ouverte.' },
    )
    charger()
  }

  if (!resume)
    return message ? <p className="notice erreur">{message.texte}</p> : <p>Chargement…</p>

  return (
    <div className="pile">
      <p className="aide">Semaine en cours, ouverte le {date(resume.debut)}.</p>
      {message && <p className={`notice ${message.ok ? 'succes' : 'erreur'}`}>{message.texte}</p>}

      <CascadeCompta resume={resume} />

      {peut('semaine.cloturer') && (
        <section className="panneau">
          <h2>Clôture de la semaine</h2>
          <p className="aide">
            Archive la compta, les résultats par employé et les charges, puis remet tout à zéro.
            Les factures partenaires en attente sont conservées.
          </p>
          <div className="actions">
            <button type="button" className="danger" onClick={cloturer} disabled={busy}>
              Clôturer la semaine
            </button>
          </div>
        </section>
      )}

      <section className="panneau">
        <h2>Archives</h2>
        {archives.length === 0 ? (
          <p className="aide">Aucune semaine archivée.</p>
        ) : (
          archives.map((a) => (
            <details key={a.id}>
              <summary>
                Du {date(a.debut)} au {date(a.fin)}
                {a.resume && ` · bénéfice ${dollars(a.resume.benefice)}`}
              </summary>
              {a.resume && (
                <div className="pile">
                  <ResumeSemaine resume={a.resume} />
                </div>
              )}
            </details>
          ))
        )}
      </section>
    </div>
  )
}
