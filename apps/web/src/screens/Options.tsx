import type { Settings } from '../settings';

export function Options({ settings, onChange, onBack }: { settings: Settings; onChange(s: Settings): void; onBack(): void }) {
    const toggle = (key: keyof Settings, label: string) => (
        <label className="choice"><input type="checkbox" checked={settings[key]} onChange={e => onChange({ ...settings, [key]: e.target.checked })} />{label}</label>
    );
    return (
        <section className="screen options">
            <h2>Options</h2>
            <div className="field">
                {toggle('highContrast', 'Contraste renforcé')}
                {toggle('gestures', 'Gestes tactiles sur le réacteur')}
                {toggle('reducedMotion', 'Animations réduites')}
            </div>
            <p className="note">Le jeu n’a ni musique ni son.</p>
            <nav className="menu"><button className="primary" onClick={onBack}>Menu</button></nav>
        </section>
    );
}
