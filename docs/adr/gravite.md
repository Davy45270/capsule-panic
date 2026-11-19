# Gravité des paires intactes

Traiter une paire intacte comme un seul composant. Elle ne descend que lorsque ses deux destinations sont disponibles. Une moitié survivante devient indépendante après la suppression de sa partenaire. Chaque micro-pas lit le plateau en début de pas et applique les déplacements ensemble.

Les composants sont examinés du plus bas au plus haut, de gauche à droite puis par identifiant. Sur un plateau valide, envoyer toutes les cases vers leur voisine du dessous est injectif. Le conflit observable est une destination occupée au début du pas que le composant inférieur libère en fin de pas.

## Test discriminant

[T14 an intact horizontal pair stays when only one cell below is free](../../packages/engine/test/gravity.test.ts)

[un micro-pas libère les cases pour le micro-pas suivant](../../packages/engine/test/rules.test.ts)

[la priorité de réservation compare rangée, colonne puis identifiant](../../packages/engine/test/gravity.test.ts)

[une réservation rend la chute de la paire indivisible au même micro-pas](../../packages/engine/test/gravity.test.ts)
