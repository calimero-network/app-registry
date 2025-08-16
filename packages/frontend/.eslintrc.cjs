module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2020,
  },
  extends: [
    'eslint:recommended',
    'prettier',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  rules: {
    'no-unused-vars': 'warn',
    'no-console': 'warn',
  },
}
