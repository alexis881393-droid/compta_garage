const nombre = new Intl.NumberFormat('fr-FR')
const jour = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' })
const jourHeure = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

/** Montant en dollars du serveur, ex. "12 000 $". */
export const dollars = (n: number) => `${nombre.format(n)} $`

export const entier = (n: number) => nombre.format(n)

export const date = (iso: string) => jour.format(new Date(iso))

export const dateHeure = (iso: string) => jourHeure.format(new Date(iso))
