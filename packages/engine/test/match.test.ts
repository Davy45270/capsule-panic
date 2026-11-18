import { describe, it, expect } from 'vitest';
import { findMatches } from '../src/match';
import { removeCells } from '../src/remove';
import { boardFrom, withPair } from './helpers';

const removeMatches = (rows: string[]) => { const b = boardFrom(rows); return removeCells(b, findMatches(b)); };

describe('matching and simultaneous removal', () => {
    it('T09 three in a row removes nothing', () => {
        const r = removeMatches(['ccc.....']);
        expect(r).toMatchObject({ obstacles: 0, segments: 0 });
        expect(r.board).toEqual(boardFrom(['ccc.....']));
    });
    it('T10 four horizontal are removed', () => {
        const r = removeMatches(['.cccc...']);
        expect(r).toMatchObject({ obstacles: 0, segments: 4 });
        expect(r.board.every(c => c === null)).toBe(true);
    });
    it('T11 five vertical removes all five', () => {
        const r = removeMatches(['m.......', 'm.......', 'M.......', 'm.......', 'm.......']);
        expect(r).toMatchObject({ obstacles: 1, segments: 4 });
        expect(r.board.every(c => c === null)).toBe(true);
    });
    it('T12 a 4x4 cross is removed once and counted once', () => {
        const r = removeMatches(['...a....', '...a....', 'aaaAaaa.', '...a....']);
        expect(r.obstacles + r.segments).toBe(10);
        expect(r.obstacles).toBe(1);
    });
    it('T13 obstacles count separately from segments, mixed in one run', () => {
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
