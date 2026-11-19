import { propertyRuns } from './property-runs';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Cell } from '@capsule-panic/contracts';
import { compareGravityPriority, gravityStep, gravityTargets, settle } from '../src/gravity';
import { resolve } from '../src/resolve';
import { boardFrom, withPair } from './helpers';

const runs = propertyRuns(process.env);
const at = (b: readonly Cell[], x: number, y: number): string | null => b[y * 8 + x]?.id ?? null;

describe('gravity of components', () => {
    it('[E028][E080][E081] T14 an intact horizontal pair stays when only one cell below is free', () => {
        const b = withPair(boardFrom(['........', '...C....']), 'p1', [3, 14], [4, 14], ['cyan', 'amber']);
        expect(settle(b)).toEqual({ board: b, steps: 0 });
    });
    it('[E078][E248] T14 an intact horizontal pair falls when both cells below are free', () => {
        const b = withPair(boardFrom([]), 'p1', [3, 10], [4, 10], ['cyan', 'amber']);
        const r = settle(b);
        expect([at(r.board, 3, 15), at(r.board, 4, 15)]).toEqual(['p1a', 'p1b']);
        expect(r.steps).toBe(5);
    });
    it('[E486] an intact vertical pair falls as one unit', () => {
        const b = withPair(boardFrom([]), 'p2', [2, 9], [2, 8], ['magenta', 'cyan']);
        const r = settle(b);
        expect([at(r.board, 2, 15), at(r.board, 2, 14)]).toEqual(['p2a', 'p2b']);
    });
    it('an orphan half falls alone', () => {
        const b = withPair(boardFrom([]), 'p3', [5, 10], [6, 10], ['cyan', 'amber']);
        b[10 * 8 + 6] = null;
        b[10 * 8 + 5] = { kind: 'segment', id: 'p3a', capsuleId: 'p3', part: 0, color: 'cyan', linkedToId: null };
        b[11 * 8 + 6] = { kind: 'obstacle', id: 'oX', color: 'amber' };
        const r = settle(b);
        expect(at(r.board, 5, 15)).toBe('p3a');
    });
    it('obstacles never move, even floating', () => {
        const b = boardFrom(['....A...', '........', '........', '........']);
        expect(settle(b).board).toEqual(b);
    });
    it('a micro-step is evaluated from the snapshot: a stack falls one component per step from the bottom', () => {
        const b = boardFrom(['c.......', 'a.......', '........', '........']);
        const one = gravityStep(b);
        expect(one.moved).toEqual([b[13 * 8]?.id]);
        expect(settle(b).steps).toBe(3);
    });
    it('[E205][E272] settle is idempotent, conserves cells and keeps every segment on the board', () => {
        const cell = fc.oneof(fc.constant(null), fc.constantFrom<Cell>({ kind: 'obstacle', id: '', color: 'cyan' }, { kind: 'segment', id: '', capsuleId: '', part: 0, color: 'amber', linkedToId: null }));
        fc.assert(fc.property(fc.array(cell, { minLength: 128, maxLength: 128 }), raw => {
            const board = raw.map((c, i) => (c ? { ...c, id: `k${String(i)}`, ...(c.kind === 'segment' ? { capsuleId: `k${String(i)}` } : {}) } : null)) as Cell[];
            const once = settle(board).board;
            expect(once).toHaveLength(128);
            expect(settle(once)).toEqual({ board: once, steps: 0 });
            expect(once.filter(Boolean).map(c => c?.id).sort()).toEqual(board.filter(Boolean).map(c => c?.id).sort());
        }), { numRuns: runs });
    });
});

it('[E203] une réservation rend la chute de la paire indivisible au même micro-pas', () => {
    const board = withPair(boardFrom([]), 'paire', [3, 14], [4, 14], ['cyan', 'amber']);
    const from = [14 * 8 + 3, 14 * 8 + 4];
    const target = [15 * 8 + 3, 15 * 8 + 4];
    expect(gravityTargets(board, from, new Set())).toEqual(target);
    for (const position of target) {
        const reservation = new Set([position]);
        expect(gravityTargets(board, from, reservation)).toBeNull();
        expect([...reservation]).toEqual([position]);
    }
});


it('[E085] la priorité de réservation compare rangée, colonne puis identifiant', () => {
    const bottomLeft = { bottomY: 14, minX: 2, id: 'p8' };
    const bottomRight = { bottomY: 14, minX: 6, id: 'p1' };
    const upper = { bottomY: 13, minX: 1, id: 'p2' };
    expect([upper, bottomRight, bottomLeft].sort(compareGravityPriority)).toEqual([bottomLeft, bottomRight, upper]);

    // Deux priorités aux mêmes coordonnées se distinguent uniquement par leur identifiant.
    const earlierId = { ...bottomLeft, id: 'p3' };
    expect(compareGravityPriority(earlierId, bottomLeft)).toBeLessThan(0);
    expect(compareGravityPriority(bottomLeft, earlierId)).toBeGreaterThan(0);
    expect(compareGravityPriority(bottomLeft, bottomLeft)).toBe(0);

    const board = boardFrom(['c.......', '.......m', '.a....c.', '........']);
    expect(gravityStep(board).moved).toEqual([board[113]?.id, board[118]?.id, board[111]?.id, board[96]?.id]);
});

it('[E083][E318] conserve les paires et obstacles, et détache la moitié touchée par la cascade', () => {
    fc.assert(fc.property(fc.integer({ min: 5, max: 12 }), fc.integer({ min: 5, max: 13 }), (row, floating) => {
        const board = boardFrom([]);
        for (const x of [0, 1, 2]) board[row * 8 + x] = { kind: 'obstacle', id: `o${String(x)}`, color: 'cyan' };
        board[floating * 8 + 7] = { kind: 'obstacle', id: 'o4', color: 'magenta' };
        const split = withPair(board, 'p1', [3, row], [4, row], ['cyan', 'amber']);
        const full = withPair(split, 'p2', [5, row - 1], [6, row - 1], ['magenta', 'amber']);
        const result = resolve(Object.freeze(full));
        expect(result.chain).toBe(1);
        expect(result.obstaclesRemoved).toBe(3);
        expect(result.board[124]).toMatchObject({ id: 'p1b', linkedToId: null });
        expect(result.board[125]).toMatchObject({ id: 'p2a', linkedToId: 'p2b' });
        expect(result.board[126]).toMatchObject({ id: 'p2b', linkedToId: 'p2a' });
        expect(result.board[floating * 8 + 7]).toEqual(board[floating * 8 + 7]);
        expect(settle(result.board).steps).toBe(0);
    }), { numRuns: runs });
});
