import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : le même build marche à la racine d'un domaine (Netlify)
  // comme dans un sous-dossier (GitHub Pages : /compta_garage/).
  base: './',
})
