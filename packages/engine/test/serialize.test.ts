import { describe, it, expect } from 'vitest';
import { restore, serialize, RestoreError } from '../src/index';
import { validState, withLockedPair } from '../../contracts/test/fixtures';

const thrown = (f: () => unknown): RestoreError => {
    try { f(); } catch (error) { if (error instanceof RestoreError) return error; throw error; }
    throw new Error('expected a RestoreError');
};

describe('serialize and restore', () => {
    it('T22 roundtrip: restore(serialize(s)) deep-equals s', () => {
        const s = withLockedPair(validState());
        expect(restore(serialize(s))).toEqual(s);
    });
    it('serialize is stable and does not depend on key order', () => {
        const s = validState();
        const reordered = Object.fromEntries(Object.entries(s).reverse()) as typeof s;
        expect(serialize(reordered)).toBe(serialize(s));
        expect(serialize(s)).toBe(serialize(restore(serialize(s))));
    });
    it('T23 malformed JSON gives an explicit error', () => {
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
