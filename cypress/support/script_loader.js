import {getFirebaseConfig} from '../../docs/authenticate';
import {CLIENT_ID} from '../../docs/common_auth_utils.js';
import {cypressTestPropertyName, earthEngineTestTokenCookieName, firebaseTestTokenPropertyName} from '../../docs/in_test_util';

export {loadScriptsBeforeForUnitTests};

// Getting the scripts from local disk seems to cause flaky failures, so go via
// server.
const LIB_URL = Cypress.config().baseUrl + 'external_libs/';

const JQUERY_URL = LIB_URL + 'jquery-3.4.1.min.js';

/**
 * Scripts that unit tests may want to load. Values have script and callback
 * attributes, and optionally an extraScripts and extraCallback attributes, when
 * they must load additional scripts that depend on the first one. More
 * complicated graphs are not currently supported!
 * @type {Map<string, Object>}
 */
const scriptMap = new Map([
  [
    'maps',
    {
      script:
          'https://maps.google.com/maps/api/js?libraries=drawing,places&key=AIzaSyBAQkh-kRrYitkPafxVLoZx3E5aYM-auXM',
      callback: () => typeof (google) !== 'undefined' &&
          typeof (google.maps) !== 'undefined',
    },
  ],
  [
    'deck',
    {
      script: LIB_URL + 'deck-8.0.2.min.js',
      callback: () => typeof (deck) !== 'undefined',
    },
  ],
  [
    'ee',
    {
      script: LIB_URL + 'ee_api_js_debug-0.1.232.js',
      callback: () => typeof (ee) !== 'undefined',
    },
  ],
  [
    'firebase',
    {
      script: LIB_URL + 'firebase-app-7.6.1.js',
      callback: () => typeof (firebase) != 'undefined',
      extraScripts: [
        LIB_URL + 'firebase-firestore-7.6.1.js',
        LIB_URL + 'firebase-auth-7.6.1.js',
      ],
      extraCallback: () => typeof (firebase.firestore) != 'undefined' &&
          typeof (firebase.auth) != 'undefined',
    },
  ],
  [
    'jquery',
    {
      script: JQUERY_URL,
      callback: () =>
          typeof ($) !== 'undefined' && typeof (jQuery) != 'undefined',
    },
  ],
  [
    'jqueryWithUi',
    {
      script: JQUERY_URL,
      callback: () => scriptMap.get('jquery').callback(),
      extraScripts: [LIB_URL + 'jquery-ui-1.12.1.min.js'],
      extraCallback: () => typeof ($().dialog) !== 'undefined',
    },
  ],
  [
    'charts',
    {
      script: 'https://www.gstatic.com/charts/loader.js',
      callback: () => typeof (google) !== 'undefined' &&
          typeof (google.charts) !== 'undefined',
    },
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
  const usesCharts = scriptsSet.has('charts');
  before(() => {
    const callbacks = [];
    const extraScripts = new Map();
    for (const scriptKey of scriptKeys) {
      const scriptData = scriptMap.get(scriptKey);
      addScriptToDocument(scriptData.script);
      callbacks.push(scriptData.callback);
      if (scriptData.extraScripts) {
        extraScripts.set(scriptData.callback, {
          scripts: scriptData.extraScripts,
          callback: scriptData.extraCallback,
        });
      }
    }
    // waitForCallback may return before the callback is actually ready, just
    // enqueuing itself to run again on a different thread, so this loop
    // finishing does not mean that all the callbacks are true. But we've done
    // our job enqueuing work that will not terminate until all the callbacks
    // are true, which will keep Cypress from proceeding until all that work is
    // done.
    for (const callback of callbacks) {
      const cypressPromise = waitForCallback(callback);
      // If this script had dependent scripts, load them when this script has
      // been loaded, and add the callback for those scripts in.
      const scriptsAndCallbacks = extraScripts.get(callback);
      if (scriptsAndCallbacks) {
        cypressPromise.then(() => {
          for (const script of scriptsAndCallbacks.scripts) {
            addScriptToDocument(script);
          }
          return waitForCallback(scriptsAndCallbacks.callback);
        });
      }
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
    addFirebaseHooks();
    before(() => {
      firebase.initializeApp(getFirebaseConfig(/* inProduction */ false));
      cy.wrap(firebase.auth().signInWithCustomToken(firestoreCustomToken));
    });
  }
  if (usesCharts) {
    before(
        () => cy.wrap(
            google.charts.load('current', {packages: ['table', 'controls']})));
  }
}

const testPrefix = new Date().getTime() + '-';
/**
 * Adds all necessary hooks to set up Firebase, for either unit or integration
 * tests. Populates test Firestore database. Integration tests need to also set
 * the appropriate values in `window.localStorage`.
 */
function addFirebaseHooks() {
  before(() => {
    cy.task('initializeTestFirebase', null, {
        timeout: 20000,
      }).then((token) => global.firestoreCustomToken = token);
    // Write a copy of the data to backup documents in case of accidental
    // deletion. One backup per day.
    cy.task(
        'populateTestFirestoreData', getTimestampRoundedToDays() + '-backup');
  });
  let currentTestRoot = null;
  beforeEach(() => {
    currentTestRoot = testPrefix + Math.random();
    cy.task('populateTestFirestoreData', currentTestRoot);
    window.localStorage.setItem(cypressTestPropertyName, currentTestRoot);
  });
  afterEach(() => cy.task('deleteTestData', currentTestRoot));
}

/**
 * Performs task of creating EarthEngine token and setting it to
 * earthEngineCustomToken variable. Should be called inside a before() hook.
 * @return {Cypress.Chainable<any>}
 */
function doServerEeSetup() {
  return cy.task('getEarthEngineToken', {timeout: 20000})
      .then((token) => earthEngineCustomToken = token);
}

if (Cypress.spec.relative.startsWith('cypress/integration/integration_tests')) {
  addFirebaseHooks();
  // EE authentication.
  before(doServerEeSetup);
  beforeEach(() => {
    /** wide enough for sidebar */
    cy.viewport(1100, 1700);
    window.localStorage.setItem(
        firebaseTestTokenPropertyName, firestoreCustomToken);
    window.localStorage.setItem(
        earthEngineTestTokenCookieName, earthEngineCustomToken);
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

/**
 * Returns the timestamp of the start of the current day (midnight).
 * @return {number}
 */
function getTimestampRoundedToDays() {
  const date = new Date();
  date.setHours(0);
  date.setMinutes(0);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date.getTime();
}
