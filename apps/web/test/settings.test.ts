import { describe, it, expect } from 'vitest';
import { newSeed, starsFor } from '../src/settings';

describe('end of level stars', () => {
    it('one for the win, one for a chain reaction, one for sparing capsules', () => {
        expect(starsFor(false, { capsules: 1, bestChain: 3, crystalsAtStart: 4 })).toBe(0);
        expect(starsFor(true, { capsules: 9, bestChain: 1, crystalsAtStart: 4 })).toBe(1);
        expect(starsFor(true, { capsules: 9, bestChain: 2, crystalsAtStart: 4 })).toBe(2);
        expect(starsFor(true, { capsules: 4, bestChain: 2, crystalsAtStart: 4 })).toBe(3);
    });
});
describe('seed', () => {
    it('takes ?graine= from the address, otherwise draws a fresh one', () => {
        expect(newSeed('?graine=abc')).toBe('abc');
        const a = newSeed(''), b = newSeed('');
        expect(a).not.toBe(b);
        expect(a.length).toBeGreaterThan(2);
    });
});
