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
    'max-len': [2, {
      'ignorePattern': '^import .*',
      // TODO(janakr): this is true by default, why does it have to be specified
      // as soon as I start setting max-len explicitly?
      'ignoreUrls': true,
    }],
    // TODO(https://github.com/google/eslint-config-google/issues/58):
    'indent': ['error', 2,
    {
      'CallExpression': {'arguments': 2},
      'SwitchCase': 1,
      'MemberExpression': 2,
      'FunctionDeclaration': {'parameters': 3},
      'ignoredNodes': [
          'CallExpression > CallExpression',
          'CallExpression > MemberExpression',],
    }],
  },
};
