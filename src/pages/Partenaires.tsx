import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { dateHeure, dollars, nomAffiche } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'
import type { Message, Partenaire } from '../lib/types'

type LigneFacture = {
  id: number
  created_at: string
  ticket_id: number | null
  partenaire_id: number
  libelle: string
  quantite: number
  prix_usine: number
  benefice: number
  employe: { nom: string | null; nom_complet: string | null } | null
}

export default function Partenaires() {
  const { peut } = useAuth()
  const [partenaires, setPartenaires] = useState<Partenaire[]>([])
  const [lignes, setLignes] = useState<LigneFacture[]>([])
  const [nom, setNom] = useState('')
  const [remiseNouveau, setRemiseNouveau] = useState('20')
  // Remises en cours de saisie, par partenaire, pas encore enregistrées.
  const [brouillons, setBrouillons] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const charger = useCallback(async () => {
    if (!supabase) return
    const [p, v] = await Promise.all([
      supabase.from('partenaires').select('id, nom, actif, remise_pct').order('nom'),
      supabase
        .from('ventes')
        .select(
          'id, created_at, ticket_id, partenaire_id, libelle, quantite, prix_usine, benefice, employe:profils(nom, nom_complet)',
        )
        .not('partenaire_id', 'is', null)
        .is('facture_le', null)
        .order('created_at'),
    ])
    const err = p.error ?? v.error
    if (err) setMessage({ ok: false, texte: err.message })
    setPartenaires((p.data as Partenaire[] | null) ?? [])
    setLignes((v.data as unknown as LigneFacture[] | null) ?? [])
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  const ajouter = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase
      .from('partenaires')
      .insert({ nom: nom.trim(), remise_pct: Number(remiseNouveau) })
    setBusy(false)
    if (error) {
      setMessage({
        ok: false,
        texte: error.code === '23505' ? 'Ce partenaire existe déjà.' : error.message,
      })
      return
    }
    setMessage(null)
    setNom('')
    setRemiseNouveau('20')
    charger()
  }

  const enregistrerRemise = async (p: Partenaire) => {
    if (!supabase) return
    const valeur = Number(brouillons[p.id])
    if (!Number.isFinite(valeur) || valeur < 0 || valeur > 100) {
      setMessage({ ok: false, texte: 'La remise doit être comprise entre 0 et 100 %.' })
      return
    }
    const { data, error } = await supabase
      .from('partenaires')
      .update({ remise_pct: valeur })
      .eq('id', p.id)
      .select('id')
    // Une mise à jour refusée par les droits ne renvoie pas d'erreur, juste zéro ligne.
    if (error || !data || data.length === 0) {
      setMessage({
        ok: false,
        texte: error?.message ?? 'Modification refusée : droits insuffisants.',
      })
      return
    }
    setMessage({
      ok: true,
      texte: `Remise de ${p.nom} : ${valeur} %. Elle s'applique aux prochains tickets.`,
    })
    setBrouillons(({ [p.id]: _ignore, ...reste }) => reste)
    charger()
  }

  const basculer = async (p: Partenaire) => {
    if (!supabase) return
    const { error } = await supabase.from('partenaires').update({ actif: !p.actif }).eq('id', p.id)
    if (error) setMessage({ ok: false, texte: error.message })
    charger()
  }

  const marquerFacture = async (p: Partenaire, total: number) => {
    if (!supabase) return
    if (!window.confirm(`Marquer ${dollars(total)} comme facturés à ${p.nom} ?`)) return
    const { error } = await supabase.rpc('marquer_facture', { p_partenaire: p.id })
    setMessage(
      error
        ? { ok: false, texte: error.message }
        : { ok: true, texte: `Facture de ${p.nom} marquée comme envoyée.` },
    )
    charger()
  }

  const factures = partenaires
    .map((p) => {
      const ls = lignes.filter((l) => l.partenaire_id === p.id)
      return { p, ls, total: ls.reduce((s, l) => s + l.prix_usine + l.benefice, 0) }
    })
    .filter((f) => f.ls.length > 0)

  return (
    <div className="pile">
      {message && <p className={`notice ${message.ok ? 'succes' : 'erreur'}`}>{message.texte}</p>}

      <section className="panneau">
        <h2>Factures partenaires en attente</h2>
        {factures.length === 0 ? (
          <p className="aide">Aucune facture en attente.</p>
        ) : (
          factures.map(({ p, ls, total }) => (
            <details key={p.id}>
              <summary>
                {p.nom} · <strong>{dollars(total)}</strong> à facturer ({ls.length} ligne
                {ls.length > 1 ? 's' : ''})
              </summary>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Ticket</th>
                      <th>Employé</th>
                      <th>Prestation</th>
                      <th className="num">Prix d'usine</th>
                      <th className="num">Garage (remisé)</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ls.map((l) => (
                      <tr key={l.id}>
                        <td>{dateHeure(l.created_at)}</td>
                        <td>{l.ticket_id ?? '—'}</td>
                        <td>{nomAffiche(l.employe)}</td>
                        <td>
                          {l.libelle}
                          {l.quantite > 1 && ` × ${l.quantite}`}
                        </td>
                        <td className="num">{l.prix_usine ? dollars(l.prix_usine) : '—'}</td>
                        <td className="num">{dollars(l.benefice)}</td>
                        <td className="num">{dollars(l.prix_usine + l.benefice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {peut('compta.globale') && (
                <div className="actions">
                  <button type="button" onClick={() => marquerFacture(p, total)}>
                    Marquer comme facturé
                  </button>
                </div>
              )}
            </details>
          ))
        )}
      </section>

      <section className="panneau">
        <h2>Partenaires</h2>
        {partenaires.length === 0 ? (
          <p className="aide">Aucun partenaire.</p>
        ) : (
          <ul className="ticket liste-partenaires">
            {partenaires.map((p) => {
              const saisie = brouillons[p.id]
              const modifiee = saisie !== undefined && Number(saisie) !== Number(p.remise_pct)
              return (
                <li key={p.id}>
                  <span>
                    {p.nom} <span className="discret">{p.actif ? 'Actif' : 'Désactivé'}</span>
                  </span>
                  {peut('partenaires.gerer') ? (
                    <div className="remise-edit">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step="any"
                        value={saisie ?? String(Number(p.remise_pct))}
                        onChange={(e) => setBrouillons((b) => ({ ...b, [p.id]: e.target.value }))}
                        onFocus={(e) => e.target.select()}
                        aria-label={`Remise de ${p.nom} en pourcentage`}
                      />
                      <span>%</span>
                      <button
                        type="button"
                        className="petit"
                        disabled={!modifiee}
                        onClick={() => enregistrerRemise(p)}
                      >
                        Enregistrer
                      </button>
                    </div>
                  ) : (
                    <strong>−{Number(p.remise_pct)} %</strong>
                  )}
                  {peut('partenaires.gerer') && (
                    <button type="button" className="secondaire petit" onClick={() => basculer(p)}>
                      {p.actif ? 'Désactiver' : 'Réactiver'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {peut('partenaires.gerer') && (
          <form className="ligne-form" onSubmit={ajouter}>
            <label>
              Nouveau partenaire
              <input value={nom} onChange={(e) => setNom(e.target.value)} required />
            </label>
            <label className="champ-court">
              Remise (%)
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="any"
                value={remiseNouveau}
                onChange={(e) => setRemiseNouveau(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              Ajouter
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
