import { HEIGHT, WIDTH } from '@capsule-panic/contracts';
import type { Cell, SegmentCell } from '@capsule-panic/contracts';

interface PositionedSegment { index: number; cell: SegmentCell }
interface Priority { bottomY: number; minX: number; id: string }
interface Component extends Priority { cells: PositionedSegment[] }

export function compareGravityPriority(a: Priority, b: Priority): number {
    return b.bottomY - a.bottomY || a.minX - b.minX || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Composants mobiles : paires intactes (liens réciproques) et segments isolés. */
function components(board: readonly Cell[]): Component[] {
    const segments = board.flatMap((cell, index) => cell?.kind === 'segment' ? [{ index, cell }] : []);
    const byId = new Map(segments.map(segment => [segment.cell.id, segment]));
    const seen = new Set<string>();
    const out: Component[] = [];
    for (const segment of segments) {
        const { cell } = segment;
        if (seen.has(cell.id)) continue;
        seen.add(cell.id);
        const partner = cell.linkedToId === null ? undefined : byId.get(cell.linkedToId);
        const cells = [segment];
        let id = cell.id;
        if (partner?.cell.linkedToId === cell.id) {
            seen.add(partner.cell.id);
            cells.push(partner);
            if (partner.cell.id < id) id = partner.cell.id;
        }
        const bottomY = Math.max(...cells.map(({ index }) => Math.floor(index / WIDTH)));
        const minX = Math.min(...cells.map(({ index }) => index % WIDTH));
        out.push({ id, cells, bottomY, minX });
    }
    return out.sort(compareGravityPriority);
}

/** Destinations d’un composant dans l’instantané, quand aucune des cases n’est bloquée ou réservée. */
export function gravityTargets(board: readonly Cell[], from: readonly number[], reserved: ReadonlySet<number>): number[] | null {
    const targets = from.map(index => index + WIDTH);
    const fits = targets.every(index => index < WIDTH * HEIGHT && (board[index] === null || from.includes(index)) && !reserved.has(index));
    return fits ? targets : null;
}

/** Évalue les mouvements dans l’instantané, puis les applique ensemble. */
export function gravityStep(board: readonly Cell[]): { board: Cell[]; moved: string[] } {
    const reserved = new Set<number>();
    const moving: Component[] = [];
    for (const component of components(board)) {
        const targets = gravityTargets(board, component.cells.map(segment => segment.index), reserved);
        if (!targets) continue;
        targets.forEach(index => reserved.add(index));
        moving.push(component);
    }
    const out = [...board];
    for (const component of moving) for (const { index } of component.cells) out[index] = null;
    for (const component of moving) for (const { index, cell } of component.cells) out[index + WIDTH] = cell;
    return { board: out, moved: moving.map(component => component.id) };
}

export const MAX_GRAVITY_STEPS = 128 * 16;

/** Répète les micro-pas jusqu'à stabilité ; `onStep` reçoit les composants déplacés à chaque pas. */
export function settle(board: readonly Cell[], onStep?: (moved: string[]) => void, maxSteps = MAX_GRAVITY_STEPS): { board: Cell[]; steps: number } {
    let current = [...board];
    for (let steps = 0; ; steps++) {
        const next = gravityStep(current);
        if (next.moved.length === 0) return { board: current, steps };
        if (steps >= maxSteps) throw new Error('gravity did not settle');
        onStep?.(next.moved);
        current = next.board;
    }
}
