import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import AccesGrades from '../components/AccesGrades'
import type { Message } from '../lib/types'

type Tarif = { cle: string; libelle: string; prix: number }

const POURCENTAGES = [
  { cle: 'commission_custom_pct', libelle: "Commission du garage sur un custom (% du prix d'usine)" },
  { cle: 'remise_partenaire_pct', libelle: 'Remise accordée aux partenaires (%)' },
]

export default function Reglages() {
  const { peut } = useAuth()
  const [tarifs, setTarifs] = useState<Tarif[]>([])
  const [valeurs, setValeurs] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('tarifs').select('cle, libelle, prix').order('ordre'),
      supabase.from('reglages').select('cle, valeur'),
    ]).then(([t, r]) => {
      const err = t.error ?? r.error
      if (err) setMessage({ ok: false, texte: err.message })
      setTarifs((t.data as Tarif[] | null) ?? [])
      setValeurs(Object.fromEntries((r.data ?? []).map((x) => [x.cle, String(x.valeur)])))
    })
  }, [])

  const enregistrer = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage(null)
    const resultats = await Promise.all([
      ...tarifs.map((t) =>
        supabase!.from('tarifs').update({ prix: t.prix }).eq('cle', t.cle).select('cle'),
      ),
      ...POURCENTAGES.map((p) =>
        supabase!
          .from('reglages')
          .update({ valeur: Number(valeurs[p.cle]) })
          .eq('cle', p.cle)
          .select('cle'),
      ),
    ])
    setBusy(false)
    const echec = resultats.find((r) => r.error)
    // Une mise à jour refusée par les droits ne renvoie pas d'erreur, juste zéro ligne.
    const refuse = resultats.some((r) => !r.error && (r.data?.length ?? 0) === 0)
    if (echec) setMessage({ ok: false, texte: echec.error!.message })
    else if (refuse) setMessage({ ok: false, texte: 'Modification refusée : droits insuffisants.' })
    else setMessage({ ok: true, texte: 'Réglages enregistrés.' })
  }

  return (
    <div className="pile">
    <form className="panneau etroit" onSubmit={enregistrer}>
      <h2>Prix des réparations</h2>
      {tarifs.map((t) => (
        <label key={t.cle}>
          {t.libelle} ($)
          <input
            type="number"
            min={0}
            step={1}
            required
            value={t.prix}
            onChange={(e) =>
              setTarifs((ts) =>
                ts.map((x) => (x.cle === t.cle ? { ...x, prix: Number(e.target.value) } : x)),
              )
            }
          />
        </label>
      ))}
      <h2>Pourcentages</h2>
      {POURCENTAGES.map((p) => (
        <label key={p.cle}>
          {p.libelle}
          <input
            type="number"
            min={0}
            max={p.cle === 'remise_partenaire_pct' ? 100 : undefined}
            step="any"
            required
            value={valeurs[p.cle] ?? ''}
            onChange={(e) => setValeurs((v) => ({ ...v, [p.cle]: e.target.value }))}
          />
        </label>
      ))}
      <p className="aide">
        Les ventes déjà enregistrées ne changent pas.
      </p>
      <div className="actions">
        <button type="submit" disabled={busy}>
          Enregistrer
        </button>
      </div>
      {message && <p className={`notice ${message.ok ? 'succes' : 'erreur'}`}>{message.texte}</p>}
    </form>
    {/* Seul le Patron (admin.utilisateurs) choisit les accès des grades */}
    {peut('admin.utilisateurs') && <AccesGrades />}
    </div>
  )
}
