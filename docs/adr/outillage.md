# Outillage commun : npm, Woodpecker, ESLint et Prettier

Garder la chaîne commune aux jeux du dépôt, décidée par le mainteneur le 2026-11-19 : npm avec un lockfile figé (`npm ci`), Woodpecker comme CI, ESLint et Prettier pour le style et les règles. Oxlint reste devant ESLint dans `npm run lint` pour les règles typées ; il complète la chaîne, il ne remplace ni ESLint ni Prettier. Le SAST passe par ESLint avec `eslint-plugin-security` (`eslint.security.config.mjs`).

`npm run lint` enchaîne oxlint et ESLint, sans aucun avertissement toléré, puis `prettier --check`. ESLint lit tout le dépôt ; Prettier ne vérifie que la liste de fichiers nommée dans le script `lint` de `package.json`, il faut donc y ajouter un fichier pour qu’il soit contrôlé.

La CI Woodpecker (`.woodpecker/checks.yml`) suit l’ordre de la spec : lockfile figé, lint, typecheck, tests unitaires et par propriétés, build, Playwright, SCA/SAST, artefacts. L’artefact est une archive de `dist/` dont l’empreinte est affichée ; la forge n’a pas de serveur de rétention d’artefacts et la chaîne n’en suppose pas.

## Test discriminant

[lint exige les trois outils et zéro avertissement](../../tests/tooling.test.ts)
[Woodpecker suit lockfile figé → lint → tsc → unit/property → build → Playwright → SCA/SAST → artefacts](../../tests/ci-ordre.test.ts)
