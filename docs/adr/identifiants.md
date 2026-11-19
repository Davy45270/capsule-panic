# Identifiants et reprise

À chaque apparition, prendre le plus grand numéro de capsule encore présent sur le plateau ou dans la capsule active. Attribuer le numéro suivant, ou 1 si aucun numéro n’est présent. Garder les suffixes `a` et `b` des deux segments et le préfixe `o` des obstacles. Un numéro peut être réutilisé lorsque tous ses segments ont disparu.

À la reprise, retirer `capsuleSerial` des sauvegardes publiées, puis valider l’état restant. Conserver tous les autres champs pour que la validation puisse signaler un champ inconnu.

## Test discriminant

[attribue les identifiants depuis les cellules vivantes, même après une reprise](../../packages/engine/test/serialize.test.ts)

[retire uniquement le compteur de la sauvegarde publiée et revalide](../../packages/engine/test/serialize.test.ts)

[réattribue c1 quand la résolution a supprimé tous les segments numérotés](../../packages/engine/test/serialize.test.ts)
