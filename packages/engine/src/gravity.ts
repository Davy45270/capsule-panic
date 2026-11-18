import { HEIGHT, WIDTH } from '@capsule-panic/contracts';
import type { Cell } from '@capsule-panic/contracts';

interface Component { id: string; cells: number[] }

/** Composants mobiles : paires intactes (liens réciproques) et segments isolés ; les obstacles ne bougent pas. */
function components(board: readonly Cell[]): Component[] {
    const position = new Map<string, number>();
    board.forEach((c, i) => { if (c?.kind === 'segment') position.set(c.id, i); });
    const seen = new Set<string>();
    const out: Component[] = [];
    board.forEach((c, i) => {
        if (c?.kind !== 'segment' || seen.has(c.id)) return;
        seen.add(c.id);
        const j = c.linkedToId === null ? undefined : position.get(c.linkedToId);
        const partner = j === undefined ? null : board[j];
        if (j !== undefined && partner?.kind === 'segment' && partner.linkedToId === c.id) {
            seen.add(partner.id);
            out.push({ id: c.id < partner.id ? c.id : partner.id, cells: [i, j] });
        } else out.push({ id: c.id, cells: [i] });
    });
    const bottom = (k: Component): number => Math.max(...k.cells.map(i => Math.floor(i / WIDTH)));
    const left = (k: Component): number => Math.min(...k.cells.map(i => i % WIDTH));
    return out.sort((a, b) => bottom(b) - bottom(a) || left(a) - left(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Un micro-pas synchrone : chaque composant descend d'une case si toutes ses cases de destination sont, dans
 * l'instantané, vides ou à lui, et non réservées par un composant prioritaire du même micro-pas.
 */
export function gravityStep(board: readonly Cell[]): { board: Cell[]; moved: string[] } {
    const reserved = new Set<number>();
    const moving: Component[] = [];
    for (const k of components(board)) {
        const own = new Set(k.cells);
        const targets = k.cells.map(i => i + WIDTH);
        if (targets.every(t => t < WIDTH * HEIGHT && (board[t] === null || own.has(t)) && !reserved.has(t))) {
            targets.forEach(t => reserved.add(t));
            moving.push(k);
        }
    }
    const out = [...board];
    for (const k of moving) for (const i of k.cells) out[i] = null;
    for (const k of moving) for (const i of k.cells) out[i + WIDTH] = board[i] ?? null;
    return { board: out, moved: moving.map(k => k.id) };
}

export const MAX_GRAVITY_STEPS = 128 * 16;

/** Répète les micro-pas jusqu'à stabilité ; `onStep` reçoit les composants déplacés à chaque pas. */
export function settle(board: readonly Cell[], onStep?: (moved: string[]) => void, maxSteps = MAX_GRAVITY_STEPS): { board: Cell[]; steps: number } {
    let current = [...board];
    for (let steps = 0; steps <= maxSteps; steps++) {
        const next = gravityStep(current);
        if (next.moved.length === 0) return { board: current, steps };
        onStep?.(next.moved);
        current = next.board;
    }
    throw new Error('gravity did not settle');
}
