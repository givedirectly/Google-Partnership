module.exports = {
  'env': {
    'browser': true,
    'es6': true,
  },
  'extends': [
    'google',
  ],
  'globals': {
    'Atomics': 'readonly',
    'SharedArrayBuffer': 'readonly',
  },
  'parserOptions': {
    'ecmaVersion': 2018,
    'sourceType': 'module',
  },
  'rules': {
    'new-cap': [2, {
      capIsNewExceptionPattern: 'ee\..*',
      // TODO(janakr): for some reason ee\n    .Feature isn't matched.
      capIsNewExceptions: ['Feature']}],
    // TODO(https://github.com/google/eslint-config-google/issues/58):
    'indent': ['error', 2,
    {
      'CallExpression': {'arguments': 2},
      'MemberExpression': 2,
      'ignoredNodes': [
          'CallExpression > CallExpression',
          'CallExpression > MemberExpression',],
    }],
  },
};
