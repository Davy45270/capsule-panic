import { expect, it } from 'vitest';
import { COLORS, RULESET, validateGameState } from '@capsule-panic/contracts';
import type { GameCommand, Orientation } from '@capsule-panic/contracts';
import { canPlace, capsuleCells, createGame, resolve, restore, serialize, step } from '../src/index';
import { cellAt, inBounds, index } from '../src/board';
import { drawCapsuleColors } from '../src/capsule';
import { gravityStep, MAX_GRAVITY_STEPS, settle } from '../src/gravity';
import { MAX_CYCLES } from '../src/resolve';
import { seedToState } from '../src/rng';
import { boardFrom, deepFreeze, stateWith, withPair } from './helpers';

it('[E058][E141] le repère 8 × 16 part du coin haut gauche', () => {
    const board = boardFrom(['C.......', ...Array.from({ length: 14 }, () => '........'), '.......M']);
    expect(board).toHaveLength(128);
    expect([index(0, 0), index(7, 0), index(0, 1), index(7, 15)]).toEqual([0, 7, 8, 127]);
    expect(cellAt(board, 0, 0)?.color).toBe('cyan');
    expect(cellAt(board, 7, 15)?.color).toBe('magenta');
    for (const [x, y] of [[-1, 0], [8, 0], [0, -1], [0, 16]] as const) {
        expect(inBounds(x, y)).toBe(false);
        expect(cellAt(board, x, y)).toBeNull();
    }
});

it('[E063] calcule les quatre orientations à pivot fixe', () => {
    const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (const orientation of [0, 1, 2, 3] satisfies Orientation[]) {
        const [dx, dy] = offsets[orientation] as [number, number];
        expect(capsuleCells({ x: 3, y: 5, orientation })).toEqual([{ x: 3, y: 5 }, { x: 3 + dx, y: 5 + dy }]);
    }
});

it('[E060][E061] les neuf paires ordonnées de couleurs apparaissent à fréquence comparable', () => {
    expect(COLORS).toEqual(['cyan', 'amber', 'magenta']);
    let rng = seedToState('neuf-paires');
    const counts = new Map<string, number>();
    for (let i = 0; i < 90_000; i++) {
        const [colors, next] = drawCapsuleColors(rng);
        const key = colors.join('/');
        counts.set(key, (counts.get(key) ?? 0) + 1);
        rng = next;
    }
    expect(counts.size).toBe(9);
    for (const first of COLORS) for (const second of COLORS) {
        expect(Math.abs((counts.get(`${first}/${second}`) ?? 0) - 10_000)).toBeLessThan(600);
    }
});

it('[E034][E134][E135][E186][E194] T01 deux cases en chute sont distinctes des cases verrouillées', () => {
    const initial = createGame({ seed: 'plateau-et-capsule', level: 0, speed: 'low' });
    expect(initial.board).toHaveLength(128);
    expect(initial.board.every(cell => cell === null || cell.kind === 'obstacle')).toBe(true);
    const tick = step(initial, { type: 'TICK' });
    expect(tick.state.board).toEqual(initial.board);
    expect(tick.state.active).toMatchObject({ x: 3, y: 2 });
    const active = tick.state.active;
    if (!active) throw new Error('capsule active attendue');
    const dropping = step(tick.state, { type: 'HARD_DROP' });
    expect(dropping.events[0]?.type).toBe('LOCKED');
    expect(dropping.state.board.filter(cell => cell?.kind === 'segment').map(cell => cell.id).sort()).toEqual(['c1a', 'c1b']);
});

it('[E073][E140][E148][E197][E198] seul un tick accepté avance l’horloge des événements', () => {
    let state = deepFreeze(stateWith(boardFrom(['.......C']), {}, { tick: 11 }));
    let events: ReturnType<typeof step>['events'] = [];
    const commands: GameCommand['type'][] = ['MOVE_LEFT', 'ROTATE_CW', 'SOFT_DROP', 'PAUSE', 'RESUME', 'TICK', 'HARD_DROP'];
    for (const type of commands) {
        const expected = state.tick + (type === 'TICK' ? 1 : 0);
        const transition = step(state, { type });
        expect(transition.state.tick).toBe(expected);
        expect(transition.events.length).toBeGreaterThan(0);
        expect(transition.events.map(event => event.tick)).toEqual(transition.events.map(() => expected));
        expect(transition.events.map(event => event.seq)).toEqual(transition.events.map((_, seq) => seq));
        expect(transition.events).not.toBe(events);
        events = deepFreeze(transition.events);
        state = deepFreeze(transition.state);
    }
});

it('[E082][E084] un micro-pas libère les cases pour le micro-pas suivant', () => {
    const board = withPair(boardFrom(['c.......', '........', 'a..m....', '........']), 'paire', [0, 13], [1, 13], ['cyan', 'amber']);
    const first = gravityStep(board);
    expect(first.moved).toEqual([board[14 * 8]?.id, board[14 * 8 + 3]?.id]);
    expect(first.board[12 * 8]?.id).toBe(board[12 * 8]?.id);
    const second = gravityStep(first.board);
    expect(second.moved).toEqual(['pairea']);
    expect(second.board[14 * 8]?.id).toBe('pairea');
    const third = gravityStep(second.board);
    expect(third.moved).toEqual([board[12 * 8]?.id]);
    expect(third.board[13 * 8]?.id).toBe(board[12 * 8]?.id);
    expect(gravityStep(third.board).moved).toEqual([]);
});

it('[E204][E208] les garde-fous arrêtent un pas ou une cascade en excès', () => {
    expect(MAX_GRAVITY_STEPS).toBe(128 * 16);
    expect(MAX_CYCLES).toBe(128);

    const board = boardFrom(['c.......', '........', '........']);
    const notifications: string[][] = [];
    expect(() => settle(board, moved => notifications.push(moved), 1)).toThrow('gravity did not settle');
    expect(notifications).toEqual([[board[13 * 8]?.id]]);
    expect(settle(board, undefined, 2).steps).toBe(2);

    const alreadyMatched = boardFrom(['CCCC....']);
    expect(() => resolve(alreadyMatched, undefined, 0)).toThrow('resolution did not end');
    expect(resolve(alreadyMatched, undefined, 1).chain).toBe(1);
});

it('[E079][E086][E201][E249] T15 une suppression réelle libère une demi-paire', () => {
    const board = withPair(boardFrom(['CCC.....', '........', '........', '........', '........', '....M...']), 'paire', [3, 10], [4, 10], ['cyan', 'amber']);
    const result = resolve(board);
    expect(result.chain).toBe(1);
    expect(result.board[10 * 8 + 3]).toBeNull();
    expect(result.board[14 * 8 + 4]).toMatchObject({ id: 'paireb', linkedToId: null, part: 1 });
    expect(result.board[15 * 8 + 4]).toEqual(board[15 * 8 + 4]);
});

it('[E077][E087][E146][E209][E250] T16 une cascade ignore les alignements transitoires et conserve les obstacles flottants', () => {
    const board = boardFrom(['c...aaaa', '........', '........', '.CCC....', '........', '........', '........', '........']);
    const removed: unknown[] = [];
    const result = resolve(board, (type, payload) => { if (type === 'MATCH_REMOVED') removed.push(payload); });
    expect(removed).toHaveLength(1);
    expect(result.chain).toBe(1);
    expect(result.board[15 * 8]).toEqual(board[8 * 8]);
    for (const x of [1, 2, 3]) expect(result.board[11 * 8 + x]).toEqual(board[11 * 8 + x]);
});

it('[E195][E247] T13 un verrouillage met à jour score, compteur et événements', () => {
    const board = boardFrom(['.......M', '.Ccc....']);
    const before = restore(serialize(stateWith(board, { x: 0 })));
    const transition = step(before, { type: 'HARD_DROP' });
    expect(transition.state.obstaclesRemaining).toBe(1);
    expect(transition.state.score).toBe(28 + 100 + 3 * 10);
    expect(transition.events.find(event => event.type === 'MATCH_REMOVED')?.payload).toMatchObject({ obstacles: 1, segments: 3, points: 130 });
    expect(transition.state.board[15 * 8 + 1]).toBeNull();
    expect(validateGameState(transition.state).ok).toBe(true);
});

it('une capsule tient au contact du sol pour chacune des orientations autorisées', () => {
    const board = boardFrom([]);
    expect(canPlace(board, { x: 0, y: 15, orientation: 0 })).toBe(true);
    expect(canPlace(board, { x: 0, y: 15, orientation: 2 })).toBe(false);
});

it('[E147] le RNG d’une partie reprise est indépendant des autres parties jouées', () => {
    const initial = createGame({ seed: 'rng-reprise', level: 0, speed: 'low' });
    const saved = serialize(initial);
    const expected = step(initial, { type: 'HARD_DROP' });
    expect(expected.events.map(event => event.type)).toContain('SPAWNED');
    expect(expected.state.rngState).not.toEqual(initial.rngState);
    const shuffled = createGame({ seed: 'autre-partie', level: 20, speed: 'high' });
    step(shuffled, { type: 'HARD_DROP' });
    expect(step(restore(saved), { type: 'HARD_DROP' })).toEqual(expected);
});

it('[E043][E127] une partie générée combine déplacement, collision, aléa, suppression, gravité et score', () => {
    const initial = deepFreeze(createGame({ seed: 'rejeu-9', level: 12, speed: 'medium' }));
    expect(initial.obstaclesRemaining).toBe(52);
    expect(initial.ruleset).toBe(RULESET);
    let state = initial;
    for (let i = 0; i < 4; i++) state = step(state, { type: 'MOVE_RIGHT' }).state;
    expect(state.active?.x).toBe(7);
    expect(step(state, { type: 'MOVE_RIGHT' })).toEqual({ state, events: [] });
    const transition = step(state, { type: 'HARD_DROP' });
    expect(transition.events.map(event => event.type)).toEqual([
        'LOCKED', 'MATCH_REMOVED', 'GRAVITY_STEP', 'CASCADE_END', 'SPAWNED',
    ]);
    expect(transition.events[1]?.payload).toMatchObject({ cells: [52, 53, 54, 55], obstacles: 3, segments: 1, points: 310 });
    expect(transition.events[2]?.payload).toEqual({ chain: 1, moved: ['c1b'] });
    expect(transition.state).toMatchObject({
        score: 320, obstaclesRemaining: 49, chainCount: 1, phase: 'FALLING',
        rngState: [369779260, 4274385084, 2209489072, 939061903],
        active: { id: 'c2', colors: ['cyan', 'magenta'], x: 3, y: 1, orientation: 0 },
    });
});
