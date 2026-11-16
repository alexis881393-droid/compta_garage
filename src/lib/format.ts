const nombre = new Intl.NumberFormat('fr-FR')
const jour = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' })
const jourHeure = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/** Montant en dollars du serveur, ex. "12 000 $". */
export const dollars = (n: number) => `${nombre.format(n)} $`

export const entier = (n: number) => nombre.format(n)

/**
 * Nom d'un employé : "prénom nom" de sa fiche, à défaut son pseudo. Si le compte a
 * été supprimé, `nomConserve` est le nom gardé sur la vente ou la charge.
 */
export const nomAffiche = (
  p: { nom: string | null; nom_complet: string | null } | null,
  nomConserve?: string | null,
) => p?.nom_complet ?? p?.nom ?? nomConserve ?? '—'

export const date = (iso: string) => jour.format(new Date(iso))

export const dateHeure = (iso: string) => jourHeure.format(new Date(iso))
