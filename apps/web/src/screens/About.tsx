export function About({ onBack }: { onBack(): void }) {
    return (
        <section className="screen about">
            <h2>À propos</h2>
            <p>Capsule Panic, un puzzle de chute hors ligne. Aucune donnée ne quitte cet appareil.</p>
            <p>Code sous licence MIT. Art original (cristaux, cellules d’énergie, réacteur), dessiné pour ce jeu, sous licence CC BY 4.0.</p>
            <nav className="menu"><button className="primary" onClick={onBack}>Menu</button></nav>
        </section>
    );
}
