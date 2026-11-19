import { expect, it } from 'vitest';
import { createGame, step } from '@capsule-panic/engine';
import { mapKey } from '@capsule-panic/input';
import { cascade, defaite, victoire } from '../../../tests/e2e/parcours';

it('[E094] les parcours du niveau zéro atteignent les deux phases terminales', () => {
    for (const [fixture, phase] of [
        [victoire, 'WON'],
        [defaite, 'LOST'],
    ] as const) {
        let state = createGame({ seed: fixture.seed, level: 0, speed: 'low' });
        for (const keys of fixture.placements) {
            for (const key of keys) {
                const type = mapKey(key === 'Space' ? ' ' : key);
                if (!type) throw new Error(`Touche inconnue ${key}`);
                const result = step(state, { type });
                expect(result.events.length).toBeGreaterThan(0);
                state = result.state;
            }
        }
        expect(state.phase).toBe(phase);
    }
});

it('[E102] le parcours de réaction en chaîne déclenche réellement deux alignements', () => {
    let state = createGame({ seed: cascade.seed, level: 0, speed: 'low' });
    for (const key of cascade.placements.flat()) {
        const type = mapKey(key === 'Space' ? ' ' : key);
        if (!type) throw new Error(`Touche inconnue ${key}`);
        state = step(state, { type }).state;
    }
    expect(state.phase).toBe('FALLING');
    expect(state.chainCount).toBe(2);
});
