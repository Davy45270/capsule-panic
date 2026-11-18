import { capsuleSvg, crystalSvg } from '@capsule-panic/renderer';
import { Svg } from '../Svg';

export function Help({ onBack }: { onBack(): void }) {
    return (
        <section className="screen help">
            <h2>Comment jouer</h2>
            <ol className="steps">
                <li><Svg svg={capsuleSvg(['cyan', 'amber'], 28)} /><span>Déplace la capsule : ← → ou les boutons.</span></li>
                <li><Svg svg={capsuleSvg(['amber', 'magenta'], 28)} /><span>Pivote-la : X ou ↑ (Z dans l’autre sens), ou touche le réacteur.</span></li>
                <li><Svg svg={capsuleSvg(['cyan', 'cyan'], 28)} /><span>Aligne 4 cases de même couleur et de même forme, en ligne ou en colonne.</span></li>
                <li><Svg svg={crystalSvg('magenta', 28)} /><span>Dissous tous les cristaux instables pour réussir le niveau.</span></li>
            </ol>
            <p>↓ descend d’une case, Espace pose la capsule d’un coup, P ou Échap met en pause.</p>
            <nav className="menu"><button className="primary" onClick={onBack}>Menu</button></nav>
        </section>
    );
}
