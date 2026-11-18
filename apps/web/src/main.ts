// Écran titre provisoire : le jeu jouable arrive avec le rendu et l'interface.
import { createGame } from '@capsule-panic/engine';
import './style.css';

const app = document.getElementById('app');
if (app) {
    const demo = createGame({ seed: 'titre', level: 0, speed: 'low' });
    const titre = document.createElement('h1');
    titre.textContent = 'Capsule Panic';
    const sousTitre = document.createElement('p');
    sousTitre.textContent = `Bientôt jouable : ${String(demo.obstaclesRemaining)} cristaux instables attendent dans le réacteur.`;
    app.append(titre, sousTitre);
}
