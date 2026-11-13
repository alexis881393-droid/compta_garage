import { useState } from 'react'
import { supabaseConfigured } from './lib/supabase'
import { useAuth } from './auth/AuthProvider'
import Login from './pages/Login'
import Caisse from './pages/Caisse'
import Compta from './pages/Compta'
import Reglages from './pages/Reglages'
import Globale from './pages/Globale'
import Partenaires from './pages/Partenaires'
import Equipe from './pages/Equipe'

type Onglet = 'caisse' | 'compta' | 'partenaires' | 'globale' | 'equipe' | 'reglages'

export default function App() {
  const { session, profil, loading, peut, signOut } = useAuth()
  const [onglet, setOnglet] = useState<Onglet>('caisse')

  if (!supabaseConfigured) {
    return (
      <main className="card">
        <h1>Compta Garage</h1>
        <p className="notice">
          Base de données non configurée : renseignez <code>VITE_SUPABASE_URL</code> et{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (voir <code>.env.example</code>).
        </p>
      </main>
    )
  }

  if (loading) return <main className="card">Chargement…</main>
  if (!session) return <Login />

  const onglets: { id: Onglet; nom: string; visible: boolean }[] = [
    { id: 'caisse', nom: 'Caisse', visible: peut('ventes.creer') },
    { id: 'compta', nom: 'Ventes', visible: Boolean(profil?.grade) },
    {
      id: 'partenaires',
      nom: 'Partenaires',
      visible: peut('partenaires.gerer') || peut('compta.globale'),
    },
    { id: 'globale', nom: 'Compta globale', visible: peut('compta.globale') },
    { id: 'equipe', nom: 'Équipe', visible: peut('equipe.gerer') },
    { id: 'reglages', nom: 'Réglages', visible: peut('reglages.modifier') },
  ]
  const visibles = onglets.filter((o) => o.visible)
  const actif = visibles.find((o) => o.id === onglet) ?? visibles[0]

  return (
    <div className="app">
      <header>
        <h1>Compta Garage</h1>
        <div className="compte">
          <span>
            <strong>{profil?.nom ?? session.user.email?.split('@')[0]}</strong>
            {profil?.grade && ` · ${profil.grade.nom}`}
          </span>
          <button type="button" className="secondaire" onClick={signOut}>
            Se déconnecter
          </button>
        </div>
      </header>

      {!actif ? (
        <p className="notice">
          Aucun grade attribué. Un administrateur doit vous en attribuer un pour accéder aux
          fonctions.
        </p>
      ) : (
        <>
          <nav>
            {visibles.map((o) => (
              <button
                key={o.id}
                type="button"
                className={o.id === actif.id ? 'onglet actif' : 'onglet'}
                onClick={() => setOnglet(o.id)}
              >
                {o.nom}
              </button>
            ))}
          </nav>
          <main>
            {actif.id === 'caisse' && <Caisse />}
            {actif.id === 'compta' && <Compta />}
            {actif.id === 'partenaires' && <Partenaires />}
            {actif.id === 'globale' && <Globale />}
            {actif.id === 'equipe' && <Equipe />}
            {actif.id === 'reglages' && <Reglages />}
          </main>
        </>
      )}
    </div>
  )
}
