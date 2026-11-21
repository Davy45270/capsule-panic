import { Art } from '../Artwork';
import type { ArtworkName } from '../Artwork';

const cards: [ArtworkName, string][] = [
    ['tutoriel-deplacer', 'Déplace les cellules avec les flèches gauche et droite.'],
    ['tutoriel-pivoter', 'Pivote avec X ou la flèche haut, et dans l’autre sens avec Z.'],
    ['tutoriel-aligner', 'Aligne quatre éléments de même couleur en ligne ou en colonne.'],
    ['tutoriel-eliminer', 'Élimine tous les cristaux pour réussir le niveau.'],
];

export function Help({ onBack }: { onBack(): void }) {
    return (
        <section className="screen help board-screen">
            <h2>Comment jouer</h2>
            <ol className="tutorial">
                {cards.map(([name, text]) => (
                    <li key={name}>
                        <Art name={name} />
                        <span>{text}</span>
                    </li>
                ))}
            </ol>
            <h3>Clavier</h3>
            <ul className="keyboard-legend">
                <li>← → Déplacer</li>
                <li>↓ Chute rapide</li>
                <li>↑ Rotation</li>
            </ul>
            <p>↓ descend d’une case. Espace pose la capsule d’un coup. P ou Échap met en pause.</p>
            <h3>Gestes tactiles</h3>
            <div className="touch-legend">
                <Art name="gestes-gestes-jeu" />
                <ul>
                    <li>Glisse pour déplacer</li>
                    <li>Touche pour pivoter</li>
                    <li>Balaie vers le bas pour poser</li>
                </ul>
            </div>
            <nav className="menu">
                <button className="primary" onClick={onBack}>
                    Menu
                </button>
            </nav>
        </section>
    );
}
