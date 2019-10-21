import './commands';
import './mock_ee';
import './mock_firebase';
import './mock_deck';
import './mock_maps';

import {cypressTestCookieName} from '../../client-side/static/in_test_util';
import {earthEngineTestTokenCookieName, firebaseTestTokenCookieName} from '../../client-side/static/script';

global.host = 'http://localhost:8080/';
global.tableClass = '.google-visualization-table-table';

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
