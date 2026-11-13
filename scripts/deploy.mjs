// Déploie le dossier dist/ sur Netlify sans passer par Git.
// Usage : npm run build && node scripts/deploy.mjs
// Lit NETLIFY_AUTH_TOKEN dans le fichier .tokens (exclu de Git).
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SITE = '2a745aad-5445-4e98-998a-2cd4d5dcfc0b'
const API = 'https://api.netlify.com/api/v1'

const token = readFileSync('.tokens', 'utf8').match(/^NETLIFY_AUTH_TOKEN=(.+)$/m)?.[1]?.trim()
if (!token) throw new Error('NETLIFY_AUTH_TOKEN absent du fichier .tokens')
const auth = { Authorization: `Bearer ${token}` }

// Chemin publié (toujours avec des "/") -> fichier local
const fichiers = {}
const parcourir = (dossier) => {
  for (const nom of readdirSync(dossier)) {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) parcourir(chemin)
    else fichiers['/' + relative('dist', chemin).split(sep).join('/')] = chemin
  }
}
parcourir('dist')

const empreintes = Object.fromEntries(
  Object.entries(fichiers).map(([publie, local]) => [
    publie,
    createHash('sha1').update(readFileSync(local)).digest('hex'),
  ]),
)

const json = async (reponse) => {
  if (!reponse.ok) throw new Error(`${reponse.status} ${await reponse.text()}`)
  return reponse.json()
}

let deploy = await json(
  await fetch(`${API}/sites/${SITE}/deploys`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: empreintes }),
  }),
)

// Netlify ne redemande que les fichiers qu'il ne connaît pas déjà.
for (const [publie, local] of Object.entries(fichiers)) {
  if (!deploy.required?.includes(empreintes[publie])) continue
  await json(
    await fetch(`${API}/deploys/${deploy.id}/files${publie}`, {
      method: 'PUT',
      headers: { ...auth, 'Content-Type': 'application/octet-stream' },
      body: readFileSync(local),
    }),
  )
  console.log('envoyé', publie)
}

for (let i = 0; i < 30 && !['ready', 'error'].includes(deploy.state); i++) {
  await new Promise((r) => setTimeout(r, 2000))
  deploy = await json(await fetch(`${API}/deploys/${deploy.id}`, { headers: auth }))
}
console.log(`Déploiement ${deploy.state} : ${deploy.ssl_url}`)
if (deploy.state !== 'ready') process.exit(1)
