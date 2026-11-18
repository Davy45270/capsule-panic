// Icônes PWA : un cristal hexagonal cyan et une cellule d'énergie ambre sur fond de réacteur. À lancer à la main
// (outil de création, pas de la CI) : node scripts/make-icons.js   (nécessite rsvg-convert)
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const motif = '<polygon points="50,14 79,31 79,65 50,82 21,65 21,31" fill="#38bdf8" stroke="#f9fafb" stroke-width="3"/>'
    + '<polygon points="50,30 65,39 65,57 50,66 35,57 35,39" fill="#111827" opacity="0.35"/>'
    + '<path d="M58 58 h24 l6 6 v18 l-6 6 h-24 l-6 -6 v-18 z" fill="#fbbf24" stroke="#f9fafb" stroke-width="3"/>';
// `marge` : part du côté laissée vide (la version « maskable » garde le motif dans la zone sûre de 80 %).
const icone = (marge) => {
    const echelle = 1 - 2 * marge;
    const decalage = (100 - 100 * echelle) / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#111827"/>`
        + `<g transform="translate(${decalage} ${decalage}) scale(${echelle})">${motif}</g></svg>`;
};
mkdirSync('apps/web/public/icons', { recursive: true });
for (const [nom, taille, marge] of [['192', 192, 0.04], ['512', 512, 0.04], ['maskable-512', 512, 0.12]]) {
    execFileSync('rsvg-convert', ['-w', String(taille), '-h', String(taille), '-o', `apps/web/public/icons/capsule-panic-${nom}.png`], { input: icone(marge) });
}
