import { describe, it, expect, vi } from 'vitest';
import { createGame, step } from '@capsule-panic/engine';
import type { GameEvent, GameState } from '@capsule-panic/contracts';
import { mapKey } from '@capsule-panic/input';
import { cascade, victoire } from '../../../tests/e2e/parcours';
import { GameSession } from '../src/session';

/** Laisse se terminer les promesses en cours (lecture visuelle, écriture, commandes rejouées). */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

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
    // T28 « commandes pendant RESOLVING refusées » ; arbitrage du relecteur (20/11) : « suspendus » ne voulait pas dire
    // « mis en file ». Les commandes sont refusées pendant l'animation, comme à 5f2553b ; seule une PAUSE est différée.
    it('[E106] [E152] [E262] refuse les commandes pendant une cascade (T28) et suspend la chute', async () => {
        const v = fakeView();
        const session = new GameSession(aboutToMatch(), v.hooks);
        expect(session.command('HARD_DROP')).toBe(true);
        expect(session.animating).toBe(true);
        const dropped = session.state;
        expect(session.command('MOVE_LEFT')).toBe(false);
        expect(session.command('HARD_DROP')).toBe(false);
        session.tick();
        expect(session.state).toBe(dropped);
        v.release();
        await flush();
        expect(session.animating).toBe(false);
        expect(session.state).toEqual(dropped);
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

it('[E152] sauvegarde après la résolution, jamais pendant, et applique ensuite la pause demandée', async () => {
    const v = fakeView();
    const saved: GameState[] = [];
    const session = new GameSession(aboutToMatch(), {
        ...v.hooks,
        onSpawn: (state) => {
            saved.push(state);
        },
    });
    session.command('HARD_DROP');
    const spawned = session.state;
    session.visibilityChanged(true);
    expect(saved).toEqual([]);
    v.release();
    await flush();
    expect(saved).toHaveLength(1);
    expect(saved[0]?.active?.id).toBe(spawned.active?.id);
    expect(session.state.phase).toBe('PAUSED');
});

it('[E256] attend la sauvegarde de la capsule avant de publier son score et de reprendre la chute', async () => {
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

it('[E094] rejoue dans l’ordre les commandes reçues pendant une sauvegarde', async () => {
    const checkpoint = Promise.withResolvers<undefined>();
    const session = new GameSession(createGame({ seed: 'reprise', level: 0, speed: 'low' }), {
        ...fakeView().hooks,
        onSpawn: () => checkpoint.promise,
    });
    session.command('HARD_DROP');
    session.command('MOVE_LEFT');
    session.command('ROTATE_CW');
    expect(session.state.active).toMatchObject({ id: 'c2', x: 3, orientation: 0 });
    checkpoint.resolve(undefined);
    await checkpoint.promise;
    expect(session.state.active).toMatchObject({ id: 'c2', x: 2, orientation: 1 });
});

it('[E094] publie une apparition même si la résolution libère le même identifiant', async () => {
    const view = fakeView();
    const spawns: GameState[] = [];
    const initial = aboutToMatch();
    const session = new GameSession(
        {
            ...initial,
            active: { id: 'c1', colors: ['cyan', 'cyan'], x: 2, y: 1, orientation: 1 },
            board: initial.board.map((cell, index) => (index === 15 * 8 + 2 ? null : cell)),
            obstaclesRemaining: 3,
        },
        {
            ...view.hooks,
            onChange: (state: GameState, spawned?: boolean) => {
                if (spawned) spawns.push(state);
            },
        },
    );
    session.command('HARD_DROP');
    view.release();
    await Promise.resolve();
    expect(spawns.map((state) => state.active?.id)).toEqual(['c1']);
});

it('la vue ne reçoit pas le plateau final avant les effets de cascade', async () => {
    const view = fakeView();
    const frames: GameState[] = [];
    const initial = aboutToMatch();
    const session = new GameSession(initial, { ...view.hooks, render: (state) => frames.push(state) });
    session.command('HARD_DROP');
    expect(frames).toEqual([initial]);
    view.release();
    await Promise.resolve();
    expect(frames).toEqual([initial, session.state]);
});

it('[E152] [E531] laisse la pose se terminer avant d’enregistrer et de montrer la capsule suivante', async () => {
    const before = createGame({ seed: 'reprise', level: 0, speed: 'low' });
    const pose = Promise.withResolvers<undefined>();
    const shown: GameState[] = [];
    const saved: GameState[] = [];
    const hooks = {
        ...fakeView().hooks,
        playPlacement: () => pose.promise,
        render: (state: GameState) => {
            shown.push(state);
        },
        onSpawn: (state: GameState) => {
            saved.push(state);
        },
    };
    const session = new GameSession(before, hooks);
    const expected = step(before, { type: 'HARD_DROP' }).state;
    session.command('HARD_DROP');
    expect(session.state).toEqual(expected);
    expect(shown).toEqual([before]);
    expect(saved).toEqual([]);
    pose.resolve(undefined);
    await flush();
    expect(shown).toEqual([before, expected]);
    expect(saved).toEqual([expected]);
});

it('[E106] [E262] la capsule suivante ne tombe ni ne bouge avant la fin de la pose, et les commandes sont refusées', async () => {
    const before = createGame({ seed: 'reprise', level: 0, speed: 'low' });
    const pose = Promise.withResolvers<undefined>();
    const session = new GameSession(before, { ...fakeView().hooks, playPlacement: () => pose.promise });
    session.command('HARD_DROP');
    const spawned = session.state;
    session.tick();
    session.tick();
    expect(session.command('MOVE_LEFT')).toBe(false);
    expect(session.command('HARD_DROP')).toBe(false);
    expect(session.state).toBe(spawned);
    pose.resolve(undefined);
    await flush();
    expect(session.state).toEqual(spawned);
});

// Revue P7 (6d97d47) : une PAUSE demandée pendant la pose, puis un onglet masqué, relançait la partie (la PAUSE en file
// devenait RESUME une fois la pause de masquage appliquée).
it.each(['pose', 'sauvegarde'] as const)(
    '[E046] [E152] une pause demandée pendant la %s, puis l’onglet masqué, laisse la partie en pause',
    async (moment) => {
        const before = createGame({ seed: 'reprise', level: 0, speed: 'low' });
        const attente = Promise.withResolvers<undefined>();
        const session = new GameSession(before, {
            ...fakeView().hooks,
            ...(moment === 'pose'
                ? { playPlacement: () => attente.promise }
                : { onSpawn: () => attente.promise }),
        });
        session.command('HARD_DROP');
        expect(session.command('PAUSE')).toBe(true);
        session.visibilityChanged(true);
        attente.resolve(undefined);
        await flush();
        await flush();
        expect(session.state.phase).toBe('PAUSED');
    },
);

it.each([
    [victoire, 704],
    [cascade, 494],
] as const)(
    '[E094] [E528] garde le score et la position avec des images lentes ($seed)',
    async (parcours, score) => {
        vi.useFakeTimers();
        try {
            const replay = async (duration: number) => {
                const play = () => new Promise<void>((resolve) => setTimeout(resolve, duration));
                const session = new GameSession(createGame({ seed: parcours.seed, level: 0, speed: 'low' }), {
                    render: () => undefined,
                    play,
                    playPlacement: duration ? play : undefined,
                });
                const positions = [];
                for (const keys of parcours.placements) {
                    for (const key of keys) {
                        const command = mapKey(key === 'Space' ? ' ' : key);
                        if (command) session.command(command);
                        positions.push(session.state.active);
                        await vi.advanceTimersByTimeAsync(duration + 1);
                    }
                }
                const beforeTick = session.state;
                session.tick();
                return { positions, beforeTick, afterTick: session.state };
            };
            const immediate = await replay(0);
            expect(immediate.beforeTick.score).toBe(score);
            const slow = await replay(500);
            expect(slow.beforeTick.score).toBe(score);
            expect(slow).toEqual(immediate);
        } finally {
            vi.useRealTimers();
        }
    },
);
