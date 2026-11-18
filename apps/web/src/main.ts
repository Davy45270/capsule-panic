// Écran titre provisoire : le jeu jouable arrive avec le rendu et l'interface.
import './style.css';

const app = document.getElementById('app');
if (app) {
    const titre = document.createElement('h1');
    titre.textContent = 'Capsule Panic';
    const sousTitre = document.createElement('p');
    sousTitre.textContent = 'Bientôt jouable : des cristaux instables attendent dans le réacteur.';
    app.append(titre, sousTitre);
}
