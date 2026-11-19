import { RULESET } from '@capsule-panic/contracts';
import type { GameState, Speed } from '@capsule-panic/contracts';
import { drawCapsuleColors, SPAWN } from './capsule';
import { generateBoard } from './generate';
import { seedToState } from './rng';

export interface GameConfig { seed: string; level: number; speed: Speed }
const SPEEDS: readonly Speed[] = ['low', 'medium', 'high'];

/**
 * Nouvelle partie, entièrement dérivée de la graine. Ordre des tirages : plateau, couleurs de la capsule active,
 * couleurs de la suivante. L'état rendu est déjà en chute (`FALLING`), capsule c1 au point d'apparition.
 */
export function createGame(config: GameConfig): GameState {
    const { seed, level, speed } = config;
    if (typeof seed !== 'string' || seed.length === 0) throw new RangeError('createGame: empty seed');
    if (!Number.isInteger(level) || level < 0 || level > 20) throw new RangeError(`createGame: level ${String(level)} not in 0..20`);
    if (!SPEEDS.includes(speed)) throw new RangeError(`createGame: unknown speed ${speed}`);
    const { board, rng: afterBoard } = generateBoard(level, seedToState(seed));
    const [activeColors, afterActive] = drawCapsuleColors(afterBoard);
    const [nextColors, rngState] = drawCapsuleColors(afterActive);
    return {
        schemaVersion: 1, ruleset: RULESET, seed, rngState, width: 8, height: 16, board,
        active: { id: 'c1', colors: activeColors, ...SPAWN }, nextQueue: [nextColors],
        phase: 'FALLING', score: 0, level, speed, obstaclesRemaining: board.filter(c => c?.kind === 'obstacle').length,
        tick: 0, chainCount: 0
    };
}
