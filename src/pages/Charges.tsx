import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { dateHeure, dollars } from '../lib/format'
import type { Message } from '../lib/types'

type Charge = {
  id: number
  created_at: string
  libelle: string
  montant: number
  auteur: { nom: string | null } | null
}

export default function Charges() {
  const [charges, setCharges] = useState<Charge[]>([])
  const [libelle, setLibelle] = useState('')
  const [montant, setMontant] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<Message | null>(null)

  const charger = useCallback(async () => {
    if (!supabase) return
    // Uniquement les charges de la semaine ouverte ; celles des semaines
    // clôturées se consultent dans les archives de la compta globale.
    const semaine = await supabase.rpc('semaine_ouverte')
    const c = await supabase
      .from('charges')
      .select('id, created_at, libelle, montant, auteur:profils(nom)')
      .eq('semaine_id', semaine.data ?? -1)
      .order('created_at', { ascending: false })
    const err = semaine.error ?? c.error
    if (err) setMessage({ ok: false, texte: err.message })
    setCharges((c.data as unknown as Charge[] | null) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    charger()
  }, [charger])

  const ajouter = async (e: FormEvent) => {
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

  const retirer = async (c: Charge) => {
    if (!supabase) return
    if (!window.confirm(`Retirer la charge « ${c.libelle} » (${dollars(c.montant)}) ?`)) return
    const { error } = await supabase.from('charges').delete().eq('id', c.id)
    if (error) setMessage({ ok: false, texte: error.message })
    charger()
  }

  const total = charges.reduce((s, c) => s + c.montant, 0)

  return (
    <div className="pile">
      {message && <p className={`notice ${message.ok ? 'succes' : 'erreur'}`}>{message.texte}</p>}

      <section className="panneau">
        <h2>Ajouter une charge</h2>
        <p className="aide">
          Les salaires sont ajoutés automatiquement à la compta, ne les saisissez pas ici.
        </p>
        <form className="ligne-form" onSubmit={ajouter}>
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

      <section className="panneau">
        <h2>Charges de la semaine</h2>
        {loading ? (
          <p className="aide">Chargement…</p>
        ) : charges.length === 0 ? (
          <p className="aide">Aucune charge saisie cette semaine.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Libellé</th>
                  <th>Saisie par</th>
                  <th className="num">Montant</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {charges.map((c) => (
                  <tr key={c.id}>
                    <td>{dateHeure(c.created_at)}</td>
                    <td>{c.libelle}</td>
                    <td>{c.auteur?.nom ?? '—'}</td>
                    <td className="num">{dollars(c.montant)}</td>
                    <td className="num">
                      <button type="button" className="secondaire petit" onClick={() => retirer(c)}>
                        Retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total ({charges.length} ligne{charges.length > 1 ? 's' : ''})</td>
                  <td className="num">
                    <strong>{dollars(total)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
