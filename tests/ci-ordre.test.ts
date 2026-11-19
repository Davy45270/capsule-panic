// Spec (acceptance/TESTS.md, § CI) : « Install frozen lockfile -> lint -> tsc -> unit/property -> build ->
// Playwright -> SCA/SAST -> publish artefacts. » La CI du dépôt est Woodpecker : .woodpecker/checks.yml
// (installation → build), puis .woodpecker/e2e.yml, qui en dépend (Playwright → SCA/SAST → artefacts).
// Ce test lit les deux workflows dans cet ordre, classe chaque étape dans une phase de la spec et exige
// l'ordre exact des phases, ainsi que la présence des étapes obligatoires (dont le SBOM CycloneDX).
// Contrairement au test [E167][E170][E172] (tooling.test.ts), qui vérifie des commandes, il refuse aussi
// une étape inconnue (non classée) et une phase qui reviendrait après la suivante.
// « publish artefacts » : l'étape `artefact` archive dist/ et en affiche l'empreinte ; il n'existe pas de
// serveur de rétention d'artefacts sur cette forge, et ce test n'en suppose pas.
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

interface Etape {
    name: string;
    commands: string[];
}

const PHASES = [
    'installation',
    'lint',
    'tsc',
    'unitaires',
    'build',
    'playwright',
    'sca-sast',
    'artefacts',
] as const;
type Phase = (typeof PHASES)[number];

/** Phase de la spec à laquelle appartient chaque étape Woodpecker connue. */
const CLASSEMENT: Record<string, Phase> = {
    'npm ci': 'installation',
    lint: 'lint',
    typecheck: 'tsc',
    assets: 'unitaires',
    test: 'unitaires',
    build: 'build',
    'check:precache': 'build',
    e2e: 'playwright',
    sbom: 'sca-sast',
    audit: 'sca-sast',
    secrets: 'sca-sast',
    artefact: 'artefacts',
};

/** Étapes sans lesquelles la chaîne n'est pas complète, même si chaque phase est représentée. */
const REQUISES = [
    'npm ci',
    'lint',
    'typecheck',
    'test',
    'build',
    'e2e',
    'sbom',
    'audit',
    'secrets',
    'artefact',
];

/** Rend la liste des écarts à l'ordre de la spec ; vide si l'ordre est conforme. */
function ecartsOrdre(etapes: readonly Etape[]): string[] {
    const ecarts: string[] = [];
    let rang = -1;
    const vues = new Set<Phase>();
    for (const { name } of etapes) {
        const phase = CLASSEMENT[name];
        if (!phase) {
            ecarts.push(`étape non classée : ${name}`);
            continue;
        }
        const indice = PHASES.indexOf(phase);
        if (indice < rang) ecarts.push(`${name} (${phase}) arrive après ${PHASES[rang] ?? '?'}`);
        rang = Math.max(rang, indice);
        vues.add(phase);
    }
    for (const phase of PHASES) if (!vues.has(phase)) ecarts.push(`phase absente : ${phase}`);
    const noms = new Set(etapes.map((etape) => etape.name));
    for (const nom of REQUISES) if (!noms.has(nom)) ecarts.push(`étape absente : ${nom}`);
    return ecarts;
}

interface Workflow {
    depends_on?: string[];
    steps: Etape[];
}
const lireWorkflow = (nom: string): Workflow =>
    parse(readFileSync(`.woodpecker/${nom}.yml`, 'utf8')) as Workflow;
const checks = lireWorkflow('checks');
const e2e = lireWorkflow('e2e');
// L'ordre entre les deux workflows ne tient que si e2e attend la fin de checks.
const etapes = [...checks.steps, ...e2e.steps];
const commandes = (nom: string): string =>
    etapes.find((etape) => etape.name === nom)?.commands.join('\n') ?? '';

it('[E281] Woodpecker suit lockfile figé → lint → tsc → unit/property → build → Playwright → SCA/SAST → artefacts', () => {
    expect(ecartsOrdre(etapes)).toEqual([]);
    expect(checks.depends_on ?? []).toEqual([]);
    expect(e2e.depends_on).toEqual(['checks']);
    // Lockfile figé : `npm ci` échoue si package-lock.json ne correspond pas à package.json ;
    // `npm install` le réécrirait.
    expect(commandes('npm ci')).toMatch(/^npm ci$/m);
    expect(etapes.flatMap((e) => e.commands).filter((c) => /\bnpm (?:install|i)\b/.test(c))).toEqual([]);
    expect(commandes('typecheck')).toContain('npm run typecheck');
    expect(commandes('test')).toContain('npm test');
    expect(commandes('e2e')).toContain('npm run test:e2e');
    // SBOM CycloneDX produit et contrôlé dans la phase SCA/SAST, puis archivé avec les artefacts.
    expect(commandes('sbom')).toContain('npm sbom --sbom-format cyclonedx > sbom.json');
    expect(commandes('sbom')).toContain('bom.bomFormat !== "CycloneDX"');
    expect(commandes('artefact')).toMatch(/^cp sbom\.json "artefacts\//m);
    expect(commandes('audit')).toContain('npm audit');
    expect(commandes('audit')).toContain('npm run check:sast');
    expect(commandes('artefact')).toContain('tar -czf');
    expect(commandes('artefact')).toContain('sha256sum');
});

it('[E281] le contrôle d’ordre refuse une permutation, une étape inconnue et une phase manquante', () => {
    const permute = [...etapes];
    const build = permute.findIndex((e) => e.name === 'build');
    const e2e = permute.findIndex((e) => e.name === 'e2e');
    [permute[build], permute[e2e]] = [permute[e2e] as Etape, permute[build] as Etape];
    expect(ecartsOrdre(permute).length).toBeGreaterThan(0);

    expect(ecartsOrdre([...etapes, { name: 'deploiement', commands: [] }])).toEqual([
        'étape non classée : deploiement',
    ]);
    expect(
        ecartsOrdre(etapes.filter((e) => e.name !== 'sbom' && e.name !== 'audit' && e.name !== 'secrets')),
    ).toEqual([
        'phase absente : sca-sast',
        'étape absente : sbom',
        'étape absente : audit',
        'étape absente : secrets',
    ]);
    expect(ecartsOrdre(etapes.filter((e) => e.name !== 'sbom'))).toEqual(['étape absente : sbom']);
    // Le SBOM après les artefacts serait hors de sa phase.
    const sbom = etapes.find((e) => e.name === 'sbom') as Etape;
    expect(ecartsOrdre([...etapes.filter((e) => e !== sbom), sbom])).toEqual([
        'sbom (sca-sast) arrive après artefacts',
    ]);
});
