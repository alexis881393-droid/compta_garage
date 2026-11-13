// Jeu d'icônes maison au trait, une par onglet. Même grille 24 px et même
// épaisseur de trait pour toutes.
const TRACES = {
  caisse: 'M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6',
  compta: 'M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01',
  charges: 'M3 6h18v12H3z M3 10h18 M7 14h4',
  partenaires:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M3 19c0-3 2.7-5 6-5s6 2 6 5 M15.5 15c2.8 0 5.5 1.4 5.5 4',
  employes: 'M5 20V10 M12 20V4 M19 20v-7',
  globale: 'M12 3a9 9 0 1 0 9 9h-9z M15 3.6A9 9 0 0 1 20.4 9H15z',
  equipe:
    'M4 5h16v14H4z M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4z M6 16c0-1.7 1.3-3 3-3s3 1.3 3 3 M14 9h4 M14 13h4',
  reglages: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M16 5v4 M8 15v4',
  sortie: 'M10 4H5v16h5 M15 8l4 4-4 4 M19 12H9',
} as const

export type NomIcone = keyof typeof TRACES

export default function Icone({ nom }: { nom: NomIcone }) {
  return (
    <svg
      className="icone"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TRACES[nom]} />
    </svg>
  )
}
