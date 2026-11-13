import { dollars, entier } from '../lib/format'
import type { Resume } from '../lib/types'

/** Compta globale d'une semaine : calcul en cascade puis une ligne par employé. */
export default function ResumeSemaine({ resume }: { resume: Resume }) {
  const r = resume
  return (
    <>
      <section className="panneau">
        <h2>Compta globale</h2>
        <dl className="cascade">
          <dt>Bénéfice réparations</dt>
          <dd>{dollars(r.benefice_reparations)}</dd>
          <dt>Commissions custom</dt>
          <dd>{dollars(r.benefice_customs)}</dd>
          <dt className="fort">Bénéfice</dt>
          <dd className="fort">{dollars(r.benefice)}</dd>
          <dt>− Charges saisies</dt>
          <dd>{dollars(r.charges_saisies)}</dd>
          <dt>− Salaires</dt>
          <dd>{dollars(r.salaires)}</dd>
          <dt className="fort">Bénéfice imposable</dt>
          <dd className="fort">{dollars(r.imposable)}</dd>
          <dt>− Impôt</dt>
          <dd>{dollars(r.impot)}</dd>
          <dt className="fort">Reste après impôt</dt>
          <dd className="fort">{dollars(r.reste)}</dd>
          <dt>− Primes</dt>
          <dd>{dollars(r.primes)}</dd>
          <dt className="fort">Reste au garage</dt>
          <dd className="fort">{dollars(r.solde)}</dd>
        </dl>
        <p className="aide">
          Prix d'usine cumulé des customs (hors garage) : {dollars(r.prix_usine)}
        </p>
      </section>

      <section className="panneau">
        <h2>Résultats par employé</h2>
        {r.employes.length === 0 ? (
          <p className="aide">Aucun employé.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employé</th>
                  <th>Grade</th>
                  <th className="num">Score social</th>
                  <th className="num">Lignes</th>
                  <th className="num">Bénéfice</th>
                  <th className="num">Salaire</th>
                  <th className="num">Prime</th>
                  <th className="num">Total à verser</th>
                </tr>
              </thead>
              <tbody>
                {r.employes.map((e) => (
                  <tr key={e.id}>
                    <td>{e.nom ?? '—'}</td>
                    <td>{e.grade ?? '—'}</td>
                    <td className="num">{entier(e.score)}</td>
                    <td className="num">{e.nb_ventes}</td>
                    <td className="num">{dollars(e.benefice)}</td>
                    <td className="num">{dollars(e.salaire)}</td>
                    <td className="num">
                      {dollars(e.prime)} <span className="discret">({e.prime_pct} %)</span>
                    </td>
                    <td className="num">
                      <strong>{dollars(e.salaire + e.prime)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {r.charges.length > 0 && r.fin && (
        <section className="panneau">
          <h2>Charges saisies</h2>
          <ul className="ticket">
            {r.charges.map((c) => (
              <li key={c.id}>
                <span>{c.libelle}</span>
                <strong>{dollars(c.montant)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
