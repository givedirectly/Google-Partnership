require('@babel/register')({
  plugins: [
    '@babel/plugin-transform-modules-commonjs',
    '@babel/plugin-proposal-object-rest-spread',
  ],
});
module.exports = require('./main.js').onFunction;
