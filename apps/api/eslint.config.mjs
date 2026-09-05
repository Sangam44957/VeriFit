import rootConfig from '../../eslint.config.mjs';

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },
  ...rootConfig,
];
