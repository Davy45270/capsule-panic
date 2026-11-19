# Aléa déterministe

Retenir xoshiro128** avec quatre mots non signés de 32 bits dans l’état de partie. Le mélange cyrb128 initialise ces mots depuis la graine textuelle. Le tirage borné rejette les valeurs hors du plus grand multiple de la borne représentable sur 32 bits. Chaque capsule consomme deux tirages successifs.

Le vecteur depuis `[1, 2, 3, 4]` commence par `11520, 0, 5927040, 70819200`. Changer l’algorithme ou l’ordre des tirages change les replays.

## Test discriminant

[xoshiro128** reference vector](../../packages/engine/test/rng.test.ts)
