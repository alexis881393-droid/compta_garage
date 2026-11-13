import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { date, dateHeure, dollars } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import ResumeSemaine, { CascadeCompta } from '../components/ResumeSemaine'
import type { Message, Resume } from '../lib/types'

type Archive = { id: number; debut: string; fin: string; resume: Resume | null }

type VenteArchive = {
  id: number
  created_at: string
  ticket_id: number | null
  type: 'reparation' | 'custom'
  libelle: string
  quantite: number
  prix_usine: number
  benefice: number
  remise_pct: number
  employe: { nom: string | null } | null
  partenaire: { nom: string } | null
}

type ChargeArchive = {
  id: number
  created_at: string
  libelle: string
  montant: number
  auteur: { nom: string | null } | null
}

/**
 * Une semaine clôturée. Le résumé (compta, salaires, primes) est figé dans
 * l'archive ; le détail des ventes et des charges est relu dans la base à
 * l'ouverture du bloc, ces lignes restant rattachées à leur semaine.
 */
function ArchiveSemaine({ archive: a }: { archive: Archive }) {
  const [ventes, setVentes] = useState<VenteArchive[] | null>(null)
  const [charges, setCharges] = useState<ChargeArchive[] | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const ouvrir = async (ouvert: boolean) => {
    if (!ouvert || ventes || !supabase) return
    const [v, c] = await Promise.all([
      supabase
        .from('ventes')
        .select(
          'id, created_at, ticket_id, type, libelle, quantite, prix_usine, benefice, remise_pct, employe:profils(nom), partenaire:partenaires(nom)',
        )
        .eq('semaine_id', a.id)
        .order('created_at'),
      supabase
        .from('charges')
        .select('id, created_at, libelle, montant, auteur:profils(nom)')
        .eq('semaine_id', a.id)
        .order('created_at'),
    ])
    const err = v.error ?? c.error
    if (err) setErreur(err.message)
    setVentes((v.data as unknown as VenteArchive[] | null) ?? [])
    setCharges((c.data as unknown as ChargeArchive[] | null) ?? [])
  }

  return (
    <details onToggle={(e) => ouvrir(e.currentTarget.open)}>
      <summary>
        Du {date(a.debut)} au {date(a.fin)}
        {a.resume &&
          ` · bénéfice ${dollars(a.resume.benefice)} · reste au garage ${dollars(a.resume.solde)}`}
      </summary>
      <div className="pile">
        {erreur && <p className="notice erreur">Chargement du détail impossible : {erreur}</p>}
        {a.resume && <ResumeSemaine resume={a.resume} sansCharges />}

        <section className="panneau">
          <h2>Charges de la semaine</h2>
          {!charges ? (
            <p className="aide">Chargement…</p>
          ) : charges.length === 0 ? (
            <p className="aide">Aucune charge saisie.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Libellé</th>
                    <th>Saisie par</th>
                    <th className="num">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((c) => (
                    <tr key={c.id}>
                      <td>{dateHeure(c.created_at)}</td>
                      <td>{c.libelle}</td>
                      <td>{c.auteur?.nom ?? '—'}</td>
                      <td className="num">{dollars(c.montant)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3}>Total</td>
                    <td className="num">{dollars(charges.reduce((s, c) => s + c.montant, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>

        <section className="panneau">
          <h2>Toutes les ventes de la semaine</h2>
          {!ventes ? (
            <p className="aide">Chargement…</p>
          ) : ventes.length === 0 ? (
            <p className="aide">Aucune vente.</p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Ticket</th>
                    <th>Employé</th>
                    <th>Vente</th>
                    <th>Partenaire</th>
                    <th className="num">Prix d'usine</th>
                    <th className="num">Bénéfice</th>
                  </tr>
                </thead>
                <tbody>
                  {ventes.map((v) => (
                    <tr key={v.id}>
                      <td>{dateHeure(v.created_at)}</td>
                      <td>{v.ticket_id ?? '—'}</td>
                      <td>{v.employe?.nom ?? '—'}</td>
                      <td>
                        {v.libelle}
                        {v.quantite > 1 && ` × ${v.quantite}`}
                      </td>
                      <td>
                        {v.partenaire ? `${v.partenaire.nom} (−${Number(v.remise_pct)} %)` : '—'}
                      </td>
                      <td className="num">{v.type === 'custom' ? dollars(v.prix_usine) : '—'}</td>
                      <td className="num">{dollars(v.benefice)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>Total ({ventes.length} lignes)</td>
                    <td className="num">{dollars(ventes.reduce((s, v) => s + v.prix_usine, 0))}</td>
                    <td className="num">{dollars(ventes.reduce((s, v) => s + v.benefice, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </section>
      </div>
    </details>
  )
}

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
          archives.map((a) => <ArchiveSemaine key={a.id} archive={a} />)
        )}
      </section>
    </div>
  )
}
