import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { dollars } from '../lib/format'
import type { Message, Partenaire } from '../lib/types'

type Tarif = { cle: string; libelle: string; prix: number }

type Ligne =
  | { id: number; type: 'reparation'; cle: string; libelle: string; prix: number; quantite: number }
  | { id: number; type: 'custom'; prixUsine: number }

type Salaire = {
  score: number
  nb_ventes: number
  benefice: number
  salaire_min: number
  salaire_max: number
  salaire: number
  salaire_pct: number
  prime_pct: number
}

export default function Caisse() {
  const [tarifs, setTarifs] = useState<Tarif[]>([])
  const [partenaires, setPartenaires] = useState<Partenaire[]>([])
  const [commissionPct, setCommissionPct] = useState(100)
  const [remisePct, setRemisePct] = useState(20)
  const [erreur, setErreur] = useState<string | null>(null)

  const [lignes, setLignes] = useState<Ligne[]>([])
  const [partenaireId, setPartenaireId] = useState('')
  const [saisieUsine, setSaisieUsine] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  // Incrémenté après chaque ticket validé pour recharger le salaire.
  const [version, setVersion] = useState(0)
  const prochainId = useRef(1)

  useEffect(() => {
    if (!supabase) return
    Promise.all([
      supabase.from('tarifs').select('cle, libelle, prix').order('ordre'),
      supabase.from('reglages').select('cle, valeur'),
      supabase.from('partenaires').select('id, nom, actif').eq('actif', true).order('nom'),
    ]).then(([t, r, p]) => {
      const err = t.error ?? r.error ?? p.error
      if (err) setErreur(err.message)
      setTarifs((t.data as Tarif[] | null) ?? [])
      setPartenaires((p.data as Partenaire[] | null) ?? [])
      for (const reglage of r.data ?? []) {
        if (reglage.cle === 'commission_custom_pct') setCommissionPct(Number(reglage.valeur))
        if (reglage.cle === 'remise_partenaire_pct') setRemisePct(Number(reglage.valeur))
      }
    })
  }, [])

  if (erreur) return <p className="notice erreur">Chargement impossible : {erreur}</p>

  const partenaire = partenaires.find((p) => String(p.id) === partenaireId) ?? null
  const remise = partenaire ? Math.min(remisePct, 100) : 0

  // Mêmes calculs que la fonction SQL enregistrer_ticket, qui fait foi.
  const beneficeBrut = (l: Ligne) =>
    l.type === 'reparation' ? l.prix * l.quantite : (l.prixUsine * commissionPct) / 100
  const benefice = (l: Ligne) => Math.round((beneficeBrut(l) * (100 - remise)) / 100)

  const totalBenefice = lignes.reduce((s, l) => s + benefice(l), 0)
  const totalUsine = lignes.reduce((s, l) => s + (l.type === 'custom' ? l.prixUsine : 0), 0)

  const ajouterReparation = (t: Tarif) => {
    setMessage(null)
    setLignes((ls) => {
      const existante = ls.find((l) => l.type === 'reparation' && l.cle === t.cle)
      if (existante)
        return ls.map((l) =>
          l === existante && l.type === 'reparation' ? { ...l, quantite: l.quantite + 1 } : l,
        )
      return [...ls, { id: prochainId.current++, type: 'reparation', ...t, quantite: 1 }]
    })
  }

  const prixUsine = Math.max(0, Math.floor(Number(saisieUsine) || 0))
  const ajouterCustom = () => {
    if (prixUsine === 0) return
    setMessage(null)
    setLignes((ls) => [...ls, { id: prochainId.current++, type: 'custom', prixUsine }])
    setSaisieUsine('')
  }

  const retirer = (id: number) => setLignes((ls) => ls.filter((l) => l.id !== id))

  const valider = async () => {
    if (!supabase || lignes.length === 0) return
    setBusy(true)
    const { data, error } = await supabase.rpc('enregistrer_ticket', {
      p_lignes: lignes.map((l) =>
        l.type === 'reparation'
          ? { type: 'reparation', cle: l.cle, quantite: l.quantite }
          : { type: 'custom', prix_usine: l.prixUsine },
      ),
      p_partenaire: partenaire?.id ?? null,
    })
    setBusy(false)
    if (error) {
      setMessage({ ok: false, texte: error.message })
      return
    }
    setMessage({
      ok: true,
      texte: partenaire
        ? `Ticket n° ${data} enregistré sur la facture de ${partenaire.nom}.`
        : `Ticket n° ${data} enregistré : ${dollars(totalBenefice)} de bénéfice.`,
    })
    setLignes([])
    setPartenaireId('')
    setVersion((v) => v + 1)
  }

  return (
    <div className="colonnes">
      <div className="pile">
        <section className="panneau">
          <h2>Réparations</h2>
          <p className="aide">Un clic ajoute une réparation au ticket.</p>
          <div className="boutons-reparation">
            {tarifs.map((t) => (
              <button key={t.cle} type="button" className="gros" onClick={() => ajouterReparation(t)}>
                <span>{t.libelle}</span>
                <strong>{dollars(t.prix)}</strong>
              </button>
            ))}
          </div>
        </section>

        <section className="panneau">
          <h2>Ticket de caisse</h2>
          {lignes.length === 0 ? (
            <p className="aide">Ticket vide.</p>
          ) : (
            <ul className="ticket">
              {lignes.map((l) => (
                <li key={l.id}>
                  <span>
                    {l.type === 'reparation'
                      ? `${l.libelle} × ${l.quantite}`
                      : `Custom (usine ${dollars(l.prixUsine)})`}
                  </span>
                  <strong>{dollars(benefice(l))}</strong>
                  <button
                    type="button"
                    className="secondaire petit"
                    onClick={() => retirer(l.id)}
                    aria-label="Retirer la ligne"
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}

          <label>
            Partenaire
            <select value={partenaireId} onChange={(e) => setPartenaireId(e.target.value)}>
              <option value="">Aucun (client normal)</option>
              {partenaires.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom}
                </option>
              ))}
            </select>
          </label>

          {partenaire ? (
            <>
              <dl className="resume">
                <dt>
                  Sur la facture de {partenaire.nom} (remise {remise} %)
                </dt>
                <dd>{dollars(totalBenefice + totalUsine)}</dd>
              </dl>
              <p className="aide">
                Le client ne paie rien sur place.
                {totalUsine > 0 && ` Dont ${dollars(totalUsine)} de prix d'usine, sans remise.`}
              </p>
            </>
          ) : (
            <>
              <dl className="resume">
                <dt>À facturer au client</dt>
                <dd>{dollars(totalBenefice)}</dd>
              </dl>
              {totalUsine > 0 && (
                <p className="aide">
                  Coût total pour le client, prix d'usine compris :{' '}
                  {dollars(totalBenefice + totalUsine)}
                </p>
              )}
            </>
          )}

          <div className="actions">
            <button
              type="button"
              className="valider"
              onClick={valider}
              disabled={busy || lignes.length === 0}
            >
              Valider le ticket
            </button>
            <button
              type="button"
              className="secondaire"
              onClick={() => setLignes([])}
              disabled={busy || lignes.length === 0}
            >
              Tout vider
            </button>
          </div>
          {message && (
            <p className={`notice ${message.ok ? 'succes' : 'erreur'}`}>{message.texte}</p>
          )}
        </section>
      </div>

      <div className="pile">
        <section className="panneau">
          <h2>Custom</h2>
          <p className="aide">Commission du garage : {commissionPct} % du prix d'usine.</p>
          <label>
            Prix d'usine (donné par le script)
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={saisieUsine}
              onChange={(e) => setSaisieUsine(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ajouterCustom()}
              placeholder="0"
            />
          </label>
          <dl className="resume">
            <dt>Bénéfice à facturer</dt>
            <dd>{dollars(Math.round((prixUsine * commissionPct) / 100))}</dd>
          </dl>
          <div className="actions">
            <button type="button" onClick={ajouterCustom} disabled={prixUsine === 0}>
              Ajouter au ticket
            </button>
          </div>
        </section>

        <MonSalaire version={version} />
      </div>
    </div>
  )
}

function MonSalaire({ version }: { version: number }) {
  const [s, setS] = useState<Salaire | null>(null)

  useEffect(() => {
    supabase?.rpc('mon_salaire').then(({ data, error }) => {
      if (error) console.error('Chargement du salaire impossible :', error.message)
      else setS(data as Salaire | null)
    })
  }, [version])

  if (!s) return null
  const etendue = s.salaire_max - s.salaire_min
  const avancement = etendue > 0 ? ((s.salaire - s.salaire_min) / etendue) * 100 : 100

  return (
    <section className="panneau">
      <h2>Mon salaire cette semaine</h2>
      <dl className="resume sans-bordure">
        <dt>Salaire actuel</dt>
        <dd>{dollars(s.salaire)}</dd>
      </dl>
      <div className="jauge" role="img" aria-label={`${Math.round(avancement)} % de la fourchette`}>
        <div style={{ width: `${avancement}%` }} />
      </div>
      <div className="bornes">
        <span>{dollars(s.salaire_min)}</span>
        <span>{dollars(s.salaire_max)}</span>
      </div>
      <p className={`notice ${s.benefice > s.salaire_min ? 'succes' : ''}`}>
        {s.benefice > s.salaire_min
          ? `Salaire minimum remboursé : votre salaire augmente et la prime est débloquée (${s.prime_pct} % de votre part, calculée à la clôture).`
          : `Salaire minimum pas encore remboursé : ni augmentation ni prime. Encore ${dollars(
              s.salaire_min - s.benefice + 1,
            )} de bénéfice à rapporter.`}
      </p>
    </section>
  )
}
