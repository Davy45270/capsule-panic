# Capsule Panic

Un puzzle de chute, hors ligne (PWA), en français. Une capsule de deux cellules d'énergie colorées descend dans
la chambre du réacteur (8 × 16 cases) ; aligne quatre cases ou plus d'une même couleur, en ligne ou en colonne,
pour les dissoudre. Le niveau est gagné quand tous les cristaux instables ont disparu.

Moteur pur et déterministe en TypeScript (même graine et mêmes commandes, même partie), npm workspaces, Vite.

```
npm ci
npm run dev      # serveur de développement
npm run build    # typecheck puis build dans dist/
npm run lint
npm test
```

Voir `AGENTS.md` pour les règles du dépôt.

## Crédits et licences

- Code : licence MIT.
- Art (icônes, cristaux, cellules) : original, dessiné pour ce jeu, licence
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
