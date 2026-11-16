export type Message = { ok: boolean; texte: string }

/** remise_pct : réduction accordée à ce partenaire sur ses tickets, en %. */
export type Partenaire = { id: number; nom: string; actif: boolean; remise_pct: number }

export type EmployeResume = {
  id: string
  /** Pseudo de connexion. */
  nom: string | null
  /** Prénom et nom réels ; absent des archives antérieures aux fiches. */
  nom_reel?: string | null
  grade: string | null
  score: number
  nb_ventes: number
  benefice: number
  salaire_min: number
  salaire_max: number
  salaire: number
  prime_pct: number
  prime: number
}

/** Résultat de la fonction SQL calcul_semaine (semaine ouverte ou archive). */
export type Resume = {
  semaine_id: number
  debut: string
  fin: string | null
  benefice: number
  benefice_reparations: number
  /** Absent des archives antérieures aux tickets de tombola. */
  benefice_tombola?: number
  benefice_customs: number
  prix_usine: number
  charges_saisies: number
  salaires: number
  imposable: number
  impot: number
  reste: number
  primes: number
  solde: number
  employes: EmployeResume[]
  charges: { id: number; libelle: string; montant: number }[]
}
