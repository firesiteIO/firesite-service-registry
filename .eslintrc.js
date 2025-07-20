module.exports = {
  env: {
    node: true,
    browser: true,
    es2020: true
  },
  extends: ['eslint:recommended'],
  rules: {
    // Basic rules for now
    'no-unused-vars': 'warn',
    'no-console': 'off'
  }
};