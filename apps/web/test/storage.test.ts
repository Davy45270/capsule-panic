import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { beforeEach, describe, it, expect } from 'vitest';
import { createGame, restore, RestoreError, serialize, step } from '@capsule-panic/engine';
import {
    clearGame,
    loadGame,
    loadSettings,
    saveGame,
    saveScore,
    saveSettings,
    topScores,
    writeRawGame,
} from '../src/storage';

beforeEach(async () => {
    await clearGame();
});

describe('IndexedDB storage', () => {
    it('[E049][E111][E256] T22 reprend exactement à la frontière entre deux capsules', async () => {
        let s = createGame({ seed: 'sauvegarde', level: 4, speed: 'medium' });
        for (const type of ['MOVE_LEFT', 'ROTATE_CW'] as const) s = step(s, { type }).state;
        const boundary = step(s, { type: 'HARD_DROP' });
        expect(boundary.events.map((event) => event.type)).toContain('SPAWNED');
        await saveGame(boundary.state);
        const resumed = await loadGame();
        if (!resumed) throw new Error('sauvegarde attendue');
        expect(resumed).toEqual(boundary.state);
        expect(step(resumed, { type: 'TICK' })).toEqual(step(boundary.state, { type: 'TICK' }));
    });
    it('no save gives null', async () => {
        expect(await loadGame()).toBeNull();
    });
    it('a corrupt save is rejected with a readable message', async () => {
        await writeRawGame('{ pas du json');
        await expect(loadGame()).rejects.toThrow(RestoreError);
        await expect(loadGame()).rejects.toThrow('Sauvegarde illisible');
    });
    it('[E048] keeps the five best scores per level and speed', async () => {
        for (const score of [10, 500, 30, 400, 20, 300]) await saveScore(2, 'low', score);
        await saveScore(2, 'high', 9999);
        expect(await topScores(2, 'low')).toEqual([500, 400, 300, 30, 20]);
        expect(await topScores(3, 'low')).toEqual([]);
    });
    it('settings roundtrip', async () => {
        expect(await loadSettings()).toBeNull();
        await saveSettings({
            highContrast: true,
            gestures: false,
            reducedMotion: true,
            colorBlind: true,
            debug: false,
            level: 3,
            speed: 'low',
        });
        expect(await loadSettings()).toEqual({
            highContrast: true,
            gestures: false,
            reducedMotion: true,
            colorBlind: true,
            debug: false,
            level: 3,
            speed: 'low',
        });
    });
});

async function storedGame(
    gameId: string,
    update?: (raw: { json: string; sha256: string }) => unknown,
): Promise<unknown> {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('capsule-panic', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB indisponible'));
    });
    try {
        return await new Promise<unknown>((resolve, reject) => {
            const tx = db.transaction('games', update ? 'readwrite' : 'readonly');
            const store = tx.objectStore('games');
            const request = store.get(gameId);
            request.onsuccess = () => {
                if (update) store.put(update(request.result as { json: string; sha256: string }), gameId);
            };
            tx.oncomplete = () => resolve(request.result as unknown);
            tx.onabort = () => reject(tx.error ?? new Error('IndexedDB : échec'));
        });
    } finally {
        db.close();
    }
}

it('[E149][E150][E151] stocke par gameId le JSON versionné et son SHA 256', async () => {
    const state = createGame({ seed: 'empreinte-énergie', level: 3, speed: 'high' });
    await saveGame(state, 'partie-empreinte');
    const json = serialize(state);
    expect(await storedGame('partie-empreinte')).toEqual({
        json,
        sha256: createHash('sha256').update(json, 'utf8').digest('hex'),
    });
    expect(json).toContain('"schemaVersion":1');
    expect(await loadGame('partie-empreinte')).toEqual(state);
    expect(await loadGame()).toBeNull();
});

it('[E151] refuse une sauvegarde modifiée même si son JSON respecte le contrat', async () => {
    const state = createGame({ seed: 'intégrité', level: 2, speed: 'low' });
    await saveGame(state, 'partie-altérée');
    const altered = { ...state, score: state.score + 10 };
    const json = serialize(altered);
    expect(restore(json)).toEqual(altered);
    await storedGame('partie-altérée', (raw) => ({ ...raw, json }));
    await expect(loadGame('partie-altérée')).rejects.toThrow(/SHA 256/);
});

it('reprend une sauvegarde publiée sans somme et retire l’ancien compteur', async () => {
    const state = createGame({ seed: 'migration-stockage', level: 4, speed: 'low' });
    await writeRawGame(JSON.stringify({ ...state, capsuleSerial: 2 }));
    expect(await loadGame()).toEqual(state);
});

it('une suppression demandée pendant le calcul de la somme prime sur la sauvegarde', async () => {
    const state = createGame({ seed: 'ordre', level: 0, speed: 'medium' });
    const save = saveGame(state);
    const clear = clearGame();
    const load = loadGame();
    await Promise.all([save, clear]);
    expect(await load).toBeNull();
});
