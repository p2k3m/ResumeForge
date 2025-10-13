export default [
  {
    ignores: [
      'node_modules/',
      'client/node_modules/',
      'client/dist/',
      'coverage/',
      '.aws-sam/',
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
];
