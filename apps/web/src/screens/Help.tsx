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
                        <Art name={name} alt={text} />
                    </li>
                ))}
            </ol>
            <h3>Clavier</h3>
            <div className="key-art">
                <Art name="touches-horizontales-gestes-jeu" />
                <Art name="touches-action-gestes-jeu" />
            </div>
            <Art name="legende-clavier-gestes-jeu" />
            <p>↓ descend d’une case. Espace pose la capsule d’un coup. P ou Échap met en pause.</p>
            <h3>Gestes tactiles</h3>
            <Art
                name="gestes-gestes-jeu"
                alt="Glisse pour déplacer, touche pour pivoter, balaie vers le bas pour poser."
            />
            <nav className="menu">
                <button className="primary" onClick={onBack}>
                    Menu
                </button>
            </nav>
        </section>
    );
}
