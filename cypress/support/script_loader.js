import {CLIENT_ID, getFirebaseConfig} from '../../docs/authenticate';
import {cypressTestCookieName, earthEngineTestTokenCookieName, firebaseTestTokenCookieName} from '../../docs/in_test_util';

export {addFirebaseHooks, loadScriptsBeforeForUnitTests};

const scriptMap = new Map([
  [
    'maps',
    [
      'https://maps.google.com/maps/api/js?libraries=drawing,places&key=AIzaSyBAQkh-kRrYitkPafxVLoZx3E5aYM-auXM',
      () => typeof (google) !== 'undefined' &&
          typeof (google.maps) !== 'undefined',
    ],
  ],
  [
    'deck',
    [
      'https://unpkg.com/deck.gl@latest/dist.min.js',
      () => typeof (deck) !== 'undefined',
    ],
  ],
  [
    'ee',
    [
      'https://rawcdn.githack.com/google/earthengine-api/3bb86bfc4f3d9eed98220f3d225b414982915b86/javascript/build/ee_api_js_debug.js',
      () => typeof (ee) !== 'undefined',
    ],
  ],
  [
    'firebase',
    [
      [
        'https://www.gstatic.com/firebasejs/6.3.3/firebase-app.js',
        'https://www.gstatic.com/firebasejs/6.3.3/firebase-firestore.js',
        'https://www.gstatic.com/firebasejs/7.2.1/firebase-auth.js',
      ],
      () => typeof (firebase) != 'undefined' &&
          typeof (firebase.firestore) != 'undefined' &&
          typeof (firebase.auth) != 'undefined',
    ],
  ],
]);

let earthEngineCustomToken = null;

/**
 * Load genuine scripts into local document. This gives unit tests the ability
 * to use actual external objects. That makes them a bit less "unit"-y, but
 * they're still fast, and can be much more faithful to the external interfaces.
 *
 * Integration tests cannot use this because then the same script would be on
 * the page multiple times, from this and from the actual site, which can cause
 * confusion.
 *
 * @param {...string} scriptKeys keys from scriptMap above. These will be the
 *     scripts that are loaded.
 */
function loadScriptsBeforeForUnitTests(...scriptKeys) {
  const scriptsSet = new Set(scriptKeys);
  const usesEe = scriptsSet.has('ee');
  const usesFirebase = scriptsSet.has('firebase');
  before(() => {
    const callbacks = [];
    for (const scriptKey of scriptKeys) {
      const scriptPair = scriptMap.get(scriptKey);
      const scripts = scriptPair[0];
      if (Array.isArray(scripts)) {
        for (const script of scripts) {
          addScriptToDocument(script);
        }
      } else {
        addScriptToDocument(scripts);
      }
      callbacks.push(scriptPair[1]);
    }
    // waitForCallback may return before the callback is actually ready, just
    // enqueuing itself to run again on a different thread, so this loop
    // finishing does not mean that all the callbacks are true. But we've done
    // our job enqueuing work that will not terminate until all the callbacks
    // are true, which will keep Cypress from proceeding until all that work is
    // done.
    for (const callback of callbacks) {
      waitForCallback(callback);
    }
  });
  if (usesEe) {
    before(() => {
      doServerEeSetup().then(
          () => new Promise(
              (resolve, reject) => ee.data.setAuthToken(
                  CLIENT_ID, 'Bearer', earthEngineCustomToken,
                  /* expiresIn */ 3600, /* extraScopes */[],
                  /* callback */
                  () => ee.initialize(null, null, resolve, reject),
                  /* updateAuthLibrary */ false)));
    });
  }
  if (usesFirebase) {
    // Currently no unit test actually writes to Firestore, they just use the
    // library. A unit test that really writes to Firestore will be responsible
    // for calling the necessary functions (addFirebaseHooks and logging in with
    // the custom token, similar to what is done in prod).
    before(() => {
      firebase.initializeApp(getFirebaseConfig(/* inProduction */ false));
    });
  }
}

const testPrefix = new Date().getTime() + '-';
/**
 * Adds all necessary hooks to set up Firebase, for either unit or integration
 * tests. Populates test Firestore database. Integration tests need to also set
 * the appropriate cookie.
 */
function addFirebaseHooks() {
  let testCookieValue = null;
  before(() => cy.task('initializeTestFirebase', null, {
                   timeout: 10000,
                 }).then((token) => global.firestoreCustomToken = token));
  beforeEach(() => {
    testCookieValue = testPrefix + Math.random();
    cy.task(
        'clearAndPopulateTestFirestoreData', testCookieValue, {timeout: 15000});
    cy.setCookie(cypressTestCookieName, testCookieValue);
  });
  afterEach(() => cy.task('deleteTestData', testCookieValue));
}

/**
 * Performs task of creating EarthEngine token and setting it to
 * earthEngineCustomToken variable. Should be called inside a before() hook.
 * @return {Cypress.Chainable<any>}
 */
function doServerEeSetup() {
  return cy.task('getEarthEngineToken')
      .then((token) => earthEngineCustomToken = token);
}

if (Cypress.spec.relative.startsWith('cypress/integration/integration_tests')) {
  addFirebaseHooks();
  // EE authentication.
  before(doServerEeSetup);
  beforeEach(() => {
    /** wide enough for sidebar */
    cy.viewport(1100, 1700);
    cy.setCookie(firebaseTestTokenCookieName, firestoreCustomToken);
    cy.setCookie(earthEngineTestTokenCookieName, earthEngineCustomToken);
  });
}

/**
 * Loads a script dynamically into Cypress's test-only "document". The script's
 * symbols will be available inside all Cypress functions, but are not available
 * during file loading, so bare statements outside of functions like
 * "const elt = deck.property" in production files will still result in errors.
 * To get around this, keep all such statements within functions that are called
 * at runtime.
 * @param {string} scriptUrl
 */
function addScriptToDocument(scriptUrl) {
  const script = document.createElement('script');
  script.setAttribute('src', scriptUrl);
  script.setAttribute('type', 'text/javascript');
  document.head.appendChild(script);
}

/**
 * Function that repeatedly calls a callback until it returns true, waiting 1 ms
 * after each failuire.
 * @param {Function} callback
 * @return {Cypress.Chainable} Cypress promise that can be chained off of
 */
function waitForCallback(callback) {
  if (!callback()) {
    return cy.wait(1).then(() => waitForCallback(callback));
  }
  // If callback is true, return a Cypress Chainable so that we can chain work
  // off of this function.
  return cy.wait(0);
}
