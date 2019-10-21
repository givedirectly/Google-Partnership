export {
  cypressTestCookieName,
  getCookieValue,
  getTestCookie,
  inProduction,
};

const cypressTestCookieName = 'IN_CYPRESS_TEST';

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
