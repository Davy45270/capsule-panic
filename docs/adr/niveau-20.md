# Génération du niveau 20

Placer 72 obstacles dans les lignes y ≥ 5 sur les 88 cases admissibles. Échantillonner les positions sans remise et rejeter tout ajout qui créerait un alignement. Lever une erreur de génération si les positions sont épuisées ou si le plafond de 1000 rejets par obstacle est atteint. Les deux cases d’apparition sont libres grâce à la restriction sur les lignes.

## Test discriminant

[T25 no initial match](../../packages/engine/test/generate.test.ts)

[rejette la case qui créerait un alignement et respecte le plafond d’essais](../../packages/engine/test/generate.test.ts)
