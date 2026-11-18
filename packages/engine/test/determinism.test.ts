import { describe, it, expect } from 'vitest';
import type { GameCommand, GameEvent, GameState } from '@capsule-panic/contracts';
import { createGame, step } from '../src/index';
import { randomInt, seedToState } from '../src/rng';
import type { RngState } from '../src/rng';

const COMMANDS: GameCommand['type'][] = ['MOVE_LEFT', 'MOVE_RIGHT', 'ROTATE_CW', 'ROTATE_CCW', 'SOFT_DROP', 'HARD_DROP', 'TICK', 'TICK', 'TICK'];

/** Rejoue une partie pilotée par une graine de commandes ; rend l'état final et tous les événements. */
export function play(seed: string, commandSeed: string, count: number): { state: GameState; events: GameEvent[] } {
    let state = createGame({ seed, level: 3, speed: 'medium' });
    let rng: RngState = seedToState(commandSeed);
    const events: GameEvent[] = [];
    for (let i = 0; i < count && state.phase === 'FALLING'; i++) {
        const [k, next] = randomInt(COMMANDS.length, rng);
        rng = next;
        const t = step(state, { type: COMMANDS[k] ?? 'TICK' });
        state = t.state;
        events.push(...t.events);
    }
    return { state, events };
}

describe('determinism', () => {
    it('T20 same seed and same commands give the same state and the same events', () => {
        const a = play('partie', 'commandes', 2000);
        expect(play('partie', 'commandes', 2000)).toEqual(a);
        expect(a.events.length).toBeGreaterThan(20);
        expect(a.state.capsuleSerial).toBeGreaterThan(3);
        expect(play('partie', 'autres', 2000)).not.toEqual(a);
    });
});
