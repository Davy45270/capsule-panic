import { capsuleSvg, crystalSvg } from '@capsule-panic/renderer';
import { Svg } from '../Svg';

export function Home({ onPlay, onHelp, onOptions, onAbout, canResume, onResume }: { onPlay(): void; onHelp(): void; onOptions(): void; onAbout(): void; canResume: boolean; onResume(): void }) {
    return (
        <section className="screen home">
            <h1>Capsule Panic</h1>
            <div className="logo-art" aria-hidden="true">
                <Svg svg={crystalSvg('cyan', 56)} /><Svg svg={capsuleSvg(['amber', 'magenta'], 40)} /><Svg svg={crystalSvg('magenta', 56)} />
            </div>
            <nav className="menu">
                {canResume && <button className="primary" onClick={onResume}>Reprendre la partie</button>}
                <button className={canResume ? '' : 'primary'} onClick={onPlay}>Jouer</button>
                <button onClick={onHelp}>Aide</button>
                <button onClick={onOptions}>Options</button>
                <button onClick={onAbout}>À propos</button>
            </nav>
        </section>
    );
}
