import type { Cell, GameState } from '@capsule-panic/contracts';
import type { EventLog } from './events';
import { settle } from './gravity';
import { findMatches } from './match';
import { removeCells } from './remove';

export const MAX_CYCLES = 128;
export const POINTS_PER_OBSTACLE = 100;
export const POINTS_PER_SEGMENT = 10;

type Emit = (type: 'MATCH_REMOVED' | 'GRAVITY_STEP' | 'CASCADE_END', payload: unknown) => void;

/**
 * Boucle de résolution : tant qu'il y a des alignements (cherchés seulement sur un plateau stable), chaîne + 1,
 * suppression simultanée, score `chaîne × (100 × obstacles + 10 × segments)`, gravité jusqu'à stabilité.
 */
export function resolve(board: readonly Cell[], emit: Emit = () => undefined, maxCycles = MAX_CYCLES): { board: Cell[]; scoreDelta: number; chain: number; obstaclesRemoved: number } {
    let current = [...board];
    let chain = 0, scoreDelta = 0, obstaclesRemoved = 0;
    for (let matches = findMatches(current); matches.size > 0; matches = findMatches(current)) {
        if (++chain > maxCycles) throw new Error('resolution did not end');
        const removed = removeCells(current, matches);
        const points = chain * (POINTS_PER_OBSTACLE * removed.obstacles + POINTS_PER_SEGMENT * removed.segments);
        scoreDelta += points;
        obstaclesRemoved += removed.obstacles;
        emit('MATCH_REMOVED', { chain, cells: [...matches].sort((a, b) => a - b), obstacles: removed.obstacles, segments: removed.segments, points });
        current = settle(removed.board, moved => emit('GRAVITY_STEP', { chain, moved })).board;
    }
    if (chain > 0) emit('CASCADE_END', { chain, points: scoreDelta });
    return { board: current, scoreDelta, chain, obstaclesRemoved };
}

/** Résolution après verrouillage, appliquée à l'état : plateau, score, obstacles restants, longueur de chaîne. */
export function resolveAfterLock(state: GameState, log: EventLog): GameState {
    const r = resolve(state.board, (type, payload) => log.emit(type, payload));
    return { ...state, board: r.board, score: state.score + r.scoreDelta, obstaclesRemaining: state.obstaclesRemaining - r.obstaclesRemoved, chainCount: r.chain };
}
