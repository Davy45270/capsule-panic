import { describe, it, expect } from 'vitest';
import { createGame, step, restore, serialize, RestoreError } from '../src/index';
import { validState, withLockedPair } from '../../contracts/test/fixtures';
import { boardFrom, stateWith } from './helpers';

const thrown = (f: () => unknown): RestoreError => {
    try { f(); } catch (error) { if (error instanceof RestoreError) return error; throw error; }
    throw new Error('expected a RestoreError');
};

describe('serialize and restore', () => {
    it('[E138][E316] T22 roundtrip: restore(serialize(s)) deep-equals s', () => {
        const s = withLockedPair(validState());
        expect(restore(serialize(s))).toEqual(s);
    });
    it('serialize is stable and does not depend on key order', () => {
        const s = validState();
        const reordered = Object.fromEntries(Object.entries(s).reverse()) as typeof s;
        expect(serialize(reordered)).toBe(serialize(s));
        expect(serialize(s)).toBe(serialize(restore(serialize(s))));
    });
    it('[E257] T23 malformed JSON gives an explicit error', () => {
        const error = thrown(() => restore('{'));
        expect(error.message).toContain('JSON');
    });
    it('T23 schema violation lists the failing path', () => {
        const error = thrown(() => restore(JSON.stringify({ ...validState(), score: -5 })));
        expect(error.errors.join(' ')).toContain('/score');
    });
    it('rejects another schema version with a readable message', () => {
        const error = thrown(() => restore(JSON.stringify({ ...validState(), schemaVersion: 2 })));
        expect(error.message).toContain('version');
    });
    it('rejects a state that breaks an invariant', () => {
        expect(() => restore(JSON.stringify({ ...validState(), obstaclesRemaining: 9 }))).toThrow(RestoreError);
    });
});

it('[E139][E153] retire uniquement le compteur de la sauvegarde publiée et revalide', () => {
    const state = withLockedPair(validState());
    const legacy = { ...state, capsuleSerial: 200 };
    expect(restore(JSON.stringify(legacy))).toEqual(state);
    expect(() => restore(JSON.stringify({ ...legacy, obstaclesRemaining: 0 }))).toThrow(/obstaclesRemaining/);
});

it('[E229][E257] T23 refuse et nomme un champ inconnu après migration', () => {
    const legacy = { ...validState(), capsuleSerial: 200, autreChamp: true };
    expect(() => restore(JSON.stringify(legacy))).toThrow(/autreChamp/);
});

it('[E143] attribue les identifiants depuis les cellules vivantes, même après une reprise', () => {
    const source = createGame({ seed: 'identifiants', level: 0, speed: 'low' });
    const board = [...source.board];
    board[7] = { kind: 'segment', id: 'c42a', capsuleId: 'c42', part: 0, color: 'cyan', linkedToId: null };
    let state = restore(JSON.stringify({ ...source, board, capsuleSerial: 200 }));
    const first = step(state, { type: 'HARD_DROP' });
    expect(first.state.active?.id).toBe('c43');
    expect(step(state, { type: 'HARD_DROP' })).toEqual(first);
    state = step(first.state, { type: 'MOVE_LEFT' }).state;
    state = step(state, { type: 'HARD_DROP' }).state;
    expect(state.active?.id).toBe('c44');
    const ids = state.board.flatMap(cell => cell ? [cell.id] : []);
    expect(ids).toContain('c43a');
    expect(ids).toContain('c43b');
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('c44a');
    expect(ids).not.toContain('c44b');
});

it('[E177] la reprise refuse une expression et valide le JSON avant de rendre un état', () => {
    const json = serialize(validState());
    expect(() => restore(`(${json})`)).toThrow(/JSON invalide/);
    expect(() => restore(JSON.stringify({ ...validState(), width: 9 }))).toThrow(/état invalide/);
    expect(restore(json)).toEqual(validState());
});

it('réattribue c1 quand la résolution a supprimé tous les segments numérotés', () => {
    const board = boardFrom(['.......M', 'CC......']);
    const before = stateWith(board, { x: 2, orientation: 1, id: 'c99', colors: ['cyan', 'cyan'] });
    const transition = step(restore(serialize(before)), { type: 'HARD_DROP' });
    expect(transition.events.map(event => event.type)).toEqual(['LOCKED', 'MATCH_REMOVED', 'CASCADE_END', 'SPAWNED']);
    expect(transition.state.active?.id).toBe('c1');
    expect(transition.state.board.some(cell => cell?.kind === 'segment')).toBe(false);
});
