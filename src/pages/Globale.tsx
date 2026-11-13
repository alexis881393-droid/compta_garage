import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { date, dollars } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import ResumeSemaine from '../components/ResumeSemaine'
import type { Message, Resume } from '../lib/types'

type Archive = { id: number; debut: string; fin: string; resume: Resume | null }

export default function Globale() {
  const { peut } = useAuth()
  const [resume, setResume] = useState<Resume | null>(null)
  const [archives, setArchives] = useState<Archive[]>([])
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState(false)
  const [libelle, setLibelle] = useState('')
  const [montant, setMontant] = useState('')

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

  const ajouterCharge = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase
      .from('charges')
      .insert({ libelle: libelle.trim(), montant: Math.floor(Number(montant)) })
    setBusy(false)
    if (error) {
      setMessage({ ok: false, texte: error.message })
      return
    }
    setMessage(null)
    setLibelle('')
    setMontant('')
    charger()
  }

  const supprimerCharge = async (id: number) => {
    if (!supabase) return
    const { error } = await supabase.from('charges').delete().eq('id', id)
    if (error) setMessage({ ok: false, texte: error.message })
    charger()
  }

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

      <ResumeSemaine resume={resume} />

      <section className="panneau">
        <h2>Charges de la semaine</h2>
        <p className="aide">Les salaires sont ajoutés automatiquement, ne les saisissez pas ici.</p>
        {resume.charges.length > 0 && (
          <ul className="ticket">
            {resume.charges.map((c) => (
              <li key={c.id}>
                <span>{c.libelle}</span>
                <strong>{dollars(c.montant)}</strong>
                <button
                  type="button"
                  className="secondaire petit"
                  onClick={() => supprimerCharge(c.id)}
                >
                  Retirer
                </button>
              </li>
            ))}
          </ul>
        )}
        <form className="ligne-form" onSubmit={ajouterCharge}>
          <label>
            Libellé
            <input value={libelle} onChange={(e) => setLibelle(e.target.value)} required />
          </label>
          <label>
            Montant ($)
            <input
              type="number"
              min={1}
              step={1}
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={busy}>
            Ajouter
          </button>
        </form>
      </section>

      {peut('semaine.cloturer') && (
        <section className="panneau">
          <h2>Clôture de la semaine</h2>
          <p className="aide">
            Archive les résultats ci-dessus et remet la compta à zéro. Les factures partenaires en
            attente sont conservées.
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
