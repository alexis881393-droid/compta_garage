import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

// Supabase identifie les comptes par e-mail. Les employés se connectent avec un
// pseudo : on en dérive une adresse technique, jamais affichée ni utilisée pour
// envoyer du courrier (la confirmation par e-mail est désactivée côté Supabase).
const DOMAINE = 'compta-garage.local'
const PSEUDO_VALIDE = /^[a-zA-Z0-9_.-]{3,20}$/
const adresse = (pseudo: string) => `${pseudo.toLowerCase()}@${DOMAINE}`

const traduire = (message: string) => {
  if (/invalid login credentials/i.test(message)) return 'Pseudo ou mot de passe incorrect.'
  if (/already registered|already been registered/i.test(message)) return 'Ce pseudo est déjà pris.'
  if (/password should be at least/i.test(message)) return 'Mot de passe trop court (6 caractères minimum).'
  // Le déclencheur SQL creer_profil refuse l'inscription sans code valide ;
  // Supabase ne transmet pas son message, seulement cette erreur générique.
  if (/database error/i.test(message)) return "Code d'invitation invalide ou déjà utilisé."
  return message
}

export default function Login() {
  const [mode, setMode] = useState<'connexion' | 'premiere'>('connexion')
  const [code, setCode] = useState('')
  const [pseudo, setPseudo] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!supabase) return
    const p = pseudo.trim()
    if (!PSEUDO_VALIDE.test(p)) {
      setMessage('Pseudo invalide : 3 à 20 caractères, lettres, chiffres, point, tiret ou underscore.')
      return
    }
    setBusy(true)
    setMessage(null)
    const { error } =
      mode === 'connexion'
        ? await supabase.auth.signInWithPassword({ email: adresse(p), password })
        : await supabase.auth.signUp({
            email: adresse(p),
            password,
            options: { data: { nom: p, code: code.trim().toUpperCase() } },
          })
    if (error) setMessage(traduire(error.message))
    setBusy(false)
  }

  return (
    <main className="card">
      <h1>Compta Garage</h1>
      <form onSubmit={submit}>
        {mode === 'premiere' && (
          <>
            <p className="aide">
              Saisissez le code à 6 caractères donné par la direction, puis choisissez votre pseudo
              et votre mot de passe.
            </p>
            <label>
              Code d'invitation
              <input
                className="code"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                minLength={6}
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
              />
            </label>
          </>
        )}
        <label>
          {mode === 'premiere' ? 'Choisissez un pseudo' : 'Pseudo'}
          <input
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            required
          />
        </label>
        <label>
          {mode === 'premiere' ? 'Choisissez un mot de passe' : 'Mot de passe'}
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
          {mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
        </button>
      </form>
      {message && <p className="notice">{message}</p>}
      <button
        type="button"
        className="link"
        onClick={() => {
          setMode(mode === 'connexion' ? 'premiere' : 'connexion')
          setMessage(null)
        }}
      >
        {mode === 'connexion' ? "Première connexion ? J'ai un code" : "J'ai déjà un compte"}
      </button>
    </main>
  )
}
