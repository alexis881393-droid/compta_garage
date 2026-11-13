import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { date } from '../lib/format'
import { TableEmployes } from '../components/ResumeSemaine'
import type { Resume } from '../lib/types'

export default function Employes() {
  const [resume, setResume] = useState<Resume | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    supabase?.rpc('resume_semaine').then(({ data, error }) => {
      if (error) setErreur(error.message)
      else setResume(data as Resume)
    })
  }, [])

  if (erreur) return <p className="notice erreur">Chargement impossible : {erreur}</p>
  if (!resume) return <p>Chargement…</p>

  return (
    <div className="pile">
      <p className="aide">
        Semaine en cours, ouverte le {date(resume.debut)}. Les primes sont provisoires jusqu'à la
        clôture : elles dépendent du bénéfice et des charges de toute la semaine.
      </p>
      <TableEmployes resume={resume} />
    </div>
  )
}
