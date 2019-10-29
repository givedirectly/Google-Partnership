import './commands';
import './mock_ee';
import './mock_firebase';

import {cypressTestCookieName, earthEngineTestTokenCookieName, firebaseTestTokenCookieName} from '../../docs/in_test_util';

global.host = 'http://localhost:8080/';
global.tableClass = '.google-visualization-table-table';

/**
 * Load genuine scripts into local document. This gives unit tests the ability
 * to use actual external objects. That makes them a bit less "unit"-y, but
 * they're still fast, and can be much more faithful to the external interfaces.
 */
before(() => {
  addScriptToDocument(
      'https://maps.google.com/maps/api/js?libraries=drawing,places&key=AIzaSyBAQkh-kRrYitkPafxVLoZx3E5aYM-auXM',
      () => typeof (google) !== 'undefined' &&
          typeof (google.maps) !== 'undefined');
  addScriptToDocument(
      'https://unpkg.com/deck.gl@latest/dist.min.js',
      () => typeof (deck) !== 'undefined');
});

let eeToken = null;

beforeEach(() => {
  /** wide enough for sidebar */
  cy.viewport(1100, 1700);
  global.testCookieValue = Math.random() + '/suffix';
  cy.setCookie(cypressTestCookieName, testCookieValue);
  cy.setCookie(firebaseTestTokenCookieName, firestoreCustomToken);
  cy.setCookie(earthEngineTestTokenCookieName, eeToken);
});

before(
    () => cy.task('initializeTestFirebase')
              .then((token) => global.firestoreCustomToken = token));

before(() => cy.task('getEarthEngineToken').then((token) => eeToken = token));

/**
 * Loads a script dynamically into Cypress's test-only "document". The script's
 * symbols will be available inside all Cypress functions, but are not available
 * during file loading, so bare statements outside of functions like
 * "const elt = deck.property" in production files will still result in errors.
 * To get around this, keep all such statements within functions that are called
 * at runtime.
 * @param {string} scriptUrl
 * @param {Function} checkDefinedCallback Callback that will be repeatedly
 *     invoked after the script is added to the document to see if the desired
 *     symbol has been loaded yet. It can take a few cycles for the document to
 *     be reprocessed. The callback should normally return
 * "typeof(desiredSymbol) !== 'undefined'".
 *
 */
function addScriptToDocument(scriptUrl, checkDefinedCallback) {
  const script = document.createElement('script');
  script.setAttribute('src', scriptUrl);
  script.setAttribute('type', 'text/javascript');

  const headElt = document.getElementsByTagName('body');
  headElt[0].appendChild(script);
  waitForCallback(checkDefinedCallback);
}

/**
 * Function that repeatedly calls a callback until it returns true, waiting 1 ms
 * after each failuire.
 * @param {Function} callback
 */
function waitForCallback(callback) {
  if (!callback()) {
    cy.wait(1).then(() => waitForCallback(callback));
  }
}
