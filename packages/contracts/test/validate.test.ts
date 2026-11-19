import { describe, it, expect } from 'vitest';
import { validateGameState, validatePuzzleShape } from '../src/index';
import type { Cell, GameState } from '../src/types';
import { validState, withLockedPair } from './fixtures';

const errorsOf = (x: unknown): string[] => { const r = validateGameState(x); return r.ok ? [] : r.errors; };
const setCell = (s: GameState, i: number, c: Cell): GameState => { const board = [...s.board]; board[i] = c; return { ...s, board }; };

describe('validateGameState', () => {
    it('accepts a fresh valid state', () => {
        const r = validateGameState(validState());
        expect(r).toEqual({ ok: true, value: validState() });
    });
    it('accepts an intact locked pair', () => {
        expect(errorsOf(withLockedPair(validState()))).toEqual([]);
    });
    it('rejects a board of 127 cells', () => {
        expect(errorsOf({ ...validState(), board: validState().board.slice(1) }).join(' ')).toContain('/board');
    });
    it('rejects an unknown colour', () => {
        expect(errorsOf(setCell(validState(), 0, { kind: 'obstacle', id: 'o9', color: 'red' } as unknown as Cell)).length).toBeGreaterThan(0);
    });
    it('rejects the old counter outside the explicit save migration', () => {
        expect(errorsOf({ ...validState(), capsuleSerial: 2 }).join(' ')).toContain('capsuleSerial');
    });
    it('rejects a dangling linkedToId', () => {
        const s = setCell(withLockedPair(validState()), 15 * 8 + 4, null);
        expect(errorsOf({ ...s }).join(' ')).toContain('c3a');
    });
    it('rejects a non-reciprocal link', () => {
        const s = withLockedPair(validState());
        const t = setCell(s, 15 * 8 + 4, { kind: 'segment', id: 'c3b', capsuleId: 'c3', part: 1, color: 'cyan', linkedToId: null });
        expect(errorsOf(t).join(' ')).toContain('c3a');
    });
    it('rejects linked segments that are not adjacent', () => {
        const s = withLockedPair(validState());
        const moved = setCell(setCell(s, 15 * 8 + 4, null), 15 * 8 + 6, s.board[15 * 8 + 4] ?? null);
        expect(errorsOf(moved).join(' ')).toContain('adjacent');
    });
    it('rejects linked segments with the same part', () => {
        const s = withLockedPair(validState());
        const t = setCell(s, 15 * 8 + 4, { kind: 'segment', id: 'c3b', capsuleId: 'c3', part: 0, color: 'cyan', linkedToId: 'c3a' });
        expect(errorsOf(t).join(' ')).toContain('part');
    });
    it('rejects obstaclesRemaining that disagrees with the board', () => {
        expect(errorsOf({ ...validState(), obstaclesRemaining: 3 }).join(' ')).toContain('obstaclesRemaining');
    });
    it('rejects an active capsule overlapping a locked cell', () => {
        const s = setCell(validState(), 1 * 8 + 3, { kind: 'obstacle', id: 'o3', color: 'cyan' });
        expect(errorsOf({ ...s, obstaclesRemaining: 3 }).join(' ')).toContain('active');
    });
    it('rejects an active capsule out of bounds', () => {
        expect(errorsOf({ ...validState(), active: { id: 'c1', colors: ['amber', 'cyan'], x: 3, y: 0, orientation: 0 } }).join(' ')).toContain('active');
    });
    it('rejects duplicate ids', () => {
        const s = setCell(validState(), 14 * 8, { kind: 'obstacle', id: 'o1', color: 'amber' });
        expect(errorsOf({ ...s, obstaclesRemaining: 3 }).join(' ')).toContain('o1');
    });
    it('rejects a queue of two capsules', () => {
        expect(errorsOf({ ...validState(), nextQueue: [['cyan', 'cyan'], ['amber', 'amber']] }).join(' ')).toContain('/nextQueue');
    });
    it('rejects anything that is not an object', () => {
        expect(errorsOf(null).length).toBeGreaterThan(0);
        expect(errorsOf('state').length).toBeGreaterThan(0);
    });
});

describe('puzzle schema', () => {
    it('compiles against the game schema and accepts a puzzle built on a valid state', () => {
        const puzzle = { schemaVersion: 1, id: 'p1', ruleset: 'CP-CLASSIC-1', initialState: validState(), capsules: [['cyan', 'amber']], maxCapsules: 1, objective: 'CLEAR_ALL' };
        expect(validatePuzzleShape(puzzle)).toEqual([]);
        expect(validatePuzzleShape({ ...puzzle, objective: 'WIN' }).length).toBeGreaterThan(0);
    });
});
