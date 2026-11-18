import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Cell } from '@capsule-panic/contracts';
import { gravityStep, settle } from '../src/gravity';
import { boardFrom, withPair } from './helpers';

const runs = Number(process.env.FC_RUNS ?? 1000);
const at = (b: readonly Cell[], x: number, y: number): string | null => b[y * 8 + x]?.id ?? null;

describe('gravity of components', () => {
    it('T14 an intact horizontal pair stays when only one cell below is free', () => {
        const b = withPair(boardFrom(['........', '...C....']), 'p1', [3, 14], [4, 14], ['cyan', 'amber']);
        expect(settle(b)).toEqual({ board: b, steps: 0 });
    });
    it('T14 an intact horizontal pair falls when both cells below are free', () => {
        const b = withPair(boardFrom([]), 'p1', [3, 10], [4, 10], ['cyan', 'amber']);
        const r = settle(b);
        expect([at(r.board, 3, 15), at(r.board, 4, 15)]).toEqual(['p1a', 'p1b']);
        expect(r.steps).toBe(5);
    });
    it('an intact vertical pair falls as one unit', () => {
        const b = withPair(boardFrom([]), 'p2', [2, 9], [2, 8], ['magenta', 'cyan']);
        const r = settle(b);
        expect([at(r.board, 2, 15), at(r.board, 2, 14)]).toEqual(['p2a', 'p2b']);
    });
    it('T15 an orphan half falls alone', () => {
        const b = withPair(boardFrom([]), 'p3', [5, 10], [6, 10], ['cyan', 'amber']);
        b[10 * 8 + 6] = null;
        b[10 * 8 + 5] = { kind: 'segment', id: 'p3a', capsuleId: 'p3', part: 0, color: 'cyan', linkedToId: null };
        b[11 * 8 + 6] = { kind: 'obstacle', id: 'oX', color: 'amber' };
        const r = settle(b);
        expect(at(r.board, 5, 15)).toBe('p3a');
    });
    it('T16 obstacles never move, even floating', () => {
        const b = boardFrom(['....A...', '........', '........', '........']);
        expect(settle(b).board).toEqual(b);
    });
    it('a micro-step is evaluated from the snapshot: a stack falls one component per step from the bottom', () => {
        const b = boardFrom(['c.......', 'a.......', '........', '........']);
        const one = gravityStep(b);
        expect(one.moved).toEqual([b[13 * 8]?.id]);
        expect(settle(b).steps).toBe(3);
    });
    it('settle is idempotent, conserves cells and keeps every segment on the board', () => {
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
