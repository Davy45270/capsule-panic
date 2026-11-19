// Persistance locale (IndexedDB) : la partie en cours, les meilleurs scores, les réglages. Rien ne quitte l'appareil.
import { restore, RestoreError, serialize } from '@capsule-panic/engine';
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
            const tx = db.transaction(store, mode);
            const request = action(tx.objectStore(store));
            tx.oncomplete = () => resolve(request.result);
            tx.onabort = () => reject(tx.error ?? new Error('IndexedDB : échec'));
        });
    } finally { db.close(); }
}

interface SavedGame { json: string; sha256: string }

async function checksum(json: string): Promise<string> {
    const bytes = await globalThis.crypto.subtle.digest('sha-256', new TextEncoder().encode(json));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Le calcul asynchrone du SHA 256 ne doit pas réordonner sauvegardes, suppressions et lectures.
const pendingGames = new Map<string, Promise<void>>();
function inGameOrder<T>(gameId: string, operation: () => Promise<T>): Promise<T> {
    const pending = pendingGames.get(gameId) ?? Promise.resolve();
    const result = pending.then(operation);
    const tail = result.then(() => undefined, () => undefined);
    pendingGames.set(gameId, tail);
    void tail.then(() => { if (pendingGames.get(gameId) === tail) pendingGames.delete(gameId); });
    return result;
}

/** Sauvegarde la partie (à l'apparition d'une capsule et à la pause). */
export function saveGame(state: GameState, gameId = CURRENT): Promise<IDBValidKey> {
    const json = serialize(state);
    return inGameOrder(gameId, async () => {
        const saved: SavedGame = { json, sha256: await checksum(json) };
        return run('games', 'readwrite', s => s.put(saved, gameId));
    });
}
/** Écrit une sauvegarde brute (pour les tests de sauvegarde abîmée). */
export const writeRawGame = (json: string): Promise<IDBValidKey> =>
    inGameOrder(CURRENT, () => run('games', 'readwrite', s => s.put(json, CURRENT)));
export const clearGame = (gameId = CURRENT): Promise<undefined> =>
    inGameOrder(gameId, () => run('games', 'readwrite', s => s.delete(gameId)));

/** Partie sauvegardée, `null` s'il n'y en a pas ; lève `RestoreError` si elle est illisible. */
export function loadGame(gameId = CURRENT): Promise<GameState | null> {
    return inGameOrder(gameId, async () => {
        const saved = await run<unknown>('games', 'readonly', s => s.get(gameId));
        if (saved === undefined) return null;
        if (typeof saved === 'string') return restore(saved);
        if (typeof saved !== 'object' || saved === null || !('json' in saved) || typeof saved.json !== 'string' ||
            !('sha256' in saved) || typeof saved.sha256 !== 'string' || await checksum(saved.json) !== saved.sha256) {
            throw new RestoreError('Sauvegarde illisible : somme SHA 256 invalide');
        }
        return restore(saved.json);
    });
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
