// Persistance locale (IndexedDB) : la partie en cours, les meilleurs scores, les réglages. Rien ne quitte l'appareil.
import { restore, serialize } from '@capsule-panic/engine';
import type { GameState, Speed } from '@capsule-panic/contracts';
import type { Settings } from './settings';

const DB = 'capsule-panic';
const CURRENT = 'courante';

function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            db.createObjectStore('games');
            db.createObjectStore('scores', { autoIncrement: true });
            db.createObjectStore('settings');
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible'));
    });
}

async function run<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await open();
    try {
        return await new Promise<T>((resolve, reject) => {
            const request = action(db.transaction(store, mode).objectStore(store));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error ?? new Error('IndexedDB : échec'));
        });
    } finally { db.close(); }
}

/** Sauvegarde la partie (à l'apparition d'une capsule et à la pause). */
export const saveGame = (state: GameState): Promise<IDBValidKey> => writeRawGame(serialize(state));
/** Écrit une sauvegarde brute (pour les tests de sauvegarde abîmée). */
export const writeRawGame = (json: string): Promise<IDBValidKey> => run('games', 'readwrite', s => s.put(json, CURRENT));
export const clearGame = (): Promise<undefined> => run('games', 'readwrite', s => s.delete(CURRENT));

/** Partie sauvegardée, `null` s'il n'y en a pas ; lève `RestoreError` si elle est illisible. */
export async function loadGame(): Promise<GameState | null> {
    const json = await run<unknown>('games', 'readonly', s => s.get(CURRENT));
    return typeof json === 'string' ? restore(json) : null;
}

interface ScoreRow { level: number; speed: Speed; score: number }
export const saveScore = (level: number, speed: Speed, score: number): Promise<IDBValidKey> => run('scores', 'readwrite', s => s.add({ level, speed, score } satisfies ScoreRow));
export async function topScores(level: number, speed: Speed, n = 5): Promise<number[]> {
    const rows = await run<ScoreRow[]>('scores', 'readonly', s => s.getAll() as IDBRequest<ScoreRow[]>);
    return rows.filter(r => r.level === level && r.speed === speed).map(r => r.score).sort((a, b) => b - a).slice(0, n);
}

export const saveSettings = (settings: Settings): Promise<IDBValidKey> => run('settings', 'readwrite', s => s.put(settings, 'reglages'));
export async function loadSettings(): Promise<Settings | null> {
    const value = await run<Settings | undefined>('settings', 'readonly', s => s.get('reglages') as IDBRequest<Settings | undefined>);
    return value ?? null;
}
