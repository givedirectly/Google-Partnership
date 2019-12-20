export {
  cypressTestPropertyName,
  earthEngineTestTokenCookieName,
  firebaseTestTokenPropertyName,
  getTestValue,
  getValueFromLocalStorage,
  inProduction,
};

const cypressTestPropertyName = 'IN_CYPRESS_TEST';

/**
 * These values are set in test setup (cypress/support/index.js) with tokens
 * retrieved from functions defined in cypress/plugins/main.js. Those tokens
 * grant access to Firebase and EarthEngine, respectively, even without any
 * login action from this script, which would be impossible in a test.
 *
 * See cypress/plugins/main.js for more details on how that is done.
 */
const firebaseTestTokenPropertyName = 'TEST_FIREBASE_TOKEN';
const earthEngineTestTokenCookieName = 'TEST_EARTHENGINE_TOKEN';

/**
 * Returns the value of the requested key from `window.localStorage`.
 *
 * @param {string} propertyName
 * @return {string}
 */
function getValueFromLocalStorage(propertyName) {
  return window.localStorage.getItem(propertyName);
}

/**
 * Returns value of property set by tests.
 *
 * @return {string}
 */
function getTestValue() {
  return getValueFromLocalStorage(cypressTestPropertyName);
}
/**
 * Returns if we are in production, as determined by the IN_CYPRESS_TEST prop.
 *
 * @return {boolean}
 */
function inProduction() {
  return !getTestValue();
}
