// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GameEvent, GameState, Position } from '@capsule-panic/contracts';
import { createGame, serialize, step } from '@capsule-panic/engine';
import { animationDuration, pieceArtwork, textureFor } from '@capsule-panic/renderer';
import type { BoardView, Match, ViewOptions } from '@capsule-panic/renderer';
import inventaire from '../../../packages/assets/source/inventaire.json';
import { App } from '../src/App';
import { debug, recordCrash, recordFrames } from '../src/diagnostics';
import { Game } from '../src/screens/Game';
import { End } from '../src/screens/End';
import { cascade, victoire } from '../../../tests/e2e/parcours';
import { defaultSettings } from '../src/settings';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings, topScores } from '../src/storage';

const renderer = vi.hoisted(() => ({
    create: vi.fn<(host: HTMLElement, options: ViewOptions) => void>(),
    play: vi.fn<BoardView['play']>(),
    render: vi.fn<(state: GameState, ghost: readonly Position[]) => void>(),
}));
vi.mock('@capsule-panic/renderer', async (original) => ({
    ...(await original<typeof import('@capsule-panic/renderer')>()),
    createBoardView: (host: HTMLElement, options: ViewOptions) => {
        renderer.create(host, options);
        const canvas = document.createElement('canvas');
        host.append(canvas);
        return Promise.resolve({
            ...renderer,
            canvas,
            setOptions: () => undefined,
            destroy: () => canvas.remove(),
        });
    },
}));

let container: HTMLElement;
let root: ReturnType<typeof createRoot>;

beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    history.replaceState(null, '', '/');
    container = document.createElement('main');
    document.body.append(container);
    root = createRoot(container);
    await clearGame();
    await saveSettings(defaultSettings());
    localStorage.clear();
    renderer.create.mockClear();
    renderer.play.mockReset();
    renderer.render.mockClear();
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
});

const noop = () => undefined;
const update = (apply: () => void) =>
    act(async () => {
        apply();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
const mountApp = async () => {
    await update(() => root.render(createElement(App)));
    await act(async () => {
        await Promise.all([loadGame(), loadSettings()]);
    });
};
const click = (label: string) => {
    const button = [...container.querySelectorAll('button')].find(
        (el) => (el.getAttribute('aria-label') ?? el.textContent.trim()) === label,
    );
    expect(button, label).toBeDefined();
    return update(() => button?.click());
};

it('[E366] [E527] [E467] l’accueil affiche la chercheuse de l’atlas et les commandes de la planche', async () => {
    await mountApp();
    for (const name of [
        'logo-jeu',
        'chercheuse-origine',
        'jouer-accueil',
        'options-accueil',
        'credits-accueil',
    ]) {
        expect(container.querySelector(`[data-art="${name}"]`)).not.toBeNull();
    }
});

it('[E125] le chargement direct ouvre les réglages, le jeu ou l’accueil', async () => {
    history.replaceState(null, '', '/#settings');
    await mountApp();
    expect(container.querySelector('h2')?.textContent).toBe('Options');
    await update(() => {
        location.hash = 'game';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(container.querySelector('h2')?.textContent).toBe('Nouvelle partie');
    await update(() => {
        location.hash = 'home';
        window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(container.querySelector('h1 img')?.getAttribute('alt')).toBe('Capsule Panic');
});

it('[E099] [E100] [E103] [E304] [E530] le miroir du réacteur reflète la texture, le fantôme et l’aperçu', async () => {
    const state = createGame({ seed: 'daltonien', level: 3, speed: 'low' });
    const extra = { onSave: noop, onMenu: noop, onEnd: noop, onRestart: noop, onError: noop };
    const settings = { ...defaultSettings(), highContrast: true };
    await update(() => root.render(createElement(Game, { initial: state, settings, ...extra })));
    const reactor = container.querySelector('.reactor');
    expect(reactor?.getAttribute('data-ready')).toBe('oui');
    expect(reactor?.getAttribute('data-ghost')).toBe('2');
    expect(container.querySelectorAll('.preview img')).toHaveLength(2);
    expect(container.querySelector('.game.contrast')).not.toBeNull();
    const mirror = reactor?.getAttribute('data-cellules') ?? '';
    expect(mirror).toContain('cyan,hexagone');
    expect(mirror).toContain('amber,triangle');
    expect(mirror).toContain('magenta,losange');
    // Cellules unies par défaut (règle de l'auteur de la spec) ; la forme vient du mode daltonien.
    expect(textureFor('segment', 'cyan', false)).toEqual({ art: 'cellule-cyan-unie', form: 'aucune' });
    expect(textureFor('segment', 'cyan', true)).toEqual({ art: 'cellule-cyan', form: 'hexagone' });
});

it('[E094] [E298] [E415] [E416] le dernier niveau gagné affiche la victoire et propose de rejouer', async () => {
    const state = createGame({ seed: 'fin', level: 20, speed: 'low' });
    const stats = { capsules: 7, bestChain: 2, crystalsAtStart: state.obstaclesRemaining };
    await update(() =>
        root.render(
            createElement(End, {
                state: { ...state, phase: 'WON', obstaclesRemaining: 0, active: null, score: 704 },
                stats,
                onMenu: noop,
                onRetry: noop,
                onNext: noop,
            }),
        ),
    );
    expect(container.querySelector('[data-art="victoire-bannieres-jeu"]')).not.toBeNull();
    expect(container.textContent).toContain('Victoire !');
    expect(container.textContent).toContain('Combo max ×2');
    expect(container.querySelector('[aria-label="Niveau suivant"]')).toBeNull();
    expect(container.querySelector('[aria-label="Rejouer"]')).not.toBeNull();
});

it('[E104] [E305] les durées sont bornées et la préférence système rejoint le rendu', () => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    vi.spyOn(media, 'matches', 'get').mockReturnValue(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    expect(defaultSettings().reducedMotion).toBe(true);
    for (const name of ['lock', 'gravity', 'match', 'combo'] as const) {
        expect(animationDuration(name, false)).toBeGreaterThanOrEqual(120);
        expect(animationDuration(name, false)).toBeLessThanOrEqual(350);
        expect(animationDuration(name, true)).toBe(0);
    }
});

it('[E154] les sauvegardes JSON importées sont validées et la précédente survit à un refus', async () => {
    const saved = createGame({ seed: 'locale', level: 1, speed: 'low' });
    await saveGame(saved);
    history.replaceState(null, '', '/#settings');
    await mountApp();
    const input = container.querySelector('input[type=file]');
    if (!input) throw new Error('Import absent');
    const send = async (content: string) => {
        Object.defineProperty(input, 'files', {
            configurable: true,
            value: [new File([content], 'partie.json')],
        });
        await update(() => {
            input.dispatchEvent(new Event('change', { bubbles: true }));
        });
    };
    await send('{');
    await vi.waitFor(() =>
        expect(container.querySelector('[role=alert]')?.textContent).toContain('JSON invalide'),
    );
    expect(await loadGame()).toEqual(saved);

    await send(JSON.stringify({ ...saved, active: null }));
    await vi.waitFor(() => expect(container.querySelector('[role=alert]')?.textContent).toContain('/active'));
    expect(await loadGame()).toEqual(saved);

    const other = createGame({ seed: 'remplacement', level: 3, speed: 'high' });
    const fallen = step(step(other, { type: 'TICK' }).state, { type: 'SOFT_DROP' }).state;
    const replacement = step(fallen, { type: 'PAUSE' }).state;
    expect(replacement).not.toEqual(saved);
    await send(serialize(replacement));
    await vi.waitFor(() =>
        expect(container.querySelector('[role=alert]')?.textContent).toContain('Partie importée'),
    );
    expect(await loadGame()).toEqual(replacement);
});

it('[E178] [E179] le journal est opt-in et les métriques sont locales et agrégées', () => {
    const log = vi.spyOn(console, 'debug').mockImplementation(noop);
    debug(false, 'partie ouverte');
    expect(log).not.toHaveBeenCalled();
    debug(true, 'partie ouverte');
    expect(log.mock.calls).toEqual([['Capsule Panic', 'partie ouverte']]);
    recordFrames(500, 30);
    recordFrames(500, 30);
    recordCrash();
    expect(JSON.parse(localStorage.getItem('capsule-panic-metriques') ?? '{}')).toEqual({
        durationMs: 1000,
        frames: 60,
        fps: 60,
        crashes: 1,
    });
});

it('[E302] [E303] les jetons de texte et de fond satisfont le contraste AA', () => {
    const css = readFileSync('apps/web/src/style.css', 'utf8');
    const colors = new Map(
        [...css.matchAll(/--(fond|panneau|texte): (#\w{6});/g)].map((match) => [match[1], match[2]]),
    );
    expect(colors.get('fond')?.toUpperCase()).toBe('#111827');
    expect(colors.get('panneau')?.toUpperCase()).toBe('#1F2937');
    expect(colors.get('texte')?.toUpperCase()).toBe('#F9FAFB');
    const light = (color: string | undefined) => {
        const rgb = (color ?? '').slice(1).match(/.{2}/g) ?? [];
        return rgb.reduce((result, hex, i) => {
            const channel = parseInt(hex, 16) / 255;
            const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
            return result + linear * ([0.2126, 0.7152, 0.0722][i] ?? 0);
        }, 0);
    };
    for (const shade of ['fond', 'panneau']) {
        expect(
            (light(colors.get('texte')) + 0.05) / (light(colors.get(shade)) + 0.05),
        ).toBeGreaterThanOrEqual(4.5);
    }
});

it(`${Object.keys(inventaire)
    .map((id) => `[${id}]`)
    .join(' ')} les crédits montrent les éléments identifiés des planches`, async () => {
    history.replaceState(null, '', '/#credits');
    await mountApp();
    await click('Provenance des illustrations');
    const figures = new Set(
        [...container.querySelectorAll('#catalogue [data-art]')]
            .filter(
                (figure) =>
                    figure.closest('li')?.textContent.includes('.png') &&
                    (figure as HTMLElement).style.backgroundImage,
            )
            .map((figure) => figure.getAttribute('data-art')),
    );
    for (const [id, names] of Object.entries(inventaire)) {
        for (const name of names) expect(figures.has(name), `[${id}] ${name}`).toBe(true);
    }
});

it('[E263] le mode daltonien résiste à une écriture IndexedDB interrompue et peut être désactivé', async () => {
    await mountApp();
    await click('Options');
    const checkbox = () =>
        [...container.querySelectorAll('label')]
            .find((label) => label.textContent.includes('Mode daltonien'))
            ?.querySelector('input');
    const updatePreference = async () => {
        const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (
            this: IDBObjectStore,
        ) {
            this.transaction.abort();
            return {} as IDBRequest<IDBValidKey>;
        });
        await update(() => checkbox()?.click());
        await vi.waitFor(() => expect(put).toHaveBeenCalledTimes(1));
        put.mockRestore();
        act(() => root.unmount());
        root = createRoot(container);
        await mountApp();
        expect(container.querySelector('h2')?.textContent).toBe('Options');
    };

    expect(checkbox()?.checked).toBe(false);
    await updatePreference();
    expect(checkbox()?.checked).toBe(true);
    await updatePreference();
    expect(checkbox()?.checked).toBe(false);
});

it('quitter pendant la sauvegarde ne redessine pas le réacteur démonté', async () => {
    const initial = createGame({ seed: 'reprise', level: 0, speed: 'low' });
    const checkpoint = Promise.withResolvers<undefined>();
    const onSave = vi.fn(() => checkpoint.promise);
    await update(() =>
        root.render(
            createElement(Game, {
                initial,
                settings: defaultSettings(),
                onSave,
                onMenu: noop,
                onEnd: noop,
                onRestart: noop,
                onError: noop,
            }),
        ),
    );
    await update(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })));
    expect(onSave).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
    renderer.render.mockClear();
    checkpoint.resolve(undefined);
    await checkpoint.promise;
    expect(renderer.render).not.toHaveBeenCalled();
});

it('la fin de partie conserve le meilleur combo et les poses d’avant le rechargement', async () => {
    await saveGame(createGame({ seed: cascade.seed, level: 0, speed: 'low' }));
    await resumeSaved();
    await playPlacements([...cascade.placements, ['Space']]);
    expect(await loadGame()).toMatchObject({ score: 520, chainCount: 0 });

    act(() => root.unmount());
    root = createRoot(container);
    history.replaceState(null, '', '/');
    await resumeSaved();
    await playPlacements(Array.from({ length: 6 }, () => ['Space']));
    expect(container.querySelector('h2')?.textContent).toContain('Défaite !');
    expect(container.textContent).toContain('Combo max ×2');
    expect(container.textContent).toContain('Capsules jouées 28');
});

it('[E125] Retour depuis les options ouvertes par l’accueil revient à l’accueil', async () => {
    await mountApp();
    await click('Options');
    expect(container.querySelector('h2')?.textContent).toBe('Options');
    expect(location.hash).toBe('#settings');
    await update(() => history.back());
    await vi.waitFor(() =>
        expect(container.querySelector('h1 img')?.getAttribute('alt')).toBe('Capsule Panic'),
    );
});

const pressKeys = (keys: readonly string[]) =>
    update(() => {
        for (const key of keys)
            window.dispatchEvent(new KeyboardEvent('keydown', { key: key === 'Space' ? ' ' : key }));
    });
const playPlacements = async (placements: readonly string[][]) => {
    for (const keys of placements) {
        await pressKeys(keys);
        await act(async () => {
            await loadGame();
        });
    }
};
const resumeSaved = async () => {
    // L'environnement DOM de test émet hashchange pour pushState, contrairement au navigateur.
    vi.spyOn(history, 'pushState').mockImplementation(noop);
    await mountApp();
    await click('Reprendre la partie');
    await click('Reprendre');
};
const mountGame = async (initial: GameState, settings = defaultSettings()) =>
    update(() =>
        root.render(
            createElement(Game, {
                initial,
                settings,
                onSave: noop,
                onMenu: noop,
                onEnd: noop,
                onRestart: noop,
                onError: noop,
            }),
        ),
    );

it('[E099] affiche dans l’ordre les deux textures distinctes de la prochaine capsule', async () => {
    const initial = {
        ...createGame({ seed: 'file', level: 0, speed: 'low' }),
        nextQueue: [['magenta', 'amber']] as GameState['nextQueue'],
    };
    await mountGame(initial);
    expect([...container.querySelectorAll('.preview img')].map((image) => image.getAttribute('src'))).toEqual(
        [pieceArtwork['cellule-magenta-unie'], pieceArtwork['cellule-ambre-unie']],
    );
});

it('[E528] affiche le multiplicateur et les 80 points du second maillon', async () => {
    const animation = Promise.withResolvers<undefined>();
    renderer.play.mockImplementation(
        (events: readonly GameEvent[], _before: GameState, onMatch: (match: Match) => void) => {
            for (const event of events) {
                if (event.type !== 'MATCH_REMOVED') continue;
                const match = event.payload as Match;
                onMatch(match);
                if (match.chain === 2) return animation.promise;
            }
            return Promise.resolve();
        },
    );
    await saveGame(createGame({ seed: cascade.seed, level: 0, speed: 'low' }));
    await resumeSaved();
    await playPlacements(cascade.placements);
    expect(container.querySelector('.combo')?.textContent).toMatch(/^COMBO ×2\+80$/);
    await act(async () => {
        animation.resolve(undefined);
        await animation.promise;
    });
    await act(async () => {
        await loadGame();
    });
    expect(container.querySelector('[data-testid=score]')?.textContent).toBe('000494');
});

it('[E048] [E094] affiche et conserve le score de la partie gagnée au clavier', async () => {
    await saveGame(createGame({ seed: victoire.seed, level: 0, speed: 'low' }));
    await resumeSaved();
    await playPlacements(victoire.placements);
    expect(container.querySelector('h2')?.textContent).toContain('Niveau réussi !');
    expect(container.querySelector('[data-testid=final-score]')?.textContent).toBe('704');
    await vi.waitFor(async () => expect(await topScores(0, 'low')).toContain(704));
    await click('Niveau suivant');
    expect(container.querySelector('[data-testid=level]')?.textContent).toBe('1');
});

it('[E152] le rechargement restaure le tick et la position sauvegardés à la pause', async () => {
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', (next: FrameRequestCallback) => {
        frame = next;
        return 1;
    });
    try {
        const initial = createGame({ seed: 'pause', level: 0, speed: 'low' });
        await saveGame(initial);
        await resumeSaved();
        const time = performance.now();
        await update(() => {
            for (const elapsed of [250, 500, 750, 760]) frame?.(time + elapsed);
        });
        await pressKeys(['ArrowLeft', 'p']);
        const saved = await loadGame();
        expect(saved).toMatchObject({ tick: 1, phase: 'PAUSED', active: { x: 2, y: 2 } });

        act(() => root.unmount());
        root = createRoot(container);
        history.replaceState(null, '', '/');
        await mountApp();
        await click('Reprendre la partie');
        expect(container.querySelector('dialog[open]')).not.toBeNull();
        expect(renderer.render.mock.lastCall?.[0]).toEqual(saved);
    } finally {
        vi.unstubAllGlobals();
    }
});

it('[E110] un geste tactile sur le réacteur déplace et pivote la capsule', async () => {
    const initial = createGame({ seed: 'gestes', level: 0, speed: 'low' });
    await mountGame(initial);
    const reactor = container.querySelector<HTMLElement>('.reactor');
    if (!reactor) throw new Error('Réacteur absent');
    vi.spyOn(reactor, 'setPointerCapture').mockImplementation(noop);
    vi.spyOn(reactor, 'clientWidth', 'get').mockReturnValue(390);
    vi.spyOn(reactor, 'clientHeight', 'get').mockReturnValue(600);
    const gesture = (from: number, to: number) =>
        update(() => {
            const pointer = {
                bubbles: true,
                isPrimary: true,
                pointerType: 'touch',
                pointerId: 1,
                clientY: 100,
            };
            reactor.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX: from }));
            reactor.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: to }));
        });
    await gesture(100, 168);
    expect(renderer.render.mock.lastCall?.[0]).toMatchObject({ active: { x: 5, orientation: 0 } });
    await gesture(100, 100);
    expect(renderer.render.mock.lastCall?.[0]).toMatchObject({ active: { x: 5, orientation: 1 } });
});

it.each([
    { user: true, system: false },
    { user: false, system: true },
])('[E104] transmet la réduction du mouvement au réacteur ($user, $system)', async ({ user, system }) => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    vi.spyOn(media, 'matches', 'get').mockReturnValue(system);
    vi.spyOn(window, 'matchMedia').mockReturnValue(media);
    await mountGame(createGame({ seed: 'mouvement', level: 0, speed: 'low' }), {
        ...defaultSettings(),
        reducedMotion: user,
    });
    expect(renderer.create.mock.lastCall?.[1]).toMatchObject({ reducedMotion: true });
});
