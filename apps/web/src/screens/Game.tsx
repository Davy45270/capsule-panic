import { useEffect, useRef, useState } from 'react';
import type { GameState } from '@capsule-panic/contracts';
import { gestureCommands, mapKey } from '@capsule-panic/input';
import type { CommandType } from '@capsule-panic/input';
import { boardLayout, capsuleSvg, createBoardView } from '@capsule-panic/renderer';
import type { BoardView } from '@capsule-panic/renderer';
import { createLoop } from '../loop';
import { GameSession } from '../session';
import type { LevelStats } from '../session';
import type { Settings } from '../settings';
import { Svg } from '../Svg';

const BUTTONS: [CommandType, string, string][] = [
    ['MOVE_LEFT', '←', 'Gauche'], ['ROTATE_CW', '↻', 'Pivoter'], ['SOFT_DROP', '↓', 'Descendre'], ['HARD_DROP', '⤓', 'Poser'], ['MOVE_RIGHT', '→', 'Droite']
];

export function Game({ initial, settings, onEnd, onMenu, onSave }: { initial: GameState; settings: Settings; onEnd(state: GameState, stats: LevelStats): void; onMenu(state: GameState): void; onSave(state: GameState): void }) {
    const host = useRef<HTMLDivElement>(null);
    const sessionRef = useRef<GameSession | null>(null);
    const [state, setState] = useState(initial);
    const [ready, setReady] = useState(false);
    const callbacks = useRef({ onEnd, onSave, settings });
    callbacks.current = { onEnd, onSave, settings };

    useEffect(() => {
        let view: BoardView | null = null;
        let cancelled = false;
        const loop = createLoop({ speed: initial.speed, onTick: () => sessionRef.current?.tick() });
        const element = host.current;
        if (!element) return undefined;
        void createBoardView(element, callbacks.current.settings).then(v => {
            if (cancelled) { v.destroy(); return; }
            view = v;
            const session = new GameSession(initial, {
                render: (s, ghost) => v.render(s, ghost),
                play: events => v.play(events),
                onChange: s => setState(s),
                onSpawn: s => callbacks.current.onSave(s),
                onEnd: s => { loop.stop(); setTimeout(() => callbacks.current.onEnd(s, session.stats), callbacks.current.settings.reducedMotion ? 0 : 400); }
            });
            sessionRef.current = session;
            loop.start();
            setReady(true);
        });
        const onVisibility = (): void => {
            sessionRef.current?.visibilityChanged(document.hidden);
            if (document.hidden && sessionRef.current) callbacks.current.onSave(sessionRef.current.state);
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => { cancelled = true; loop.stop(); document.removeEventListener('visibilitychange', onVisibility); view?.destroy(); sessionRef.current = null; };
    }, [initial]);

    const send = (type: CommandType): void => {
        const session = sessionRef.current;
        if (!session) return;
        session.command(type);
        if (session.state.phase === 'PAUSED') callbacks.current.onSave(session.state);
    };

    useEffect(() => {
        const onKey = (e: KeyboardEvent): void => {
            const type = mapKey(e.key);
            if (!type) return;
            e.preventDefault();
            send(type);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const touch = useRef<{ x: number; y: number; t: number } | null>(null);
    const onPointerDown = (e: React.PointerEvent): void => { if (settings.gestures && e.pointerType !== 'mouse') touch.current = { x: e.clientX, y: e.clientY, t: e.timeStamp }; };
    const onPointerUp = (e: React.PointerEvent): void => {
        const start = touch.current;
        touch.current = null;
        if (!start || !host.current) return;
        const cell = boardLayout(host.current.clientWidth, host.current.clientHeight).cell;
        for (const type of gestureCommands({ dx: e.clientX - start.x, dy: e.clientY - start.y, ms: e.timeStamp - start.t, cell })) send(type);
    };

    const paused = state.phase === 'PAUSED';
    const next = state.nextQueue[0];
    return (
        <section className={`screen game${settings.highContrast ? ' contrast' : ''}`}>
            <header className="hud">
                <div className="counter"><span>Score</span><strong data-testid="score">{state.score}</strong></div>
                <div className="counter"><span>Niveau</span><strong data-testid="level">{state.level}</strong></div>
                <div className="counter"><span>Cristaux</span><strong data-testid="crystals">{state.obstaclesRemaining}</strong></div>
                <div className="counter next"><span>Suivant</span>{next && <Svg svg={capsuleSvg(next, 22)} label={`Capsule suivante : ${next[0]} et ${next[1]}`} />}</div>
                <button className="icon" aria-label={paused ? 'Reprendre' : 'Pause'} onClick={() => send('PAUSE')}>{paused ? '▶' : '⏸'}</button>
            </header>
            <div className="reactor" ref={host} data-ready={ready ? 'oui' : 'non'} role="img" aria-label="Chambre du réacteur"
                onPointerDown={onPointerDown} onPointerUp={onPointerUp} />
            <nav className="pad" aria-label="Commandes">
                {BUTTONS.map(([type, symbol, label]) => <button key={type} aria-label={label} onClick={() => send(type)}>{symbol}</button>)}
            </nav>
            {paused && (
                <div className="overlay" role="dialog" aria-label="Pause">
                    <h2 className="banner">Pause</h2>
                    <nav className="menu">
                        <button className="primary" onClick={() => send('PAUSE')}>Reprendre</button>
                        <button onClick={() => onMenu(state)}>Menu</button>
                    </nav>
                </div>
            )}
        </section>
    );
}
