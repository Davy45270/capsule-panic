import { describe, it, expect } from 'vitest';
import { resolve } from '../src/resolve';
import { findMatches } from '../src/match';
import { removeCells } from '../src/remove';
import { boardFrom, withPair } from './helpers';

const removeMatches = (rows: string[]) => { const b = boardFrom(rows); return removeCells(b, findMatches(b)); };

describe('matching and simultaneous removal', () => {
    it('[E243] T09 three in a row removes nothing', () => {
        const r = removeMatches(['ccc.....']);
        expect(r).toMatchObject({ obstacles: 0, segments: 0 });
        expect(r.board).toEqual(boardFrom(['ccc.....']));
    });
    it('[E244] T10 four horizontal are removed', () => {
        const r = removeMatches(['.cccc...']);
        expect(r).toMatchObject({ obstacles: 0, segments: 4 });
        expect(r.board.every(c => c === null)).toBe(true);
    });
    it('[E035][E074][E075][E245] T11 five vertical removes all five', () => {
        const r = removeMatches(['m.......', 'm.......', 'M.......', 'm.......', 'm.......']);
        expect(r).toMatchObject({ obstacles: 1, segments: 4 });
        expect(r.board.every(c => c === null)).toBe(true);
        const horizontal = removeMatches(['.mMmm...']);
        expect(horizontal).toMatchObject({ obstacles: 1, segments: 3 });
        expect(horizontal.board.every(c => c === null)).toBe(true);
        expect(removeMatches(['.mM.m...']).board).toEqual(boardFrom(['.mM.m...']));
    });
    it('[E076][E199][E200][E246] T12 a 4x4 cross is removed once and counted once', () => {
        const board = boardFrom(['...a....', '...a....', '.aaA....', '...a....']);
        // Intersection de la colonne de longueur 4 et de la ligne de longueur 4.
        board[14 * 8 + 4] = { kind: 'segment', id: 'croix', capsuleId: 'croix', part: 0, linkedToId: null, color: 'amber' };
        const matches = findMatches(board);
        expect([...matches].sort((a, b) => a - b)).toEqual([99, 107, 113, 114, 115, 116, 123]);
        const events: unknown[] = [];
        const result = resolve(board, (type, payload) => { if (type === 'MATCH_REMOVED') events.push(payload); });
        expect(result.scoreDelta).toBe(160);
        expect(result.board.every(cell => cell === null)).toBe(true);
        expect(events).toEqual([{ chain: 1, cells: [99, 107, 113, 114, 115, 116, 123], obstacles: 1, segments: 6, points: 160 }]);
    });
    it('obstacles count separately from segments, mixed in one run', () => {
        expect(removeMatches(['CcCc....'])).toMatchObject({ obstacles: 2, segments: 2 });
    });
    it('a surviving half loses its link', () => {
        // Pair x9: (0,14) cyan + (0,15) amber; three cyan obstacles at (1..3,14) complete a horizontal run of four.
        const board = withPair(boardFrom(['.CCC....', '........']), 'x9', [0, 14], [0, 15], ['cyan', 'amber']);
        const r = removeCells(board, findMatches(board));
        expect(r.board[14 * 8]).toBeNull();
        expect(r.board[15 * 8]).toEqual({ kind: 'segment', id: 'x9b', capsuleId: 'x9', part: 1, color: 'amber', linkedToId: null });
    });
    it('does not mutate the board', () => {
        const b = Object.freeze(boardFrom(['cccc....']));
        expect(() => removeCells(b, findMatches(b))).not.toThrow();
    });
});
