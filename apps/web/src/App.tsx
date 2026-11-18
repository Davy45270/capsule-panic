import { useCallback, useEffect, useState } from 'react';
import type { GameState, Speed } from '@capsule-panic/contracts';
import { createGame } from '@capsule-panic/engine';
import { About } from './screens/About';
import { End } from './screens/End';
import { Game } from './screens/Game';
import { Help } from './screens/Help';
import { Home } from './screens/Home';
import { Options } from './screens/Options';
import { Setup } from './screens/Setup';
import type { LevelStats } from './session';
import { defaultSettings, newSeed } from './settings';
import type { Settings } from './settings';
import { clearGame, loadGame, loadSettings, saveGame, saveScore, saveSettings } from './storage';

type Screen = { name: 'home' | 'setup' | 'help' | 'options' | 'about' } | { name: 'game'; state: GameState } | { name: 'end'; state: GameState; stats: LevelStats };

export function App() {
    const [screen, setScreen] = useState<Screen>({ name: 'home' });
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [saved, setSaved] = useState<GameState | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [choice, setChoice] = useState<{ level: number; speed: Speed }>({ level: 0, speed: 'low' });

    useEffect(() => {
        void loadSettings().then(s => { if (s) setSettings(s); });
        loadGame().then(setSaved, (error: unknown) => {
            setMessage(`Sauvegarde illisible : une nouvelle partie va commencer. (${error instanceof Error ? error.message : String(error)})`);
            void clearGame();
        });
    }, []);

    const start = useCallback((level: number, speed: Speed) => {
        setChoice({ level, speed });
        const state = createGame({ seed: newSeed(location.search), level, speed });
        void saveGame(state);
        setScreen({ name: 'game', state });
    }, []);
    const changeSettings = (s: Settings): void => { setSettings(s); void saveSettings(s); };
    const end = (state: GameState, stats: LevelStats): void => {
        void clearGame();
        setSaved(null);
        void saveScore(state.level, state.speed, state.score);
        setScreen({ name: 'end', state, stats });
    };
    const backToMenu = (state: GameState): void => { void saveGame(state); setSaved(state); setScreen({ name: 'home' }); };
    // Une partie reprise l'est en pause, au début de la capsule sauvegardée.
    const resume = (): void => { if (saved) setScreen({ name: 'game', state: saved.phase === 'FALLING' ? { ...saved, phase: 'PAUSED' } : saved }); };

    return (
        <>
            {message && <p className="message" role="alert">{message} <button onClick={() => setMessage(null)}>OK</button></p>}
            {screen.name === 'home' && <Home canResume={saved !== null} onResume={resume} onPlay={() => setScreen({ name: 'setup' })} onHelp={() => setScreen({ name: 'help' })}
                onOptions={() => setScreen({ name: 'options' })} onAbout={() => setScreen({ name: 'about' })} />}
            {screen.name === 'setup' && <Setup initialLevel={choice.level} initialSpeed={choice.speed} onStart={start} onBack={() => setScreen({ name: 'home' })} />}
            {screen.name === 'help' && <Help onBack={() => setScreen({ name: 'home' })} />}
            {screen.name === 'options' && <Options settings={settings} onChange={changeSettings} onBack={() => setScreen({ name: 'home' })} />}
            {screen.name === 'about' && <About onBack={() => setScreen({ name: 'home' })} />}
            {screen.name === 'game' && <Game key={screen.state.seed + String(screen.state.level)} initial={screen.state} settings={settings} onEnd={end} onMenu={backToMenu} onSave={s => void saveGame(s)} />}
            {screen.name === 'end' && <End state={screen.state} stats={screen.stats} onMenu={() => setScreen({ name: 'home' })}
                onRetry={() => start(screen.state.level, screen.state.speed)} onNext={() => start(screen.state.level + 1, screen.state.speed)} />}
        </>
    );
}
