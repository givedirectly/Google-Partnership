/**
 * We want to depend on our standard module-based code in this file. However,
 * because Node 12 does not enable modules by default, we have to run
 * module-based code through Babel. Thus, this file becomes just an entry point,
 * with `main.js` doing the real work.
 *
 * Cypress uses `require` to include this file, which means that we cannot just
 * upgrade to Node 13, which has modules enabled by default, because 13 also
 * throws an error if `require` is used to include a module file. Thus, until
 * Cypress itself imports this file rather than requiring it, we are stuck on
 * Node 12 and this transpilation.
 */
require('@babel/register')({
  plugins: [
    '@babel/plugin-transform-modules-commonjs',
    '@babel/plugin-proposal-object-rest-spread',
  ],
});
module.exports = require('./main.js').onFunction;
