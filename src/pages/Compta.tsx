import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dollars } from '../lib/format'
import { useAuth } from '../auth/AuthProvider'

type Vente = {
  id: number
  created_at: string
  type: 'reparation' | 'custom'
  libelle: string
  quantite: number
  prix_usine: number
  benefice: number
  employe: { nom: string | null } | null
}
type Total = { type: string; nombre: number; prix_usine: number; benefice: number }

const LIMITE = 100
const dateHeure = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

export default function Compta() {
  const { peut } = useAuth()
  const [ventes, setVentes] = useState<Vente[]>([])
  const [totaux, setTotaux] = useState<Total[]>([])
  const [erreur, setErreur] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const client = supabase
    if (!client) return
    // Seules les ventes de la semaine ouverte sont affichées ; les semaines
    // clôturées se consultent dans les archives de la compta globale.
    client
      .rpc('semaine_ouverte')
      .then((s) =>
        Promise.all([
          s,
          client
            .from('ventes')
            .select(
              'id, created_at, type, libelle, quantite, prix_usine, benefice, employe:profils(nom)',
            )
            .eq('semaine_id', s.data ?? -1)
            .order('created_at', { ascending: false })
            .limit(LIMITE),
          client.rpc('totaux_ventes'),
        ]),
      )
      .then(([s, v, t]) => {
        const err = s.error ?? v.error ?? t.error
        if (err) setErreur(err.message)
        setVentes((v.data as unknown as Vente[] | null) ?? [])
        setTotaux((t.data as Total[] | null) ?? [])
        setLoading(false)
      })
  }, [])

  if (loading) return <p>Chargement…</p>
  if (erreur) return <p className="notice erreur">Chargement impossible : {erreur}</p>

  const total = (type: string) => totaux.find((t) => t.type === type)
  const beneficeRepa = Number(total('reparation')?.benefice ?? 0)
  const beneficeCustom = Number(total('custom')?.benefice ?? 0)

  return (
    <>
      <p className="aide">
        Semaine en cours.{' '}
        {peut('ventes.lire_tout') ? 'Ventes de tout le garage.' : 'Vos ventes uniquement.'}
      </p>
      <div className="tuiles">
        <div className="tuile">
          <span>Bénéfice total</span>
          <strong>{dollars(beneficeRepa + beneficeCustom)}</strong>
        </div>
        <div className="tuile">
          <span>Réparations ({total('reparation')?.nombre ?? 0} lignes)</span>
          <strong>{dollars(beneficeRepa)}</strong>
        </div>
        <div className="tuile">
          <span>Commissions custom ({total('custom')?.nombre ?? 0})</span>
          <strong>{dollars(beneficeCustom)}</strong>
        </div>
        <div className="tuile">
          <span>Prix d'usine cumulé (hors garage)</span>
          <strong>{dollars(Number(total('custom')?.prix_usine ?? 0))}</strong>
        </div>
      </div>

      <section className="panneau">
        <h2>Dernières ventes</h2>
        {ventes.length === 0 ? (
          <p className="aide">Aucune vente enregistrée.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Employé</th>
                  <th>Vente</th>
                  <th className="num">Prix d'usine</th>
                  <th className="num">Bénéfice</th>
                </tr>
              </thead>
              <tbody>
                {ventes.map((v) => (
                  <tr key={v.id}>
                    <td>{dateHeure.format(new Date(v.created_at))}</td>
                    <td>{v.employe?.nom ?? '—'}</td>
                    <td>
                      {v.libelle}
                      {v.quantite > 1 && ` × ${v.quantite}`}
                    </td>
                    <td className="num">{v.type === 'custom' ? dollars(v.prix_usine) : '—'}</td>
                    <td className="num">{dollars(v.benefice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {ventes.length === LIMITE && (
          <p className="aide">Liste limitée aux {LIMITE} dernières ventes. Les totaux couvrent tout.</p>
        )}
      </section>
    </>
  )
}
