import type { Cell } from '@capsule-panic/contracts';

/** Supprime simultanément les cases données ; un segment survivant dont la moitié a disparu perd son lien. */
export function removeCells(board: readonly Cell[], indices: ReadonlySet<number>): { board: Cell[]; obstacles: number; segments: number } {
    let obstacles = 0, segments = 0;
    const removed = new Set<string>();
    const out = board.map((cell, i) => {
        if (!cell || !indices.has(i)) return cell;
        if (cell.kind === 'obstacle') obstacles++; else segments++;
        removed.add(cell.id);
        return null;
    });
    return {
        board: out.map(cell => (cell?.kind === 'segment' && cell.linkedToId !== null && removed.has(cell.linkedToId) ? { ...cell, linkedToId: null } : cell)),
        obstacles, segments
    };
}
