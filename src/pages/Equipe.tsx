import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Message } from '../lib/types'

type Grade = { id: number; nom: string; niveau: number }
type Membre = { id: string; nom: string | null; score_social: number; grade_id: number | null }

export default function Equipe() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [membres, setMembres] = useState<Membre[]>([])
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const charger = useCallback(async () => {
    if (!supabase) return
    const [g, p] = await Promise.all([
      supabase.from('grades').select('id, nom, niveau').order('niveau'),
      supabase.from('profils').select('id, nom, score_social, grade_id').order('nom'),
    ])
    const err = g.error ?? p.error
    if (err) setMessage({ ok: false, texte: err.message })
    setGrades((g.data as Grade[] | null) ?? [])
    setMembres((p.data as Membre[] | null) ?? [])
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  const modifier = (id: string, champs: Partial<Membre>) =>
    setMembres((ms) => ms.map((m) => (m.id === id ? { ...m, ...champs } : m)))

  const enregistrer = async (m: Membre) => {
    if (!supabase) return
    setBusy(m.id)
    const { error } = await supabase.rpc('maj_employe', {
      p_id: m.id,
      p_score: m.score_social,
      p_grade: m.grade_id,
    })
    setBusy(null)
    setMessage(
      error
        ? { ok: false, texte: error.message }
        : { ok: true, texte: `${m.nom ?? 'Employé'} mis à jour.` },
    )
    if (error) charger()
  }

  return (
    <section className="panneau">
      <h2>Équipe</h2>
      <p className="aide">
        Le score social fixe la fourchette de salaire et le pourcentage de prime. Un compte sans
        grade n'a accès à rien.
      </p>
      {message && <p className={`notice ${message.ok ? 'succes' : 'erreur'}`}>{message.texte}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Employé</th>
              <th>Grade</th>
              <th>Score social</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {membres.map((m) => (
              <tr key={m.id}>
                <td>{m.nom ?? '—'}</td>
                <td>
                  <select
                    value={m.grade_id ?? ''}
                    onChange={(e) =>
                      modifier(m.id, { grade_id: e.target.value ? Number(e.target.value) : null })
                    }
                    aria-label={`Grade de ${m.nom ?? 'cet employé'}`}
                  >
                    <option value="">Aucun</option>
                    {grades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.nom}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={m.score_social}
                    onChange={(e) =>
                      modifier(m.id, { score_social: Math.max(0, Math.floor(Number(e.target.value))) })
                    }
                    aria-label={`Score social de ${m.nom ?? 'cet employé'}`}
                  />
                </td>
                <td>
                  <button type="button" onClick={() => enregistrer(m)} disabled={busy === m.id}>
                    Enregistrer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
