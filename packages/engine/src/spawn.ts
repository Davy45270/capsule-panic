import type { Color, GameState } from '@capsule-panic/contracts';
import { canPlace, drawCapsuleColors, SPAWN } from './capsule';
import type { EventLog } from './events';
import type { RngState } from './rng';

/**
 * Après résolution : victoire si plus aucun obstacle (elle prime sur un point d'apparition bloqué) ; sinon la tête
 * de file devient la capsule `c<capsuleSerial>`, une nouvelle capsule est tirée en fin de file ; apparition
 * impossible = défaite.
 */
export function spawnNext(state: GameState, log: EventLog): GameState {
    if (state.obstaclesRemaining === 0) {
        log.emit('WON', { score: state.score });
        return { ...state, active: null, phase: 'WON' };
    }
    const colors = state.nextQueue[0] as [Color, Color];
    const active = { id: `c${String(state.capsuleSerial)}`, colors, ...SPAWN };
    if (!canPlace(state.board, active)) {
        log.emit('LOST', { score: state.score });
        return { ...state, active: null, phase: 'LOST' };
    }
    const [next, rngState] = drawCapsuleColors(state.rngState as RngState);
    log.emit('SPAWNED', { id: active.id, colors });
    return { ...state, active, nextQueue: [next], rngState, capsuleSerial: state.capsuleSerial + 1, phase: 'FALLING' };
}
