import security from 'eslint-plugin-security';
import base from './eslint.config.mjs';

export default [
    ...base,
    {
        ...security.configs.recommended,
        files: ['apps/web/src/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
        rules: {
            ...security.configs.recommended.rules,
            // Les accès indexés aux cases, aux couleurs et aux énumérations sont contrôlés par TypeScript.
            'security/detect-object-injection': 'off',
        },
    },
];
