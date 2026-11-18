import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { nextUint32, randomInt, seedToState, shuffle } from '../src/rng';
import type { RngState } from '../src/rng';

const runs = Number(process.env.FC_RUNS ?? 1000);

describe('PRNG', () => {
    it('xoshiro128** reference vector', () => {
        let s: RngState = [1, 2, 3, 4];
        const out: number[] = [];
        for (let i = 0; i < 4; i++) { const [v, next] = nextUint32(s); out.push(v); s = next; }
        expect(out).toEqual([11520, 0, 5927040, 70819200]);
    });
    it('seedToState is stable', () => {
        expect(seedToState('capsule')).toEqual(GOLDEN_CAPSULE);
        expect(seedToState('')).toEqual(GOLDEN_EMPTY);
    });
    it('seedToState never returns all zeros', () => {
        fc.assert(fc.property(fc.string(), seed => seedToState(seed).some(v => v !== 0)), { numRuns: runs });
    });
    it('randomInt stays in range', () => {
        fc.assert(fc.property(fc.string(), fc.integer({ min: 1, max: 1000 }), (seed, max) => {
            const [v] = randomInt(max, seedToState(seed));
            return Number.isInteger(v) && v >= 0 && v < max;
        }), { numRuns: runs });
    });
    it('randomInt is unbiased on 3', () => {
        const counts = [0, 0, 0];
        let s = seedToState('balance');
        for (let i = 0; i < 30_000; i++) { const [v, next] = randomInt(3, s); counts[v] = (counts[v] ?? 0) + 1; s = next; }
        for (const c of counts) expect(Math.abs(c - 10_000)).toBeLessThan(400);
    });
    it('shuffle is a permutation and deterministic', () => {
        fc.assert(fc.property(fc.string(), seed => {
            const [a] = shuffle([1, 2, 3, 4, 5], seedToState(seed));
            const [b] = shuffle([1, 2, 3, 4, 5], seedToState(seed));
            return JSON.stringify(a) === JSON.stringify(b) && [...a].sort().join() === '1,2,3,4,5';
        }), { numRuns: runs });
    });
    it('rng functions never mutate their input', () => {
        const s = Object.freeze([1, 2, 3, 4]) as unknown as RngState;
        const items = Object.freeze([1, 2, 3]);
        expect(() => { nextUint32(s); randomInt(7, s); shuffle(items, s); }).not.toThrow();
        expect(s).toEqual([1, 2, 3, 4]);
    });
});

// Relevés à la première implémentation, puis figés : un changement ici change toutes les parties existantes.
const GOLDEN_CAPSULE: RngState = [626472670, 2974612217, 2794515637, 1209414119];
const GOLDEN_EMPTY: RngState = [41608494, 3485963809, 1435736333, 1262568316];
