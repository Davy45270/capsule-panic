import { useState } from 'react';
import type { Speed } from '@capsule-panic/contracts';

const SPEEDS: [Speed, string][] = [['low', 'Lente'], ['medium', 'Moyenne'], ['high', 'Rapide']];

export function Setup({ initialLevel, initialSpeed, onStart, onBack }: { initialLevel: number; initialSpeed: Speed; onStart(level: number, speed: Speed): void; onBack(): void }) {
    const [level, setLevel] = useState(initialLevel);
    const [speed, setSpeed] = useState<Speed>(initialSpeed);
    return (
        <section className="screen setup">
            <h2>Nouvelle partie</h2>
            <label className="field">Niveau <output>{level}</output>
                <input type="range" min={0} max={20} value={level} onChange={e => setLevel(Number(e.target.value))} aria-label="Niveau" />
            </label>
            <fieldset className="field">
                <legend>Vitesse</legend>
                {SPEEDS.map(([value, label]) => (
                    <label key={value} className="choice"><input type="radio" name="speed" checked={speed === value} onChange={() => setSpeed(value)} />{label}</label>
                ))}
            </fieldset>
            <nav className="menu">
                <button className="primary" onClick={() => onStart(level, speed)}>Commencer</button>
                <button onClick={onBack}>Menu</button>
            </nav>
        </section>
    );
}
