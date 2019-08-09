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
      capIsNewExceptions: ['Feature']}],
    'indent': ['error', 2, {'CallExpression': {'arguments': 2}, 'ignoredNodes': ['CallExpression > CallExpression', 'CallExpression > MemberExpression']}]
  },
};
