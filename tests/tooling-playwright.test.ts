// Matrice Playwright exigée par la spec (acceptance/TESTS.md, § Qualité) :
// « Playwright Chromium/Firefox/WebKit desktop et viewport mobile ».
// Le test lit la configuration réelle (import du module, pas une recherche de texte) : un projet retiré,
// renommé en changeant de moteur ou redimensionné le fait échouer.
import { expect, it } from 'vitest';
import config from '../playwright.config';

interface Use {
    browserName?: string;
    viewport?: { width: number; height: number } | null;
    hasTouch?: boolean;
}
const projects = (config.projects ?? []).map((project) => ({
    name: project.name ?? '',
    use: (project.use ?? {}) as Use,
}));

const BUREAU = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const PETIT_MOBILE = { width: 360, height: 740 };

const surMoteur = (moteur: string) => projects.filter(({ use }) => use.browserName === moteur);
const aLaTaille = (moteur: string, taille: { width: number; height: number }, tactile: boolean) =>
    surMoteur(moteur).filter(
        ({ use }) =>
            use.viewport?.width === taille.width &&
            use.viewport.height === taille.height &&
            Boolean(use.hasTouch) === tactile,
    );

const bureauEtMobile = (moteur: string) => {
    expect(aLaTaille(moteur, BUREAU, false), `${moteur} bureau`).toHaveLength(1);
    expect(aLaTaille(moteur, MOBILE, true), `${moteur} mobile`).toHaveLength(1);
};

it('[E277] Playwright exécute Chromium en bureau 1280×800 et en mobile tactile 390×844', () => {
    bureauEtMobile('chromium');
});

it('[E278] Playwright exécute Firefox en bureau 1280×800 et en mobile tactile 390×844', () => {
    bureauEtMobile('firefox');
});

it('[E279] Playwright exécute WebKit en bureau 1280×800 et en mobile tactile 390×844', () => {
    bureauEtMobile('webkit');
});

it('[E277][E278][E279] la matrice couvre 3 moteurs × bureau/mobile, plus un petit mobile 360×740', () => {
    expect(new Set(projects.map(({ use }) => use.browserName))).toEqual(
        new Set(['chromium', 'firefox', 'webkit']),
    );
    const petits = ['chromium', 'firefox', 'webkit'].flatMap((moteur) =>
        aLaTaille(moteur, PETIT_MOBILE, true),
    );
    expect(petits.length).toBeGreaterThanOrEqual(1);
    expect(new Set(projects.map(({ name }) => name)).size, 'noms de projets uniques').toBe(projects.length);
    expect(config.testDir).toBe('tests/e2e');
});
