import { useState } from 'react';
import licences from '../../../../packages/assets/licences.json';
import captions from '../../../../packages/assets/runtime/credits.json';
import sheet from '../../../../packages/assets/runtime/credits.webp';

export function About({ onBack }: { onBack(): void }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <section className="screen about board-screen">
            <h2>Crédits</h2>
            <p>Code sous licence MIT.</p>
            <p>
                Illustrations de {licences.titulaire}, sous licence {licences.licence}. Sprites découpés dans
                les trois planches originales du jeu ou redessinés pour le laboratoire énergétique.
            </p>
            <nav className="menu">
                <button
                    onClick={() => setExpanded(!expanded)}
                    aria-expanded={expanded}
                    aria-controls="catalogue"
                >
                    Provenance des illustrations
                </button>
                <button className="primary" onClick={onBack}>
                    Menu
                </button>
            </nav>
            <ul id="catalogue" className="catalogue" hidden={!expanded}>
                {expanded &&
                    licences.assets.map((id, index) => {
                        const [origin, board] = captions[index] ?? [];
                        return (
                            <li key={id}>
                                <span
                                    className="catalogue-sprite"
                                    data-art={id.slice(7)}
                                    aria-hidden="true"
                                    style={{
                                        backgroundImage: `url(${sheet})`,
                                        backgroundPosition: `-${(index % 12) * 28}px -${Math.floor(index / 12) * 28}px`,
                                    }}
                                />
                                <span>
                                    {id.slice(7).replaceAll('-', ' ')}
                                    <small>
                                        {origin} · {board}
                                    </small>
                                </span>
                            </li>
                        );
                    })}
            </ul>
        </section>
    );
}
