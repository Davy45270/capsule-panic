# Travailler sur « Capsule Panic »

Guide pour tout agent de code (et tout humain) qui modifie ce dépôt. Les contraintes qui suivent font foi ;
la conception détaillée et les plans de travail sont tenus hors de ce dépôt. Outillage repris d'echecs-kid.

## Contraintes à respecter

- **Garde de marque** : aucun nom de jeu du commerce, de son personnage ou de son éditeur, ni identifiant de ticket
  (majuscules, tiret, chiffres) dans les fichiers suivis par git (`tests/brand-guard.test.ts`). Seule exception :
  la constante de règle du contrat de partie.
- **Identité visuelle propre** : cristaux instables à facettes (hexagone cyan, triangle ambre, losange magenta),
  cellules d'énergie carrées biseautées reliées par un pont lumineux, chambre de réacteur rectangulaire. Jamais de
  personnage en blouse, de créature à visage, de gélule ronde ni de flacon à goulot. La couleur n'est jamais seule :
  la forme est toujours visible.
- **Moteur pur** : `packages/engine/**` et `packages/contracts/**` n'utilisent ni `window`, `document`, `navigator`,
  `Date`, `localStorage`, `fetch`, `performance`, `requestAnimationFrame`, ni `Math.random`, et n'importent ni
  `react`, ni `react-dom`, ni `pixi.js` (imposé par oxlint, vérifié par `tests/engine-purity.test.ts`).
  Aucune fonction publique du moteur ne modifie son argument ; tout aléa passe par l'état RNG de la partie.
- **Dépendances d'exécution** : `ajv` (contrats), `pixi.js` (rendu), `react` et `react-dom` (application).
  Rien d'autre sans accord.
- **Licences** : code MIT ; art original CC BY 4.0 ; aucune dépendance GPL, AGPL, LGPL, SSPL ou CC BY-SA
  (`npm run check:licenses`).
- **Aucune télémétrie, aucune requête réseau** à l'exécution hors fichiers de l'application.

## Paquets

- `packages/contracts` : types publics, schémas JSON, validation d'un état (schéma puis invariants).
- `packages/engine` : PRNG seedé, génération du plateau, transitions pures (`createGame`, `step`), sérialisation.
- `packages/input` : touches du clavier et gestes tactiles → commandes de jeu.
- `packages/renderer` : art original (formes et couleurs décrites une fois) et vue PixiJS du réacteur ; aucune règle.
- `apps/web` : application React (écrans, HUD, boutons tactiles), boucle à pas fixe, IndexedDB, PWA ; le build sort
  dans `dist/` à la racine. `?graine=<texte>` dans l'adresse fixe la partie (tests, partage).
- **Aucun son** : le jeu n'a ni musique ni effets sonores.

## Tests : ciblés, jamais la suite complète

En local : `npx vitest run <fichier>` seulement ; propriétés en version courte (`FC_RUNS=50`). Playwright : des
specs explicites, après `npm run build`. La CI joue tout.

## Commandes

`npm run dev` · `build` (typecheck + vite) · `lint` (oxlint, zéro avertissement) · `typecheck` · `test` (CI) ·
`test:e2e` · `check:precache` (après un build) · `check:licenses`.

## Commits

Auteur du dépôt ; message en français terminé par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
Jamais `git add -A` : ajouter par chemins.

## CI

Woodpecker : `.woodpecker/checks.yml` (npm ci, lint, typecheck, test, build avec l'empreinte `empreinte dist`,
check:precache, audit, licences, secrets) puis `.woodpecker/e2e.yml`.
