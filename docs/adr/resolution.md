# Résolution synchrone

Un appel de `step` qui verrouille une capsule passe par `RESOLVING` en interne. Il résout toutes les cascades et rend la décision finale. Le rendu reçoit la transition complète et sa séquence d’événements.

## Test discriminant

[the state returned by step is never RESOLVING](../../packages/engine/test/resolve.test.ts)
