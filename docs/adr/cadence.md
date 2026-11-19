# Cadence et vitesse

La boucle avance sur un pas fixe de 1/60 s. Elle envoie un TICK après 45, 30 ou 15 pas pour les vitesses basse, moyenne et haute. Un TICK accepté avance le compteur du moteur d’une unité et tente de descendre d’une case.

## Test discriminant

[emits one TICK every 45 / 30 / 15 frames at low / medium / high](../../apps/web/test/loop.test.ts)
