import type { ActiveCapsule, Cell, GameCommand, GameState, Orientation, Position, Transition } from '@capsule-panic/contracts';
import { canPlace, capsuleCells } from './capsule';
import { EventLog } from './events';
import { lockCapsule } from './lock';
import { resolveAfterLock } from './resolve';
import { spawnNext } from './spawn';

export { canPlace };


const refused = (state: GameState): Transition => ({ state, events: [] });

/** Nombre de rangées dont la capsule peut descendre avant le contact. */
function dropDistance(board: readonly Cell[], active: ActiveCapsule): number {
    let d = 0;
    while (canPlace(board, { ...active, y: active.y + d + 1 })) d++;
    return d;
}

/** Cases où la capsule se poserait par une descente brusque (le « fantôme ») ; [] sans capsule active. */
export function getLandingProjection(state: Readonly<GameState>): Position[] {
    const active = state.active;
    if (!active) return [];
    return capsuleCells({ ...active, y: active.y + dropDistance(state.board, active) });
}

/** Verrouillage, résolution complète, puis victoire, défaite ou apparition : tout dans le même `step`. */
function lockAndContinue(state: GameState, active: ActiveCapsule, log: EventLog): GameState {
    const board = lockCapsule(state.board, active);
    log.emit('LOCKED', { capsuleId: active.id, cells: capsuleCells(active) });
    return spawnNext(resolveAfterLock({ ...state, board, active: null }, log), log);
}

/** Transition pure : rend un nouvel état et ses événements ; une commande refusée rend l'état tel quel, sans événement. */
export function step(state: Readonly<GameState>, command: GameCommand): Transition {
    const log = new EventLog(state.tick);
    const active = state.active;
    if (command.type === 'RESUME') {
        if (state.phase !== 'PAUSED' && state.phase !== 'READY') return refused(state);
        log.emit('RESUMED');
        return { state: { ...state, phase: 'FALLING' }, events: log.events };
    }
    if (state.phase !== 'FALLING' || !active) return refused(state);
    switch (command.type) {
        case 'PAUSE':
            log.emit('PAUSED');
            return { state: { ...state, phase: 'PAUSED' }, events: log.events };
        case 'TICK':
        case 'SOFT_DROP': {
            const isTick = command.type === 'TICK';
            const tick = state.tick + (isTick ? 1 : 0);
            log.setTick(tick);
            const down = { ...active, y: active.y + 1 };
            if (canPlace(state.board, down)) {
                log.emit('MOVED', { x: down.x, y: down.y });
                return { state: { ...state, tick, active: down, score: state.score + (isTick ? 0 : 1) }, events: log.events };
            }
            return { state: lockAndContinue({ ...state, tick }, active, log), events: log.events };
        }
        case 'HARD_DROP': {
            const d = dropDistance(state.board, active);
            return { state: lockAndContinue({ ...state, score: state.score + 2 * d }, { ...active, y: active.y + d }, log), events: log.events };
        }
        case 'MOVE_LEFT':
        case 'MOVE_RIGHT': {
            const moved = { ...active, x: active.x + (command.type === 'MOVE_LEFT' ? -1 : 1) };
            if (!canPlace(state.board, moved)) return refused(state);
            log.emit('MOVED', { x: moved.x, y: moved.y });
            return { state: { ...state, active: moved }, events: log.events };
        }
        case 'ROTATE_CW':
        case 'ROTATE_CCW': {
            const orientation = ((active.orientation + (command.type === 'ROTATE_CW' ? 1 : 3)) % 4) as Orientation;
            const rotated = { ...active, orientation };
            if (!canPlace(state.board, rotated)) return refused(state);
            log.emit('ROTATED', { orientation });
            return { state: { ...state, active: rotated }, events: log.events };
        }
    }
}
