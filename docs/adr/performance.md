# Machine de référence pour la résolution

Mesurer `resolve` dans le conteneur `node:26` de Woodpecker sur l’agent `tank01`. Après échauffement, chronométrer 512 résolutions sur 32 plateaux déterministes comportant 96 cases occupées et au moins un alignement initial. Exiger un p95 strictement inférieur à 16 ms.

## Test discriminant

[resolve reste sous 16 ms au p95 sur des plateaux chargés](../../packages/engine/test/performance.test.ts)
