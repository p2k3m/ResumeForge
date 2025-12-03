import jestPlugin from 'eslint-plugin-jest';

export default [
  {
    ignores: [
      'node_modules/',
      'client/node_modules/',
      'client/dist/',
      'coverage/',
      '.aws-sam/',
      'tests/server.test.mjs',
    ],
  },
  {
    files: ['**/*.{js,mjs,jsx}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    rules: {
      'report-unused-disable-directives': 'off',
    },
  },
  {
    files: ['client/**/*.{js,jsx}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  {
    files: ['**/*.test.mjs', '**/*.test.js'],
    plugins: {
      jest: jestPlugin,
    },
    languageOptions: {
      globals: {
        ...jestPlugin.environments.globals.globals,
      },
    },
    rules: {
      ...jestPlugin.configs.recommended.rules,
      'jest/no-deprecated-functions': 'off',
    },
  },
];
