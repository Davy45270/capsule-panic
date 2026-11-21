import { useEffect, useRef, useState } from 'react';
import type { GameState } from '@capsule-panic/contracts';
import { gestureCommands, mapKey } from '@capsule-panic/input';
import type { CommandType } from '@capsule-panic/input';
import { boardLayout, createBoardView, pieceArtwork, textureFor } from '@capsule-panic/renderer';
import type { BoardView, Match } from '@capsule-panic/renderer';
import { createLoop } from '../loop';
import { recordFrames } from '../diagnostics';
import { GameSession } from '../session';
import type { LevelStats, SessionHooks } from '../session';
import type { Settings } from '../settings';
import { Art, ArtButton } from '../Artwork';
import type { ArtworkName } from '../Artwork';
import { WIDTH } from '@capsule-panic/contracts';
import { getLandingProjection } from '@capsule-panic/engine';

const BUTTONS: [CommandType, ArtworkName, string][] = [
    ['MOVE_LEFT', 'gauche-commandes-origine', 'Gauche'],
    ['MOVE_RIGHT', 'droite-commandes-origine', 'Droite'],
    ['SOFT_DROP', 'bas-commandes-origine', 'Descendre'],
    ['ROTATE_CW', 'rotation-commandes-origine', 'Pivoter'],
];

export function Game({
    initial,
    initialStats,
    settings,
    onEnd,
    onMenu,
    onSave,
    onRestart,
    onError,
}: {
    initial: GameState;
    initialStats?: LevelStats;
    settings: Settings;
    onEnd(state: GameState, stats: LevelStats): void;
    onMenu(state: GameState, stats?: LevelStats): void;
    onSave(state: GameState, stats: LevelStats): void | Promise<void>;
    onRestart(): void;
    onError(): void;
}) {
    const host = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<GameSession | null>(null);
    const loopRef = useRef<ReturnType<typeof createLoop> | null>(null);
    const [state, setState] = useState(initial);
    const dialog = useRef<HTMLDialogElement>(null);
    const [animating, setAnimating] = useState(false);
    const [combo, setCombo] = useState<Match | null>(null);
    const [spawns, setSpawns] = useState(0);
    const [ready, setReady] = useState(false);
    const callbacks = useRef({ onEnd, onSave, onError, settings });
    callbacks.current = { onEnd, onSave, onError, settings };

    useEffect(() => {
        let view: BoardView | null = null;
        let cancelled = false;
        let duration = 0;
        let frames = 0;
        const flushMetrics = () => {
            if (frames) recordFrames(Math.round(duration), frames);
            duration = 0;
            frames = 0;
        };
        const loop = createLoop({
            speed: initial.speed,
            onTick: () => sessionRef.current?.tick(),
            onFrame: (elapsed) => {
                if (document.hidden || sessionRef.current?.state.phase !== 'FALLING') return;
                duration += elapsed;
                frames++;
            },
        });
        const element = host.current;
        if (!element) return undefined;
        const motion = matchMedia('(prefers-reduced-motion: reduce)');
        const viewOptions = () => ({
            ...callbacks.current.settings,
            reducedMotion: callbacks.current.settings.reducedMotion || motion.matches || document.hidden,
        });
        const onMotion = () => view?.setOptions(viewOptions());
        motion.addEventListener('change', onMotion);
        void createBoardView(element, viewOptions())
            .then((v) => {
                if (cancelled) {
                    v.destroy();
                    return;
                }
                view = v;
                let published = initial;
                let checkpoint = initial;
                const play: SessionHooks['play'] = async (events, before) => {
                    setAnimating(true);
                    setCombo(null);
                    await v.play(events, before, setCombo);
                };
                const session = new GameSession(
                    initial,
                    {
                        render: (s, ghost, before) => {
                            if (cancelled) return;
                            v.render(s, ghost, before);
                            setState(s);
                            setCombo(null);
                            setAnimating(false);
                        },
                        play,
                        playPlacement: (events, before) =>
                            viewOptions().reducedMotion ? undefined : play(events, before),
                        onChange: (s, spawned) => {
                            if (cancelled) return;
                            if (spawned) {
                                loop.resetCadence();
                                setSpawns((n) => n + 1);
                            }
                            if (s.phase === 'PAUSED' && published.phase === 'FALLING' && s !== checkpoint)
                                void callbacks.current.onSave(s, session.stats);
                            if (s.phase === 'PAUSED' || published.phase === 'PAUSED') setState(s);
                            published = s;
                        },
                        onSpawn: (s) => {
                            if (cancelled) return;
                            setAnimating(true);
                            checkpoint = s;
                            return callbacks.current.onSave(s, session.stats);
                        },
                        onEnd: (s) => {
                            if (!cancelled) {
                                loop.stop();
                                callbacks.current.onEnd(s, session.stats);
                            }
                        },
                    },
                    initialStats,
                );
                sessionRef.current = session;
                loopRef.current = loop;
                loop.start();
                setReady(true);
            })
            .catch(() => {
                if (!cancelled) callbacks.current.onError();
            });
        const onVisibility = (): void => {
            sessionRef.current?.visibilityChanged(document.hidden);
            onMotion();
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', flushMetrics);
        return () => {
            cancelled = true;
            loop.stop();
            loopRef.current = null;
            flushMetrics();
            window.removeEventListener('pagehide', flushMetrics);
            document.removeEventListener('visibilitychange', onVisibility);
            motion.removeEventListener('change', onMotion);
            view?.destroy();
            sessionRef.current = null;
        };
    }, [initial, initialStats]);

    const send = (type: CommandType): void => {
        const session = sessionRef.current;
        if (!session) return;
        loopRef.current?.sync();
        session.command(type);
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            const type = mapKey(e.key);
            if (!type || (e.key === ' ' && e.target instanceof HTMLButtonElement)) return;
            e.preventDefault();
            send(type);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const touch = useRef<{ x: number; y: number; t: number } | null>(null);
    const onPointerDown = (e: React.PointerEvent): void => {
        if (settings.gestures && e.isPrimary && e.pointerType !== 'mouse') {
            e.currentTarget.setPointerCapture(e.pointerId);
            touch.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
        }
    };
    const onPointerUp = (e: React.PointerEvent): void => {
        if (!e.isPrimary) return;
        const start = touch.current;
        touch.current = null;
        if (!start || !host.current) return;
        const cell = boardLayout(host.current.clientWidth, host.current.clientHeight).cell;
        for (const type of gestureCommands({
            dx: e.clientX - start.x,
            dy: e.clientY - start.y,
            ms: e.timeStamp - start.t,
            cell,
        }))
            send(type);
    };

    const paused = state.phase === 'PAUSED';
    useEffect(() => {
        if (paused) {
            if (dialog.current && !dialog.current.open) dialog.current.showModal();
        } else if (ready) host.current?.focus({ preventScroll: true });
    }, [paused, ready]);
    const next = state.nextQueue[0];
    const cells = state.board
        .flatMap((cell, i) =>
            cell
                ? [
                      `${i % WIDTH},${Math.floor(i / WIDTH)},${cell.color},${textureFor(cell.kind, cell.color, settings.colorBlind).form}`,
                  ]
                : [],
        )
        .join(' ');
    const ghostCount = ready ? getLandingProjection(state).length : 0;
    return (
        <section className={`screen game board-screen${settings.highContrast ? ' contrast' : ''}`}>
            <header className="hud">
                <div className="hud-level">
                    Niveau <strong data-testid="level">{state.level}</strong>
                </div>
                <strong aria-label="Score" data-testid="score">
                    {String(state.score).padStart(6, '0')}
                </strong>
                <button className="pause-button art-button" aria-label="Pause" onClick={() => send('PAUSE')}>
                    <Art name="pause-commandes-origine" />
                </button>
            </header>
            <div className="game-body">
                <div
                    className="reactor"
                    ref={host}
                    tabIndex={0}
                    data-ready={ready && !animating ? 'oui' : 'non'}
                    role="img"
                    aria-label="Chambre du réacteur"
                    data-daltonien={settings.colorBlind ? 'oui' : 'non'}
                    data-cellules={cells}
                    data-ghost={ghostCount}
                    data-spawns={spawns}
                    data-capsule={
                        state.active
                            ? `${state.active.id} ${String(state.active.x)},${String(state.active.y)},${String(state.active.orientation)}`
                            : ''
                    }
                    onPointerDown={onPointerDown}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => {
                        touch.current = null;
                    }}
                />
                <aside className="game-panels" aria-label="Informations de partie">
                    <div className="counter next">
                        <span>Suivant</span>
                        {next && (
                            <div
                                className="preview"
                                role="img"
                                aria-label={`Capsule suivante : ${next[0]} et ${next[1]}`}
                            >
                                {next.map((color, i) => (
                                    <img
                                        key={i}
                                        src={
                                            pieceArtwork[
                                                textureFor('segment', color, settings.colorBlind).art
                                            ]
                                        }
                                        alt=""
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="counter crystals">
                        <span>Cristaux</span>
                        <div>
                            × <strong data-testid="crystals">{state.obstaclesRemaining}</strong>
                        </div>
                    </div>
                </aside>
                {combo && (
                    <output className="combo" data-match={combo.cells.join(' ')} key={combo.chain}>
                        COMBO ×{combo.chain}
                        <br />+{combo.points}
                    </output>
                )}
            </div>
            <nav className="pad" aria-label="Commandes">
                {BUTTONS.map(([type, name, label]) => (
                    <ArtButton key={type} name={name} label={label} onClick={() => send(type)} />
                ))}
                <button aria-label="Poser" title="Poser" onClick={() => send('HARD_DROP')}>
                    ⤓
                </button>
            </nav>
            {paused && (
                <dialog
                    ref={dialog}
                    className="overlay"
                    aria-label="Pause"
                    onCancel={(event) => {
                        event.preventDefault();
                    }}
                >
                    <h2>
                        <Art name="pause-bannieres-jeu" alt="Pause" />
                    </h2>
                    <nav className="pause-controls menu">
                        <ArtButton
                            name="lecture-commandes-origine"
                            label="Reprendre"
                            onClick={() => send('PAUSE')}
                        />
                        <ArtButton
                            name="recommencer-commandes-apercu"
                            label="Recommencer"
                            onClick={onRestart}
                        />
                        <ArtButton
                            name="accueil-commandes-apercu"
                            label="Accueil"
                            onClick={() => onMenu(state, sessionRef.current?.stats)}
                        />
                        <ArtButton
                            name="quitter-commandes-apercu"
                            label="Quitter"
                            onClick={() => onMenu(state, sessionRef.current?.stats)}
                        />
                    </nav>
                </dialog>
            )}
        </section>
    );
}
