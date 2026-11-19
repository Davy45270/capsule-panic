import reacteurChambreOrigine from '../../assets/runtime/sprite-reacteur-chambre-origine.webp';
import pontGauche from '../../assets/sprites/sprite-pont-gauche.png';
import pontHaut from '../../assets/sprites/sprite-pont-haut.png';
import cristalBriseMagenta from '../../assets/sprites/sprite-cristal-brise-magenta.png';
import cristalBriseAmbre from '../../assets/sprites/sprite-cristal-brise-ambre.png';
import cristalBriseCyan from '../../assets/sprites/sprite-cristal-brise-cyan.png';
import type { Color } from '@capsule-panic/contracts';
import celluleFantome from '../../assets/sprites/sprite-cellule-fantome.png';
import pontDroite from '../../assets/sprites/sprite-pont-droite.png';
import pontBas from '../../assets/sprites/sprite-pont-bas.png';
import explosionEffetsJeu from '../../assets/runtime/sprite-explosion-effets-jeu.webp';
import fumeeEffetsJeu from '../../assets/runtime/sprite-fumee-effets-jeu.webp';
import etincellesApercu from '../../assets/runtime/sprite-etincelles-apercu.webp';
import particulesEffetsJeu from '../../assets/runtime/sprite-particules-effets-jeu.webp';
import cristalCyan from '../../assets/sprites/sprite-cristal-cyan.png';
import celluleCyan from '../../assets/sprites/sprite-cellule-cyan.png';
import celluleCyanUnie from '../../assets/source/svg/cellule-cyan-unie.svg';
import cristalAmbre from '../../assets/sprites/sprite-cristal-ambre.png';
import celluleAmbre from '../../assets/sprites/sprite-cellule-ambre.png';
import celluleAmbreUnie from '../../assets/source/svg/cellule-ambre-unie.svg';
import cristalMagenta from '../../assets/sprites/sprite-cristal-magenta.png';
import celluleMagenta from '../../assets/sprites/sprite-cellule-magenta.png';
import celluleMagentaUnie from '../../assets/source/svg/cellule-magenta-unie.svg';

export const pieceArtwork = {
    'reacteur-chambre-origine': reacteurChambreOrigine,
    'pont-gauche': pontGauche,
    'pont-haut': pontHaut,
    'cristal-brise-magenta': cristalBriseMagenta,
    'cristal-brise-ambre': cristalBriseAmbre,
    'cristal-brise-cyan': cristalBriseCyan,
    'cellule-fantome': celluleFantome,
    'pont-droite': pontDroite,
    'pont-bas': pontBas,
    'explosion-effets-jeu': explosionEffetsJeu,
    'fumee-effets-jeu': fumeeEffetsJeu,
    'etincelles-apercu': etincellesApercu,
    'particules-effets-jeu': particulesEffetsJeu,
    'cristal-cyan': cristalCyan,
    'cellule-cyan': celluleCyan,
    'cellule-cyan-unie': celluleCyanUnie,
    'cristal-ambre': cristalAmbre,
    'cellule-ambre': celluleAmbre,
    'cellule-ambre-unie': celluleAmbreUnie,
    'cristal-magenta': cristalMagenta,
    'cellule-magenta': celluleMagenta,
    'cellule-magenta-unie': celluleMagentaUnie,
};
export type Artwork = keyof typeof pieceArtwork;

const colors = { cyan: 'cyan', amber: 'ambre', magenta: 'magenta' } as const;
const forms = { cyan: 'hexagone', amber: 'triangle', magenta: 'losange' } as const;

/** Le nom du motif et la texture sont choisis ensemble, pour le rendu et son miroir accessible. */
export function textureFor(kind: 'obstacle' | 'segment', color: Color, colorBlind: boolean) {
    const shade = colors[color];
    if (kind === 'obstacle') return { art: `cristal-${shade}` as const, form: forms[color] };
    if (colorBlind) return { art: `cellule-${shade}` as const, form: forms[color] };
    return { art: `cellule-${shade}-unie` as const, form: forms[color] };
}
