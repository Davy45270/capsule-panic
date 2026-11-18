import type { ActiveCapsule, Cell, GameCommand, GameState, Orientation, Transition } from '@capsule-panic/contracts';
import { capsuleCells } from './capsule';
import { cellAt, inBounds } from './board';
import { EventLog } from './events';

/** Vrai si la capsule tient dans le plateau sans toucher une case verrouillée. */
export function canPlace(board: readonly Cell[], c: Pick<ActiveCapsule, 'x' | 'y' | 'orientation'>): boolean {
    return capsuleCells(c).every(({ x, y }) => inBounds(x, y) && cellAt(board, x, y) === null);
}

const refused = (state: GameState): Transition => ({ state, events: [] });

/** Transition pure : rend un nouvel état et ses événements ; une commande refusée rend l'état tel quel, sans événement. */
export function step(state: Readonly<GameState>, command: GameCommand): Transition {
    const log = new EventLog(state.tick);
    const active = state.active;
    if (state.phase !== 'FALLING' || !active) return refused(state);
    switch (command.type) {
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
        default:
            return refused(state);
    }
}
