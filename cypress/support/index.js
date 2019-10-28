import './commands';
import './mock_ee';
import './mock_firebase';

import {cypressTestCookieName, earthEngineTestTokenCookieName, firebaseTestTokenCookieName} from '../../docs/in_test_util';

global.host = 'http://localhost:8080/';
global.tableClass = '.google-visualization-table-table';

/**
 * Load genuine scripts into local document. This gives unit tests the ability
 * to use genuine external objects. that makes them a bit less "unit"-y, but
 * they're still fast, and can be much more faithful to the external interfaces.
 */
before(() => {
  addScriptToDocument('https://maps.google.com/maps/api/js?libraries=drawing,places&key=AIzaSyBAQkh-kRrYitkPafxVLoZx3E5aYM-auXM');
  addScriptToDocument('https://unpkg.com/deck.gl@latest/dist.min.js');
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

function addScriptToDocument(scriptUrl) {
  const script = document.createElement('script');
  script.src = scriptUrl;
  const headElt = document.getElementsByTagName('head');
  headElt[0].appendChild(script);
}
