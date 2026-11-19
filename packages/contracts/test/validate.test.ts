import { describe, it, expect } from 'vitest';
import { RULESET, validateGameState, validatePuzzleShape } from '../src/index';
import type { Cell, GameState } from '../src/types';
import { validState, withLockedPair } from './fixtures';

const errorsOf = (x: unknown): string[] => { const r = validateGameState(x); return r.ok ? [] : r.errors; };
const setCell = (s: GameState, i: number, c: Cell): GameState => { const board = [...s.board]; board[i] = c; return { ...s, board }; };

describe('validateGameState', () => {
    it('accepts a fresh valid state', () => {
        const r = validateGameState(validState());
        expect(r).toEqual({ ok: true, value: validState() });
    });
    it('[E145] une paire exige des cellules adjacentes, parts distinctes, identifiant commun et lien réciproque', () => {
        const state = withLockedPair(validState());
        const index = 15 * 8 + 4;
        const partner = state.board[index];
        if (partner?.kind !== 'segment') throw new Error('segment partenaire attendu');
        expect(errorsOf(state)).toEqual([]);
        for (const [changed, error] of [
            [{ ...partner, linkedToId: null }, 'reciprocal'],
            [{ ...partner, capsuleId: 'autre' }, 'another capsule'],
            [{ ...partner, part: 0 }, 'share part'],
        ] as const) {
            expect(errorsOf(setCell(state, index, changed)).join(' ')).toContain(error);
        }
        expect(errorsOf(setCell(setCell(state, index, null), index + 1, partner)).join(' ')).toContain('not adjacent');
    });
    it('[E230] refuse les deux longueurs voisines de 128 cases', () => {
        const state = validState();
        expect(errorsOf(state)).toEqual([]);
        for (const board of [state.board.slice(1), [...state.board, null]]) {
            expect(errorsOf({ ...state, board }).join(' ')).toContain('/board');
        }
    });
    it('[E142][E187] le schéma distingue case vide, obstacle et segment dans le plateau', () => {
        const state = withLockedPair(validState());
        expect(errorsOf(state)).toEqual([]);
        for (const invalid of [
            { kind: 'obstacle', id: 'a', color: 'red' },
            { kind: 'obstacle', color: 'cyan' },
            { kind: 'obstacle', id: 'a', color: 'cyan', part: 0 },
            { kind: 'segment', id: 'a', color: 'cyan', capsuleId: 'b', part: 2, linkedToId: null },
            { kind: 'segment', id: 'a', color: 'cyan', capsuleId: 'b', part: 0 },
            'empty',
        ]) {
            expect(errorsOf(setCell(state, 0, invalid as Cell)).join(' ')).toContain('/board/0');
        }
    });
    it('rejects the old counter outside the explicit save migration', () => {
        expect(errorsOf({ ...validState(), capsuleSerial: 2 }).join(' ')).toContain('capsuleSerial');
    });
    it('[E202] rejects a dangling linkedToId', () => {
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
    it('l’invariant de partie refuse les files vide et double, le schéma de puzzle les accepte', () => {
        const state = validState();
        expect(errorsOf(state)).toEqual([]);
        for (const nextQueue of [[], [['cyan', 'cyan'], ['amber', 'amber']]]) {
            const initialState = { ...state, nextQueue };
            expect(errorsOf(initialState).join(' ')).toContain('/nextQueue');
            const puzzle = { schemaVersion: 1, id: 'file', ruleset: RULESET, initialState, capsules: [], maxCapsules: 1, objective: 'CLEAR_ALL' };
            expect(validatePuzzleShape(puzzle)).toEqual([]);
        }
    });
    it('rejects anything that is not an object', () => {
        expect(errorsOf(null).length).toBeGreaterThan(0);
        expect(errorsOf('state').length).toBeGreaterThan(0);
    });
});

describe('puzzle schema', () => {
    it('[E132] compiles against the game schema and accepts a puzzle built on a valid state', () => {
        const puzzle = { schemaVersion: 1, id: 'p1', ruleset: RULESET, initialState: validState(), capsules: [['cyan', 'amber']], maxCapsules: 1, objective: 'CLEAR_ALL' };
        expect(validatePuzzleShape(puzzle)).toEqual([]);
        expect(validatePuzzleShape({ ...puzzle, objective: 'WIN' }).length).toBeGreaterThan(0);
        expect(validatePuzzleShape({ ...puzzle, initialState: { ...puzzle.initialState, width: 9 } }).join(' ')).toContain('/initialState/width');
    });
});

it('[E231] rngState exige exactement quatre entiers non signés sur 32 bits', () => {
    expect(errorsOf({ ...validState(), rngState: [0, 1, 2, 4294967295] })).toEqual([]);
    for (const rngState of [[1, 2, 3], [1, 2, 3, 4, 5], [-1, 2, 3, 4], [0.5, 2, 3, 4], [4294967296, 2, 3, 4]]) {
        expect(errorsOf({ ...validState(), rngState }).join(' ')).toContain('/rngState');
    }
});

it('[E232] le schéma accepte les bornes du niveau et refuse de les dépasser', () => {
    for (const level of [0, 20]) expect(errorsOf({ ...validState(), level })).toEqual([]);
    for (const level of [-1, 21, 3.5]) expect(errorsOf({ ...validState(), level }).join(' ')).toContain('/level');
});

it('[E154] refuse l’absence de capsule dans toute phase qui permet de reprendre la chute', () => {
    for (const phase of ['READY', 'FALLING', 'PAUSED'] as const) {
        expect(errorsOf({ ...validState(), phase })).toEqual([]);
        expect(errorsOf({ ...validState(), phase, active: null })).toEqual([
            '/active une capsule est requise pour la phase ' + phase,
        ]);
    }
});
