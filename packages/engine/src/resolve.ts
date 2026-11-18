import type { GameState } from '@capsule-panic/contracts';
import type { EventLog } from './events';

/** Résolution après verrouillage (alignements, gravité, cascades) : complétée avec les règles d'alignement. */
export function resolveAfterLock(state: GameState, _log: EventLog): GameState {
    return state;
}
