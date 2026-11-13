import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion')
  const [nom, setNom] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    setMessage(null)
    const { data, error } =
      mode === 'connexion'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { nom } } })
    if (error) setMessage(error.message)
    else if (mode === 'inscription' && !data.session)
      setMessage('Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.')
    setBusy(false)
  }

  return (
    <main className="card">
      <h1>Compta Garage</h1>
      <form onSubmit={submit}>
        {mode === 'inscription' && (
          <label>
            Nom
            <input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </label>
        )}
        <label>
          E-mail
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          {mode === 'connexion' ? 'Se connecter' : 'Créer le compte'}
        </button>
      </form>
      {message && <p className="notice">{message}</p>}
      <button
        type="button"
        className="link"
        onClick={() => setMode(mode === 'connexion' ? 'inscription' : 'connexion')}
      >
        {mode === 'connexion' ? 'Créer un compte' : "J'ai déjà un compte"}
      </button>
    </main>
  )
}
