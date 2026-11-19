import { useEffect, useRef, useState } from 'react';
import type { GameState, Speed } from '@capsule-panic/contracts';
import { createGame, restore, serialize } from '@capsule-panic/engine';
import { debug, recordCrash } from './diagnostics';
import { About } from './screens/About';
import { End } from './screens/End';
import { Game } from './screens/Game';
import { Help } from './screens/Help';
import { Home } from './screens/Home';
import { Options } from './screens/Options';
import { Setup } from './screens/Setup';
import { initialLevelStats } from './session';
import type { LevelStats } from './session';
import type { Checkpoint } from './storage';
import { defaultSettings, newSeed } from './settings';
import type { Settings } from './settings';
import { clearGame, loadCheckpoint, loadSettings, saveGame, saveScore, saveSettings } from './storage';

const COLOR_BLIND_KEY = 'capsule-panic-daltonien';

type Menu = 'home' | 'setup' | 'help' | 'options' | 'about';
type Screen =
    | { name: Menu }
    | { name: 'game'; state: GameState; instance: number; stats?: LevelStats }
    | { name: 'end'; state: GameState; stats: LevelStats };

function fromAddress(): Screen {
    switch (location.hash) {
        case '#game':
            return { name: 'setup' };
        case '#settings':
            return { name: 'options' };
        case '#aide':
            return { name: 'help' };
        case '#credits':
            return { name: 'about' };
        default:
            return { name: 'home' };
    }
}

function address(hash: string): void {
    if (location.hash !== hash) history.pushState(null, '', `${location.pathname}${location.search}${hash}`);
}

export function App() {
    const [screen, setScreen] = useState<Screen>(fromAddress);
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [loaded, setLoaded] = useState(false);
    const [saved, setSaved] = useState<Checkpoint | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const file = useRef<HTMLInputElement>(null);
    const instance = useRef(0);

    const show = (name: Menu, hash: string): void => {
        address(hash);
        setScreen({ name });
    };
    const home = (): void => show('home', '');
    const storageError = (): void => setMessage('Le stockage local est indisponible.');
    const remember = (state: GameState, stats?: LevelStats): Promise<void> => {
        const snapshot = stats && { ...stats };
        setSaved({ state, stats: snapshot });
        return saveGame(state, undefined, snapshot).then(() => undefined, storageError);
    };

    useEffect(() => {
        let active = true;
        void Promise.allSettled([loadSettings(), loadCheckpoint()]).then(([preferences, game]) => {
            if (!active) return;
            const restored = {
                ...defaultSettings(),
                ...(preferences.status === 'fulfilled' ? preferences.value : null),
            };
            if (preferences.status === 'rejected') storageError();
            try {
                const colorBlind = localStorage.getItem(COLOR_BLIND_KEY);
                if (colorBlind === 'oui' || colorBlind === 'non') restored.colorBlind = colorBlind === 'oui';
            } catch {
                storageError();
            }
            setSettings(restored);
            if (game.status === 'fulfilled') {
                setSaved(game.value);
            } else {
                setMessage(game.reason instanceof Error ? game.reason.message : 'Sauvegarde illisible.');
                void clearGame().catch(storageError);
            }
            setLoaded(true);
        });
        const navigate = () => setScreen(fromAddress());
        window.addEventListener('popstate', navigate);
        window.addEventListener('hashchange', navigate);
        window.addEventListener('error', recordCrash);
        window.addEventListener('unhandledrejection', recordCrash);
        return () => {
            active = false;
            window.removeEventListener('popstate', navigate);
            window.removeEventListener('hashchange', navigate);
            window.removeEventListener('error', recordCrash);
            window.removeEventListener('unhandledrejection', recordCrash);
        };
    }, []);

    const openGame = (state: GameState, stats?: LevelStats): void => {
        address('#game');
        debug(settings.debug, 'partie ouverte');
        setScreen({ name: 'game', state, instance: ++instance.current, stats });
    };
    const start = (level: number, speed: Speed, seed = newSeed(location.search)): void => {
        const state = createGame({ seed, level, speed });
        void remember(state);
        openGame(state);
    };
    const changeSettings = (s: Settings): void => {
        if (s.colorBlind !== settings.colorBlind) {
            try {
                // Le document peut être rechargé avant la fin de l'écriture IndexedDB.
                localStorage.setItem(COLOR_BLIND_KEY, s.colorBlind ? 'oui' : 'non');
            } catch {
                storageError();
            }
        }
        setSettings(s);
        void saveSettings(s).catch(storageError);
    };
    const end = (state: GameState, stats: LevelStats): void => {
        debug(settings.debug, 'partie terminée');
        void clearGame().catch(storageError);
        setSaved(null);
        void saveScore(state.level, state.speed, state.score).catch(storageError);
        setScreen({ name: 'end', state, stats });
    };
    const resume = (): void => {
        if (!saved) return;
        const { state, stats } = saved;
        if (state.phase === 'LOST' || state.phase === 'WON') {
            setScreen({
                name: 'end',
                state,
                stats: stats ?? initialLevelStats(state),
            });
        } else {
            openGame(
                state.phase === 'FALLING' || state.phase === 'READY' ? { ...state, phase: 'PAUSED' } : state,
                stats,
            );
        }
    };
    const importGame = async (source: File): Promise<void> => {
        try {
            const state = restore(await source.text());
            await saveGame(state);
            setSaved({ state });
            setMessage('Partie importée. Elle est disponible depuis le menu.');
        } catch (error: unknown) {
            setMessage(error instanceof Error ? error.message : 'Impossible de lire la partie.');
        }
    };
    const exportGame = (): void => {
        if (!saved) return;
        const url = URL.createObjectURL(new Blob([serialize(saved.state)], { type: 'application/json' }));
        const download = document.createElement('a');
        download.href = url;
        download.download = 'capsule-panic.json';
        document.body.append(download);
        download.click();
        download.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    const fullscreen = async (): Promise<void> => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
        } catch {
            setMessage('Le plein écran est indisponible sur cet appareil.');
        }
    };

    if (!loaded)
        return (
            <p className="message" role="status">
                Chargement…
            </p>
        );

    return (
        <>
            {message && (
                <p className="message" role="alert">
                    {message} <button onClick={() => setMessage(null)}>OK</button>
                </p>
            )}
            {screen.name === 'home' && (
                <Home
                    canResume={saved !== null}
                    onResume={resume}
                    onPlay={() => show('setup', '#game')}
                    onHelp={() => show('help', '#aide')}
                    onOptions={() => show('options', '#settings')}
                    onAbout={() => show('about', '#credits')}
                />
            )}
            {screen.name === 'setup' && (
                <Setup
                    initialLevel={settings.level}
                    initialSpeed={settings.speed}
                    onStart={start}
                    onBack={home}
                    onResume={saved ? resume : undefined}
                />
            )}
            {screen.name === 'help' && <Help onBack={home} />}
            {screen.name === 'options' && (
                <>
                    <input
                        ref={file}
                        type="file"
                        accept="application/json,.json"
                        hidden
                        onChange={(event) => {
                            const source = event.target.files?.[0];
                            event.target.value = '';
                            if (source) void importGame(source);
                        }}
                    />
                    <Options
                        settings={settings}
                        onChange={changeSettings}
                        onBack={home}
                        onImport={() => file.current?.click()}
                        onExport={exportGame}
                        canExport={saved !== null}
                        onFullscreen={() => void fullscreen()}
                    />
                </>
            )}
            {screen.name === 'about' && <About onBack={home} />}
            {screen.name === 'game' && (
                <Game
                    key={screen.instance}
                    initial={screen.state}
                    initialStats={screen.stats}
                    settings={settings}
                    onEnd={end}
                    onMenu={(state, stats) => {
                        void remember(state, stats);
                        home();
                    }}
                    onSave={remember}
                    onRestart={() => start(screen.state.level, screen.state.speed, screen.state.seed)}
                    onError={() => {
                        recordCrash();
                        debug(settings.debug, 'rendu indisponible');
                        setMessage('Impossible d’afficher le réacteur.');
                        home();
                    }}
                />
            )}
            {screen.name === 'end' && (
                <End
                    state={screen.state}
                    stats={screen.stats}
                    onMenu={home}
                    onRetry={() => start(screen.state.level, screen.state.speed, screen.state.seed)}
                    onNext={() => start(screen.state.level + 1, screen.state.speed, screen.state.seed)}
                />
            )}
        </>
    );
}
