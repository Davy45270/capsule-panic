import type { GameState } from '@capsule-panic/contracts';
import { Art, ArtButton, Character } from '../Artwork';
import type { LevelStats } from '../session';

export function End({
    state,
    stats,
    onNext,
    onRetry,
    onMenu,
}: {
    state: GameState;
    stats: LevelStats;
    onNext(): void;
    onRetry(): void;
    onMenu(): void;
}) {
    const won = state.phase === 'WON';
    const final = won && state.level === 20;
    return (
        <section className="screen end board-screen" aria-live="polite">
            <h2 className="end-title">
                {won && !final ? (
                    <>
                        <Art name="ruban-reussite" />
                        <span>Niveau réussi !</span>
                    </>
                ) : (
                    <>
                        <Art name={final ? 'victoire-bannieres-jeu' : 'defaite-bannieres-jeu'} />
                        <span className="visually-hidden">{final ? 'Victoire !' : 'Défaite !'}</span>
                    </>
                )}
            </h2>
            <ul className={won ? 'stats checks' : 'stats'}>
                <li>
                    {won
                        ? 'Tous les cristaux éliminés'
                        : `${stats.crystalsAtStart - state.obstaclesRemaining} cristaux éliminés sur ${stats.crystalsAtStart}`}
                </li>
                <li>
                    <span>
                        Score <strong data-testid="final-score">{state.score.toLocaleString('fr-FR')}</strong>
                    </span>
                </li>
                <li>Combo max ×{stats.bestChain}</li>
                {!won && <li>Capsules jouées {stats.capsules}</li>}
            </ul>
            <nav className="menu">
                {won && !final && (
                    <ArtButton name="suivant-reussite" label="Niveau suivant" onClick={onNext} />
                )}
                <ArtButton name="rejouer-reussite" label="Rejouer" onClick={onRetry} />
                <ArtButton name="menu-reussite" label="Menu" onClick={onMenu} />
            </nav>
            {won && (
                <div className="end-characters">
                    <Character name="chercheuse-origine" />
                    <Character name="responsable-origine" />
                </div>
            )}
        </section>
    );
}
