import traineeDeplacementApercu from '../../assets/sprites/sprite-trainee-deplacement-apercu.png';
import traineeChuteJeu from '../../assets/sprites/sprite-trainee-chute-jeu.png';
import flecheRotationJeu from '../../assets/sprites/sprite-fleche-rotation-jeu.png';
import traineeVerrouillageJeu from '../../assets/sprites/sprite-trainee-verrouillage-jeu.png';
import caseSombreJeu from '../../assets/sprites/sprite-case-sombre-jeu.png';
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
import segmentCyan from '../../assets/sprites/sprite-segment-bleu-plateau-apercu.png';
import cristalAmbre from '../../assets/sprites/sprite-cristal-ambre.png';
import celluleAmbre from '../../assets/sprites/sprite-cellule-ambre.png';
import segmentAmbre from '../../assets/sprites/sprite-segment-jaune-plateau-apercu.png';
import cristalMagenta from '../../assets/sprites/sprite-cristal-magenta.png';
import celluleMagenta from '../../assets/sprites/sprite-cellule-magenta.png';
import segmentMagenta from '../../assets/sprites/sprite-segment-rouge-plateau-apercu.png';

export const pieceArtwork = {
    'trainee-deplacement-apercu': traineeDeplacementApercu,
    'trainee-chute-jeu': traineeChuteJeu,
    'fleche-rotation-jeu': flecheRotationJeu,
    'trainee-verrouillage-jeu': traineeVerrouillageJeu,
    'case-sombre-jeu': caseSombreJeu,
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
    'segment-cyan': segmentCyan,
    'cristal-ambre': cristalAmbre,
    'cellule-ambre': celluleAmbre,
    'segment-ambre': segmentAmbre,
    'cristal-magenta': cristalMagenta,
    'cellule-magenta': celluleMagenta,
    'segment-magenta': segmentMagenta,
};
export type Artwork = keyof typeof pieceArtwork;

const colors = { cyan: 'cyan', amber: 'ambre', magenta: 'magenta' } as const;
const forms = { cyan: 'hexagone', amber: 'triangle', magenta: 'losange' } as const;

/**
 * Le nom du motif et la texture sont choisis ensemble, pour le rendu et son miroir accessible.
 * [E422] Par défaut, un segment est le segment uni carré de la planche Gameplay 03 recoloré au jeton de sa
 * couleur ; le mode daltonien garde les cellules à motif (hexagone, triangle, losange).
 */
export function textureFor(kind: 'obstacle' | 'segment', color: Color, colorBlind: boolean) {
    const shade = colors[color];
    if (kind === 'obstacle') return { art: `cristal-${shade}` as const, form: forms[color] };
    if (colorBlind) return { art: `cellule-${shade}` as const, form: forms[color] };
    return { art: `segment-${shade}` as const, form: 'aucune' };
}
