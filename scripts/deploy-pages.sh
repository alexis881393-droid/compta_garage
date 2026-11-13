#!/usr/bin/env bash
# Met en ligne le dossier dist/ sur GitHub Pages (branche gh-pages du dépôt).
# Usage : npm run build && bash scripts/deploy-pages.sh
# Gratuit et sans quota de déploiement. Site : https://alexis881393-droid.github.io/compta_garage/
set -euo pipefail

racine="$(cd "$(dirname "$0")/.." && pwd)"
depot="$(git -C "$racine" remote get-url origin)"
version="$(git -C "$racine" rev-parse --short HEAD)"
tmp="$(mktemp -d)"

cp -r "$racine/dist/." "$tmp/"
# Sans ce fichier, GitHub Pages ignore les fichiers commençant par "_".
touch "$tmp/.nojekyll"

cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="deploy" -c user.email="deploy@users.noreply.github.com" \
  commit -q -m "Mise en ligne de $version"
git push -q --force "$depot" gh-pages
echo "En ligne (délai d'une minute environ) : https://alexis881393-droid.github.io/compta_garage/"
