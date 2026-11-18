import type { GameState, Orientation } from '@capsule-panic/contracts';
import { canPlace } from './capsule';

export interface Move { x: number; y: number; orientation: Orientation }

/** Placements de repos atteignables depuis la capsule active (parcours en largeur sur x, y, orientation). */
export function getAvailableMoves(state: Readonly<GameState>): Move[] {
    const active = state.active;
    if (!active || state.phase !== 'FALLING') return [];
    const key = (m: Move): string => `${String(m.x)},${String(m.y)},${String(m.orientation)}`;
    const start: Move = { x: active.x, y: active.y, orientation: active.orientation };
    const seen = new Set([key(start)]);
    const queue = [start];
    const resting: Move[] = [];
    while (queue.length) {
        const m = queue.shift() as Move;
        const down = { ...m, y: m.y + 1 };
        if (!canPlace(state.board, down)) resting.push(m);
        for (const n of [down, { ...m, x: m.x - 1 }, { ...m, x: m.x + 1 },
            { ...m, orientation: ((m.orientation + 1) % 4) as Orientation }, { ...m, orientation: ((m.orientation + 3) % 4) as Orientation }]) {
            if (!seen.has(key(n)) && canPlace(state.board, n)) { seen.add(key(n)); queue.push(n); }
        }
    }
    return resting.sort((a, b) => a.orientation - b.orientation || a.x - b.x || a.y - b.y);
}
