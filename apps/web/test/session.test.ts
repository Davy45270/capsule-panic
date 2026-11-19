import { describe, it, expect } from 'vitest';
import { createGame } from '@capsule-panic/engine';
import type { GameEvent, GameState } from '@capsule-panic/contracts';
import { GameSession } from '../src/session';

function fakeView() {
    let release: () => void = () => undefined;
    const played: GameEvent[][] = [];
    return {
        played,
        release: () => release(),
        hooks: {
            render: () => undefined,
            play: (events: readonly GameEvent[]) => { played.push([...events]); return events.some(e => e.type === 'MATCH_REMOVED') ? new Promise<void>(r => { release = r; }) : Promise.resolve(); }
        }
    };
}
/** Un état où une descente brusque aligne quatre cellules cyan sur la ligne du bas. */
function aboutToMatch(): GameState {
    const s = createGame({ seed: 'session', level: 0, speed: 'low' });
    const board = s.board.map(() => null) as GameState['board'];
    board[15 * 8 + 0] = { kind: 'obstacle', id: 'o1', color: 'cyan' };
    board[15 * 8 + 1] = { kind: 'obstacle', id: 'o2', color: 'cyan' };
    board[15 * 8 + 2] = { kind: 'obstacle', id: 'o3', color: 'cyan' };
    board[10 * 8 + 7] = { kind: 'obstacle', id: 'o4', color: 'magenta' };
    return { ...s, board, obstaclesRemaining: 4, active: { id: 'c1', colors: ['cyan', 'amber'], x: 3, y: 1, orientation: 0 } };
}

describe('game session', () => {
    it('applies commands and reports refused ones', () => {
        const v = fakeView();
        const session = new GameSession(createGame({ seed: 's', level: 0, speed: 'low' }), v.hooks);
        expect(session.command('MOVE_LEFT')).toBe(true);
        for (let i = 0; i < 3; i++) session.command('MOVE_LEFT');
        expect(session.command('MOVE_LEFT')).toBe(false);
        expect(session.state.active?.x).toBe(0);
    });
    it('inputs during cascade animation are dropped, not queued', async () => {
        const v = fakeView();
        const session = new GameSession(aboutToMatch(), v.hooks);
        expect(session.command('HARD_DROP')).toBe(true);
        expect(session.animating).toBe(true);
        const during = session.state;
        expect(session.command('MOVE_LEFT')).toBe(false);
        session.tick();
        expect(session.state).toBe(during);
        v.release();
        await Promise.resolve(); await Promise.resolve();
        expect(session.animating).toBe(false);
        expect(session.state).toBe(during);
        expect(session.command('MOVE_LEFT')).toBe(true);
    });
    it('visibility hidden pauses the game, and only an explicit resume restarts it', () => {
        const session = new GameSession(createGame({ seed: 's', level: 0, speed: 'low' }), fakeView().hooks);
        session.visibilityChanged(true);
        expect(session.state.phase).toBe('PAUSED');
        session.visibilityChanged(false);
        expect(session.state.phase).toBe('PAUSED');
        session.togglePause();
        expect(session.state.phase).toBe('FALLING');
    });
    it('PAUSE from the keyboard toggles pause and resume', () => {
        const session = new GameSession(createGame({ seed: 's', level: 0, speed: 'low' }), fakeView().hooks);
        session.command('PAUSE');
        expect(session.state.phase).toBe('PAUSED');
        session.command('PAUSE');
        expect(session.state.phase).toBe('FALLING');
    });
    it('keeps the statistics of the level: capsules played and best chain', () => {
        const session = new GameSession(aboutToMatch(), fakeView().hooks);
        session.command('HARD_DROP');
        expect(session.stats).toEqual({ capsules: 1, bestChain: 1, crystalsAtStart: 4 });
    });
    it('notifies spawns and the end of the level', () => {
        const spawned: (string | null)[] = [];
        let ended: GameState | null = null;
        const s = aboutToMatch();
        const single = { ...s, board: s.board.map((c, i) => (i === 10 * 8 + 7 ? null : c)), obstaclesRemaining: 3 };
        const session = new GameSession(single, { ...fakeView().hooks, onSpawn: st => spawned.push(st.active?.id ?? null), onEnd: st => { ended = st; } });
        session.command('HARD_DROP');
        expect(ended).not.toBeNull();
        expect(session.state.phase).toBe('WON');
        expect(spawned).toEqual([]);
    });
});
