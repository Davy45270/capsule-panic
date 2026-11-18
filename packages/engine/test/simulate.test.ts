import { it, expect } from 'vitest';
import { validateGameState } from '@capsule-panic/contracts';
import type { GameCommand } from '@capsule-panic/contracts';
import { createGame, step } from '../src/index';
import { randomInt, seedToState } from '../src/rng';
import type { RngState } from '../src/rng';

const GAMES = Number(process.env.SIM_GAMES ?? 10_000);
const MAX_COMMANDS = 4000;
const POLICY: GameCommand['type'][] = ['MOVE_LEFT', 'MOVE_RIGHT', 'ROTATE_CW', 'ROTATE_CCW', 'SOFT_DROP', 'HARD_DROP', 'TICK', 'TICK'];

it(`simulates ${String(GAMES)} games without crash`, () => {
    const ends = { WON: 0, LOST: 0, open: 0 };
    for (let g = 0; g < GAMES; g++) {
        const seed = `sim-${String(g)}`;
        const trace: GameCommand['type'][] = [];
        let rng: RngState = seedToState(`commandes-${String(g)}`);
        let s = createGame({ seed, level: g % 21, speed: 'medium' });
        try {
            for (let i = 0; i < MAX_COMMANDS && s.phase === 'FALLING'; i++) {
                const [k, next] = randomInt(POLICY.length, rng);
                rng = next;
                const type = POLICY[k] ?? 'TICK';
                trace.push(type);
                s = step(s, { type }).state;
            }
            const check = validateGameState(s);
            if (!check.ok) throw new Error(check.errors.join('; '));
        } catch (error) {
            throw new Error(`game ${seed} (level ${String(g % 21)}) failed after ${trace.join(',')}: ${String(error)}`, { cause: error });
        }
        if (s.phase === 'WON' || s.phase === 'LOST') ends[s.phase]++; else ends.open++;
    }
    expect(ends.WON + ends.LOST + ends.open).toBe(GAMES);
}, 600_000);
