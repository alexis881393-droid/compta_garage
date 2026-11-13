import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Message } from '../lib/types'

type Grade = { id: number; nom: string; niveau: number; permissions: string[] }

/** Les accès attribuables, dans l'ordre d'affichage. Mêmes clés que dans le SQL. */
const ACCES = [
  { cle: 'ventes.creer', nom: 'Caisse', aide: 'Valider des tickets de réparation et de custom' },
  { cle: 'ventes.lire_tout', nom: 'Ventes de tous', aide: 'Voir les ventes de tous les employés, pas seulement les siennes' },
  { cle: 'partenaires.gerer', nom: 'Gérer les partenaires', aide: 'Ajouter, désactiver et réactiver des partenaires' },
  {
    cle: 'compta.globale',
    nom: 'Compta et charges',
    aide: 'Charges, résultats employés, compta globale, archives, factures partenaires',
  },
  { cle: 'equipe.gerer', nom: 'Gérer l\'équipe', aide: 'Inviter, changer le grade et le score social des grades inférieurs' },
  { cle: 'reglages.modifier', nom: 'Réglages', aide: 'Changer les prix, la commission et la remise partenaire' },
  { cle: 'semaine.cloturer', nom: 'Clôturer la semaine', aide: 'Archiver la semaine et remettre la compta à zéro' },
] as const

/** Le grade du Patron a tous les accès et ne se modifie pas. */
const toutAcces = (g: Grade) => g.permissions.includes('*')

/** Grille grades × accès : le Patron coche ce que chaque grade peut faire. */
export default function AccesGrades() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [choix, setChoix] = useState<Record<number, string[]>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)

  const charger = async () => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('grades')
      .select('id, nom, niveau, permissions')
      .order('niveau')
    if (error) {
      setMessage({ ok: false, texte: error.message })
      return
    }
    const liste = (data as Grade[]) ?? []
    setGrades(liste)
    setChoix(Object.fromEntries(liste.map((g) => [g.id, g.permissions])))
  }

  useEffect(() => {
    charger()
  }, [])

  const bascule = (grade: Grade, cle: string) => {
    setMessage(null)
    setChoix((c) => {
      const actuel = c[grade.id] ?? []
      return {
        ...c,
        [grade.id]: actuel.includes(cle) ? actuel.filter((p) => p !== cle) : [...actuel, cle],
      }
    })
  }

  const modifies = grades.filter(
    (g) =>
      !toutAcces(g) &&
      [...(choix[g.id] ?? [])].sort().join() !== [...g.permissions].sort().join(),
  )

  const enregistrer = async () => {
    if (!supabase || modifies.length === 0) return
    setBusy(true)
    const resultats = await Promise.all(
      modifies.map((g) =>
        supabase!.rpc('maj_permissions', { p_grade: g.id, p_permissions: choix[g.id] ?? [] }),
      ),
    )
    setBusy(false)
    const echec = resultats.find((r) => r.error)
    if (echec) {
      setMessage({ ok: false, texte: echec.error!.message })
    } else {
      setMessage({
        ok: true,
        texte:
          'Accès enregistrés. Les employés connectés les voient après un rechargement de la page.',
      })
    }
    charger()
  }

  return (
    <section className="panneau">
      <h2>Accès par grade</h2>
      <p className="aide">
        Coche ce que chaque grade a le droit de faire. Le Patron a toujours tous les accès. Les
        onglets du site s'adaptent aux accès cochés.
      </p>
      <div className="table-scroll">
        <table className="acces">
          <thead>
            <tr>
              <th>Accès</th>
              {grades.map((g) => (
                <th key={g.id} className="centre">
                  {g.nom}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ACCES.map((a) => (
              <tr key={a.cle}>
                <td>
                  <strong>{a.nom}</strong>
                  <br />
                  <span className="discret">{a.aide}</span>
                </td>
                {grades.map((g) => (
                  <td key={g.id} className="centre">
                    <input
                      type="checkbox"
                      checked={toutAcces(g) || (choix[g.id] ?? []).includes(a.cle)}
                      disabled={toutAcces(g)}
                      onChange={() => bascule(g, a.cle)}
                      aria-label={`${a.nom} pour ${g.nom}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="actions">
        <button type="button" onClick={enregistrer} disabled={busy || modifies.length === 0}>
          Enregistrer les accès
        </button>
      </div>
      {message && <p className={`notice ${message.ok ? 'succes' : 'erreur'}`}>{message.texte}</p>}
    </section>
  )
}
