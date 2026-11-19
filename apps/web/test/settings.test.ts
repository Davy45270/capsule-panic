import { describe, it, expect } from 'vitest';
import { newSeed } from '../src/settings';

describe('seed', () => {
    it('takes ?graine= from the address, otherwise draws a fresh one', () => {
        expect(newSeed('?graine=abc')).toBe('abc');
        const a = newSeed(''), b = newSeed('');
        expect(a).not.toBe(b);
        expect(a.length).toBeGreaterThan(2);
    });
});
