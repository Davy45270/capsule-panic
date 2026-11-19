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
            play: (events: readonly GameEvent[]) => {
                played.push([...events]);
                return events.some((e) => e.type === 'MATCH_REMOVED')
                    ? new Promise<void>((r) => {
                          release = r;
                      })
                    : Promise.resolve();
            },
        },
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
    return {
        ...s,
        board,
        obstaclesRemaining: 4,
        active: { id: 'c1', colors: ['cyan', 'amber'], x: 3, y: 1, orientation: 0 },
    };
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
    it('[E106] inputs during cascade animation are dropped, not queued', async () => {
        const v = fakeView();
        const session = new GameSession(aboutToMatch(), v.hooks);
        expect(session.command('HARD_DROP')).toBe(true);
        expect(session.animating).toBe(true);
        const during = session.state;
        expect(session.command('MOVE_LEFT')).toBe(false);
        session.tick();
        expect(session.state).toBe(during);
        v.release();
        await Promise.resolve();
        await Promise.resolve();
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
    it('[E152] attend la fin de l’animation avant de signaler la réussite', async () => {
        const spawned: (string | null)[] = [];
        let ended: GameState | null = null;
        const s = aboutToMatch();
        const single = {
            ...s,
            board: s.board.map((c, i) => (i === 10 * 8 + 7 ? null : c)),
            obstaclesRemaining: 3,
        };
        const v = fakeView();
        const session = new GameSession(single, {
            ...v.hooks,
            onSpawn: (st) => {
                spawned.push(st.active?.id ?? null);
            },
            onEnd: (st) => {
                ended = st;
            },
        });
        session.command('HARD_DROP');
        expect(ended).toBeNull();
        v.release();
        await Promise.resolve();
        expect(ended).not.toBeNull();
        expect(session.state.phase).toBe('WON');
        expect(spawned).toEqual([]);
    });
});

it('[E152] diffère la sauvegarde à l’apparition et la pause pendant la résolution', async () => {
    const v = fakeView();
    const saved: GameState[] = [];
    const session = new GameSession(aboutToMatch(), {
        ...v.hooks,
        onSpawn: (state) => {
            saved.push(state);
        },
    });
    session.command('HARD_DROP');
    session.visibilityChanged(true);
    expect(saved).toEqual([]);
    expect(session.state.phase).toBe('FALLING');
    v.release();
    await Promise.resolve();
    expect(saved).toEqual([session.state]);
    expect(session.state.phase).toBe('PAUSED');
});

it('[E256] attend la sauvegarde de la capsule avant de publier son score et de la laisser bouger', async () => {
    const before = createGame({ seed: 'reprise', level: 0, speed: 'low' });
    const checkpoint = Promise.withResolvers<undefined>();
    const shown: GameState[] = [];
    let saved: GameState | undefined;
    const hooks = {
        ...fakeView().hooks,
        onChange: (state: GameState) => {
            shown.push(state);
        },
        onSpawn: (state: GameState) => {
            saved = state;
            return checkpoint.promise;
        },
    };
    const session = new GameSession(before, hooks);

    session.command('HARD_DROP');
    expect(saved?.active?.id).toBe('c2');
    expect(shown.map((state) => state.active?.id)).toEqual(['c1']);
    expect(session.command('MOVE_LEFT')).toBe(false);
    session.tick();
    expect(session.state).toBe(saved);

    checkpoint.resolve(undefined);
    await checkpoint.promise;
    expect(shown.at(-1)).toBe(saved);
    expect(shown.at(-1)?.active).toMatchObject({ id: 'c2', x: 3, y: 1, orientation: 0 });
    expect(shown.at(-1)?.score).toBeGreaterThan(0);
    expect(session.command('MOVE_LEFT')).toBe(true);
    expect(session.state.active?.x).toBe(2);
    expect(saved?.active?.x).toBe(3);
});
