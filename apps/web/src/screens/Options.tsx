import { Art } from '../Artwork';
import type { Settings } from '../settings';
import { SPEEDS } from './Setup';

type Toggle = 'highContrast' | 'colorBlind' | 'gestures' | 'reducedMotion' | 'debug';

export function Options({
    settings,
    onChange,
    onBack,
    onImport,
    onExport,
    canExport,
    onFullscreen,
}: {
    settings: Settings;
    onChange(s: Settings): void;
    onBack(): void;
    onImport(): void;
    onExport(): void;
    canExport: boolean;
    onFullscreen(): void;
}) {
    const toggle = (key: Toggle, label: string) => (
        <label className="choice">
            <input
                type="checkbox"
                checked={settings[key]}
                onChange={(e) => onChange({ ...settings, [key]: e.target.checked })}
            />
            {label}
        </label>
    );
    return (
        <section className="screen options board-screen">
            <h2>Options</h2>
            <div className="field options-panel">
                <label className="choice">
                    Vitesse
                    <select
                        value={settings.speed}
                        onChange={(e) => {
                            const speed = SPEEDS.find(([value]) => value === e.target.value)?.[0];
                            if (speed) onChange({ ...settings, speed });
                        }}
                    >
                        {SPEEDS.map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="choice">
                    Niveau <output>{settings.level}</output>
                    <input
                        type="range"
                        min={0}
                        max={20}
                        value={settings.level}
                        onChange={(e) => onChange({ ...settings, level: Number(e.target.value) })}
                    />
                </label>
                <button
                    className="with-icon"
                    onClick={() => onChange({ ...settings, level: (settings.level + 1) % 21 })}
                >
                    <Art name="niveau-plus-commandes-apercu" />
                    Niveau +
                </button>
            </div>
            <div className="field options-panel">
                {toggle('highContrast', 'Contraste renforcé')}
                {toggle('colorBlind', 'Mode daltonien (formes additionnelles)')}
                {toggle('gestures', 'Gestes tactiles sur le réacteur')}
                {toggle('reducedMotion', 'Animations réduites')}
                {toggle('debug', 'Journal de débogage local')}
            </div>
            <nav className="menu">
                <button className="with-icon" onClick={onFullscreen}>
                    <Art name="plein-ecran-commandes-apercu" />
                    Plein écran
                </button>
                <button onClick={onExport} disabled={!canExport}>
                    Exporter la partie JSON
                </button>
                <button onClick={onImport}>Importer une partie JSON</button>
                <button className="primary" onClick={onBack}>
                    Menu
                </button>
            </nav>
        </section>
    );
}
