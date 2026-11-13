import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type Profil = {
  id: string
  nom: string | null
  grade: { id: number; nom: string; niveau: number; permissions: string[] } | null
}

type AuthState = {
  session: Session | null
  profil: Profil | null
  loading: boolean
  /** Vrai si le grade de l'utilisateur donne accès à la fonction demandée. */
  peut: (permission: string) => boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profil, setProfil] = useState<Profil | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id
  useEffect(() => {
    if (!supabase || !userId) {
      setProfil(null)
      return
    }
    let cancelled = false
    setLoading(true)
    supabase
      .from('profils')
      .select('id, nom, grade:grades(id, nom, niveau, permissions)')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Chargement du profil impossible :', error.message)
        setProfil((data as unknown as Profil | null) ?? null)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId])

  const peut = (permission: string) => {
    const perms = profil?.grade?.permissions ?? []
    return perms.includes('*') || perms.includes(permission)
  }

  const signOut = async () => {
    await supabase?.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, profil, loading, peut, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}
