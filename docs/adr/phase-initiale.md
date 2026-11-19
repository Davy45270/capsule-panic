# Phase initiale

`createGame` démarre en `FALLING` avec une capsule active à la position d’apparition. La première commande peut déplacer la capsule immédiatement. Les états `READY` restaurés peuvent être repris explicitement.

## Test discriminant

[T01 fresh game shows two segments inside the board, at the spawn](../../packages/engine/test/create-game.test.ts)
