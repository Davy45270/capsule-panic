import babel from '@babel/eslint-parser';

export default [
    {
        ignores: [
            '**/schema-validators.mjs',
            'coverage/**',
            'dist/**',
            'playwright-report/**',
            'test-results/**',
        ],
    },
    {
        files: ['**/*.{js,mjs,ts,tsx}'],
        languageOptions: {
            parser: babel,
            parserOptions: {
                requireConfigFile: false,
                babelOptions: {
                    babelrc: false,
                    configFile: false,
                    parserOpts: { plugins: ['typescript', 'jsx'] },
                },
            },
        },
        rules: {
            'no-eval': 'error',
            'no-new-func': 'error',
            'no-implied-eval': 'error',
        },
    },
];
