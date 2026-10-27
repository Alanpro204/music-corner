import js from '@eslint/js';

export default [
    { ignores: ['dist/**', '.dev/**', '.tools/**', 'node_modules/**'] },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                ARGV: 'readonly',
                global: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                TextDecoder: 'readonly',
                TextEncoder: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
            eqeqeq: 'error',
            'no-var': 'error',
            'prefer-const': 'error',
        },
    },
];
