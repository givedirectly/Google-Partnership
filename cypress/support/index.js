import './commands';
import './mock_firebase';

import {cypressTestCookieName, earthEngineTestTokenCookieName, firebaseTestTokenCookieName} from '../../docs/in_test_util';

global.host = 'http://localhost:8080/';
global.tableClass = '.google-visualization-table-table';

beforeEach(() => {
  /** wide enough for sidebar */
  cy.viewport(1100, 1700);
  global.testCookieValue = Math.random() + '/suffix';
  cy.setCookie(cypressTestCookieName, testCookieValue);
  cy.setCookie(firebaseTestTokenCookieName, firestoreCustomToken);
  cy.setCookie(earthEngineTestTokenCookieName, earthEngineCustomToken);
});

before(
    () => cy.task('initializeTestFirebase')
              .then((token) => global.firestoreCustomToken = token));

before(
    () => cy.task('getEarthEngineToken')
              .then((token) => global.earthEngineCustomToken = token));
