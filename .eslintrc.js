module.exports = {
  root: true,
  parserOptions: {
    project: ['./tsconfig.eslint.json'],
  },
  extends: [
    'airbnb-typescript/base',
    'plugin:import/typescript',
    'plugin:jest/all',
    'plugin:prettier/recommended',
  ],
  plugins: [
    '@typescript-eslint',
    'jest',
    'prettier',
  ],
  env: {
    'jest/globals': true,
    'jasmine': true,
    'jest': true
  },
  rules: {
    'prettier/prettier': ['error', { 'singleQuote': true }],
    'lines-between-class-members': 1,
    'no-underscore-dangle': 0,
  }
}
