import { Art, ArtButton, Character } from '../Artwork';

export function Home({
    onPlay,
    onHelp,
    onOptions,
    onAbout,
    canResume,
    onResume,
}: {
    onPlay(): void;
    onHelp(): void;
    onOptions(): void;
    onAbout(): void;
    canResume: boolean;
    onResume(): void;
}) {
    return (
        <section className="screen home board-screen">
            <h1>
                <Art name="logo-jeu" alt="Capsule Panic" />
            </h1>
            <Art className="home-props" name="fioles-sous-logo" />
            <Character className="home-character" name="chercheuse-origine" />
            <nav className="menu home-menu" aria-label="Accueil">
                {canResume && (
                    <button className="primary" onClick={onResume}>
                        Reprendre la partie
                    </button>
                )}
                <ArtButton name="jouer-accueil" label="Jouer" onClick={onPlay} />
                <ArtButton name="options-accueil" label="Options" onClick={onOptions} />
                <ArtButton name="credits-accueil" label="Crédits" onClick={onAbout} />
                <ArtButton name="aide-accueil" label="Aide" onClick={onHelp} />
            </nav>
        </section>
    );
}
