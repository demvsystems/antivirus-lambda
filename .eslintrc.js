module.exports = {
    root: true,
    env: {
      es6: true,
      commonjs: true,
      jest: true,
      node: true,
    },
    extends: [
      'liebe/all'
    ],
    parserOptions: {
      parser: '@typescript-eslint/parser',
      ecmaVersion: 'latest',
      sourceType: 'module',
      project: 'tsconfig.json',
    },
    settings: {
      'import/resolver': {
        typescript: {},
      },
    },
    overrides: [
      {
        files: ['*.ts'],
        rules: {
          '@typescript-eslint/ban-ts-comment': [
            'warn',
            {
              'ts-nocheck': 'allow-with-description',
              'minimumDescriptionLength': 5,
            },
          ],
          '@typescript-eslint/explicit-module-boundary-types': 'error',
        },
      },
    ],
  };