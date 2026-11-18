import type { GameState } from '@capsule-panic/contracts';
import type { LevelStats } from '../session';
import { starsFor } from '../settings';

export function End({ state, stats, onNext, onRetry, onMenu }: { state: GameState; stats: LevelStats; onNext(): void; onRetry(): void; onMenu(): void }) {
    const won = state.phase === 'WON';
    const stars = starsFor(won, stats);
    return (
        <section className="screen end" aria-live="polite">
            <h2 className={won ? 'banner win' : 'banner lose'}>{won ? 'Niveau réussi !' : 'Défaite !'}</h2>
            {won && <p className="stars" aria-label={`${String(stars)} étoile${stars > 1 ? 's' : ''} sur 3`}>{'★'.repeat(stars)}<span className="off">{'★'.repeat(3 - stars)}</span></p>}
            <ul className="stats">
                <li>Score : <strong data-testid="final-score">{state.score}</strong></li>
                <li>Cristaux dissous : {stats.crystalsAtStart - state.obstaclesRemaining} sur {stats.crystalsAtStart}</li>
                <li>Capsules jouées : {stats.capsules}</li>
                <li>Meilleure réaction en chaîne : ×{Math.max(1, stats.bestChain)}</li>
            </ul>
            <nav className="menu">
                {won && state.level < 20 && <button className="primary" onClick={onNext}>Niveau suivant</button>}
                <button className={won && state.level < 20 ? '' : 'primary'} onClick={onRetry}>Rejouer</button>
                <button onClick={onMenu}>Menu</button>
            </nav>
        </section>
    );
}
