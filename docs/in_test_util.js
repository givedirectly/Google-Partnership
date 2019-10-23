export {
  cypressTestCookieName,
  earthEngineTestTokenCookieName,
  firebaseTestTokenCookieName,
  getCookieValue,
  getTestCookie,
  inProduction,
};

const cypressTestCookieName = 'IN_CYPRESS_TEST';

/**
 * These cookies are set in test setup (cypress/support/index.js) with tokens
 * retrieved from functions defined in cypress/plugins/index.js. Those tokens
 * grant access to Firebase and EarthEngine, respectively, even without any
 * login action from this script, which would be impossible in a test.
 *
 * See cypress/plugins/index.js for more details on how that is done.
 */
const firebaseTestTokenCookieName = 'TEST_FIREBASE_TOKEN';
const earthEngineTestTokenCookieName = 'TEST_EARTHENGINE_TOKEN';

/**
 * Returns the value of the requested cookie. Copied from
 * https://stackoverflow.com/a/25490531.
 *
 * @param {string} cookieName
 * @return {string}
 */
function getCookieValue(cookieName) {
  const value =
      document.cookie.match('(^|[^;]+)\\s*' + cookieName + '\\s*=\\s*([^;]+)');
  return value ? value.pop() : '';
}

/**
 * Returns value of cookie set by tests.
 *
 * @return {string}
 */
function getTestCookie() {
  return getCookieValue(cypressTestCookieName);
}
/**
 * Returns if we are in production, as determined by the IN_CYPRESS_TEST cookie.
 *
 * @return {boolean}
 */
function inProduction() {
  return !getTestCookie();
}
