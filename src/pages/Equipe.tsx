import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { Message } from '../lib/types'

type Grade = { id: number; nom: string; niveau: number }

type Fiche = {
  id: number
  code: string | null
  prenom: string
  nom: string
  telephone: string
  score_social: number
  grade_id: number | null
  profil_id: string | null
  profil: { nom: string | null; score_social: number; grade_id: number | null } | null
}

const VIDE = { prenom: '', nom: '', telephone: '', score: '0', grade: '' }

export default function Equipe() {
  const [grades, setGrades] = useState<Grade[]>([])
  const [fiches, setFiches] = useState<Fiche[]>([])
  const [message, setMessage] = useState<Message | null>(null)
  const [busy, setBusy] = useState<number | 'nouveau' | null>(null)
  const [nouveau, setNouveau] = useState(VIDE)
  const [dernierCode, setDernierCode] = useState<{ code: string; pour: string } | null>(null)

  const charger = useCallback(async () => {
    if (!supabase) return
    const [g, f] = await Promise.all([
      supabase.from('grades').select('id, nom, niveau').order('niveau'),
      supabase
        .from('fiches')
        .select(
          'id, code, prenom, nom, telephone, score_social, grade_id, profil_id, profil:profils(nom, score_social, grade_id)',
        )
        .order('created_at'),
    ])
    const err = g.error ?? f.error
    if (err) setMessage({ ok: false, texte: err.message })
    setGrades((g.data as Grade[] | null) ?? [])
    // Compte déjà créé : le score et le grade à jour sont ceux du profil.
    setFiches(
      ((f.data as unknown as Fiche[] | null) ?? []).map((x) =>
        x.profil
          ? { ...x, score_social: x.profil.score_social, grade_id: x.profil.grade_id }
          : x,
      ),
    )
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  const creer = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy('nouveau')
    const { data, error } = await supabase.rpc('creer_invitation', {
      p_prenom: nouveau.prenom,
      p_nom: nouveau.nom,
      p_telephone: nouveau.telephone,
      p_score: Math.max(0, Math.floor(Number(nouveau.score) || 0)),
      p_grade: Number(nouveau.grade),
    })
    setBusy(null)
    if (error) {
      setMessage({ ok: false, texte: error.message })
      return
    }
    setMessage(null)
    setDernierCode({ code: data as string, pour: `${nouveau.prenom} ${nouveau.nom}`.trim() })
    setNouveau(VIDE)
    charger()
  }

  const modifier = (id: number, champs: Partial<Fiche>) =>
    setFiches((fs) => fs.map((f) => (f.id === id ? { ...f, ...champs } : f)))

  const enregistrer = async (f: Fiche) => {
    if (!supabase) return
    setBusy(f.id)
    const { error } = await supabase.rpc('maj_fiche', {
      p_id: f.id,
      p_prenom: f.prenom,
      p_nom: f.nom,
      p_telephone: f.telephone,
      p_score: f.score_social,
      p_grade: f.grade_id,
    })
    setBusy(null)
    setMessage(
      error
        ? { ok: false, texte: error.message }
        : { ok: true, texte: `Fiche de ${`${f.prenom} ${f.nom}`.trim() || f.profil?.nom || 'cet employé'} enregistrée.` },
    )
    if (error) charger()
  }

  const annuler = async (f: Fiche) => {
    if (!supabase) return
    if (!window.confirm(`Annuler l'invitation de ${f.prenom} ${f.nom} ? Son code ne marchera plus.`))
      return
    const { error } = await supabase.rpc('annuler_invitation', { p_id: f.id })
    if (error) setMessage({ ok: false, texte: error.message })
    charger()
  }

  const qui = (f: Fiche) => `${f.prenom} ${f.nom}`.trim() || f.profil?.nom || 'cet employé'

  return (
    <div className="pile">
      {message && <p className={`notice ${message.ok ? 'succes' : 'erreur'}`}>{message.texte}</p>}

      <section className="panneau">
        <h2>Ajouter un employé</h2>
        <p className="aide">
          Le site génère un code à 6 caractères. L'employé le saisit à sa première connexion pour
          choisir son pseudo et son mot de passe. Sans code, personne ne peut créer de compte.
        </p>
        <form className="ligne-form" onSubmit={creer}>
          <label>
            Prénom
            <input
              value={nouveau.prenom}
              onChange={(e) => setNouveau({ ...nouveau, prenom: e.target.value })}
              required
            />
          </label>
          <label>
            Nom
            <input
              value={nouveau.nom}
              onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
              required
            />
          </label>
          <label>
            Téléphone
            <input
              type="tel"
              value={nouveau.telephone}
              onChange={(e) => setNouveau({ ...nouveau, telephone: e.target.value })}
            />
          </label>
          <label>
            Score social
            <input
              type="number"
              min={0}
              step={1}
              value={nouveau.score}
              onChange={(e) => setNouveau({ ...nouveau, score: e.target.value })}
              required
            />
          </label>
          <label>
            Grade
            <select
              value={nouveau.grade}
              onChange={(e) => setNouveau({ ...nouveau, grade: e.target.value })}
              required
            >
              <option value="">Choisir…</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy === 'nouveau'}>
            Créer et générer le code
          </button>
        </form>
        {dernierCode && (
          <p className="notice succes">
            Code pour {dernierCode.pour} : <strong className="code">{dernierCode.code}</strong>
            <br />À lui transmettre. Il reste affiché dans le tableau tant qu'il n'est pas utilisé.
          </p>
        )}
      </section>

      <section className="panneau">
        <h2>Équipe</h2>
        <p className="aide">
          Vrai nom et téléphone ne sont visibles que par la direction. Le score social fixe la
          fourchette de salaire et le pourcentage de prime.
        </p>
        <div className="table-scroll">
          <table className="equipe">
            <colgroup>
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '17%' }} />
            </colgroup>
            <thead>
              <tr>
                <th>Prénom</th>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>Pseudo / code</th>
                <th>Grade</th>
                <th>Score social</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fiches.map((f) => (
                <tr key={f.id}>
                  <td>
                    <input
                      value={f.prenom}
                      onChange={(e) => modifier(f.id, { prenom: e.target.value })}
                      aria-label={`Prénom de ${qui(f)}`}
                    />
                  </td>
                  <td>
                    <input
                      value={f.nom}
                      onChange={(e) => modifier(f.id, { nom: e.target.value })}
                      aria-label={`Nom de ${qui(f)}`}
                    />
                  </td>
                  <td>
                    <input
                      type="tel"
                      value={f.telephone}
                      onChange={(e) => modifier(f.id, { telephone: e.target.value })}
                      aria-label={`Téléphone de ${qui(f)}`}
                    />
                  </td>
                  <td>
                    {f.profil_id ? (
                      (f.profil?.nom ?? '—')
                    ) : (
                      <>
                        <strong className="code">{f.code}</strong>{' '}
                        <span className="discret">en attente</span>
                      </>
                    )}
                  </td>
                  <td>
                    <select
                      value={f.grade_id ?? ''}
                      onChange={(e) =>
                        modifier(f.id, { grade_id: e.target.value ? Number(e.target.value) : null })
                      }
                      aria-label={`Grade de ${qui(f)}`}
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
                      value={f.score_social}
                      onChange={(e) =>
                        modifier(f.id, {
                          score_social: Math.max(0, Math.floor(Number(e.target.value))),
                        })
                      }
                      aria-label={`Score social de ${qui(f)}`}
                    />
                  </td>
                  <td>
                    <div className="actions">
                      <button type="button" onClick={() => enregistrer(f)} disabled={busy === f.id}>
                        Enregistrer
                      </button>
                      {!f.profil_id && (
                        <button type="button" className="secondaire" onClick={() => annuler(f)}>
                          Annuler
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
