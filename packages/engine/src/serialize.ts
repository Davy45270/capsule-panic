import { validateGameState } from '@capsule-panic/contracts';
import type { GameState } from '@capsule-panic/contracts';

/** Sauvegarde illisible : le message est montrable tel quel, `errors` détaille. */
export class RestoreError extends Error {
    readonly errors: string[];
    constructor(message: string, errors: string[] = []) {
        super(errors.length ? `${message} : ${errors.slice(0, 3).join(' ; ')}` : message);
        this.name = 'RestoreError';
        this.errors = errors;
    }
}

const KEYS = ['schemaVersion', 'ruleset', 'seed', 'rngState', 'width', 'height', 'board', 'active', 'nextQueue', 'phase', 'score',
    'level', 'speed', 'obstaclesRemaining', 'tick', 'chainCount', 'capsuleSerial'] as const satisfies readonly (keyof GameState)[];

/** JSON stable : clés dans l'ordre du schéma, quel que soit l'ordre de l'objet reçu. */
export function serialize(state: GameState): string {
    return JSON.stringify(Object.fromEntries(KEYS.map(key => [key, state[key]])));
}

/** Relit une sauvegarde : JSON, version, schéma puis invariants. Lève `RestoreError` sinon. */
export function restore(json: string): GameState {
    let data: unknown;
    try { data = JSON.parse(json); } catch (error) {
        throw new RestoreError('Sauvegarde illisible : JSON invalide', [String(error)]);
    }
    if (typeof data === 'object' && data !== null && 'schemaVersion' in data && data.schemaVersion !== 1) {
        throw new RestoreError(`Sauvegarde illisible : version ${String(data.schemaVersion)} inconnue (attendu 1)`);
    }
    const result = validateGameState(data);
    if (!result.ok) throw new RestoreError('Sauvegarde illisible : état invalide', result.errors);
    return result.value;
}
