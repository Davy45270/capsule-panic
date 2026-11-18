import 'fake-indexeddb/auto';
import { beforeEach, describe, it, expect } from 'vitest';
import { createGame, RestoreError, step } from '@capsule-panic/engine';
import { clearGame, loadGame, loadSettings, saveGame, saveScore, saveSettings, topScores, writeRawGame } from '../src/storage';

beforeEach(async () => { await clearGame(); });

describe('IndexedDB storage', () => {
    it('T22 save then load gives an equal state', async () => {
        let s = createGame({ seed: 'sauvegarde', level: 4, speed: 'medium' });
        for (const type of ['MOVE_LEFT', 'HARD_DROP', 'ROTATE_CW'] as const) s = step(s, { type }).state;
        await saveGame(s);
        expect(await loadGame()).toEqual(s);
    });
    it('no save gives null', async () => {
        expect(await loadGame()).toBeNull();
    });
    it('a corrupt save is rejected with a readable message', async () => {
        await writeRawGame('{ pas du json');
        await expect(loadGame()).rejects.toThrow(RestoreError);
        await expect(loadGame()).rejects.toThrow('Sauvegarde illisible');
    });
    it('keeps the five best scores per level and speed', async () => {
        for (const score of [10, 500, 30, 400, 20, 300]) await saveScore(2, 'low', score);
        await saveScore(2, 'high', 9999);
        expect(await topScores(2, 'low')).toEqual([500, 400, 300, 30, 20]);
        expect(await topScores(3, 'low')).toEqual([]);
    });
    it('settings roundtrip', async () => {
        expect(await loadSettings()).toBeNull();
        await saveSettings({ highContrast: true, gestures: false, reducedMotion: true });
        expect(await loadSettings()).toEqual({ highContrast: true, gestures: false, reducedMotion: true });
    });
});
