import type { Color, GameState } from '@capsule-panic/contracts';
import { canPlace, drawCapsuleColors, SPAWN } from './capsule';
import type { EventLog } from './events';
import type { RngState } from './rng';

/** Le plus grand numéro encore vivant suffit, y compris si une demi-paire a survécu. */
function nextCapsuleId(state: GameState): string {
    let highest = 0n;
    const consider = (id: string): void => {
        const digits = /^c([0-9]+)[ab]?$/.exec(id)?.[1];
        if (digits === undefined) return;
        const serial = BigInt(digits);
        if (serial > highest) highest = serial;
    };
    if (state.active) consider(state.active.id);
    for (const cell of state.board) {
        if (!cell) continue;
        consider(cell.id);
        if (cell.kind === 'segment') consider(cell.capsuleId);
    }
    return `c${String(highest + 1n)}`;
}

/**
 * Après résolution : victoire si plus aucun obstacle (elle prime sur un point d'apparition bloqué) ; sinon la tête
 * de file devient la capsule active, une nouvelle capsule est tirée en fin de file ; apparition
 * impossible = défaite.
 */
export function spawnNext(state: GameState, log: EventLog): GameState {
    if (state.obstaclesRemaining === 0) {
        log.emit('WON', { score: state.score });
        return { ...state, active: null, phase: 'WON' };
    }
    const colors = state.nextQueue[0] as [Color, Color];
    const active = { id: nextCapsuleId(state), colors, ...SPAWN };
    if (!canPlace(state.board, active)) {
        log.emit('LOST', { score: state.score });
        return { ...state, active: null, phase: 'LOST' };
    }
    const [next, rngState] = drawCapsuleColors(state.rngState as RngState);
    log.emit('SPAWNED', { id: active.id, colors });
    return { ...state, active, nextQueue: [next], rngState, phase: 'FALLING' };
}
