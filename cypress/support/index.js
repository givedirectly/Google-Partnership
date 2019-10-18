// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands';
import './mock_ee';
import './mock_firebase';
import './mock_deck';
import './mock_maps';

// Alternatively you can use CommonJS syntax:
// require('./commands')

global.host = 'http://localhost:8080/';
global.tableClass = '.google-visualization-table-table';

beforeEach(() => {
  /** wide enough for sidebar */
  cy.viewport(1100, 1700);
  global.testCookieValue = Math.random() + '/suffix';
  cy.setCookie('IN_CYPRESS_TEST', testCookieValue);
  cy.setCookie(' TEST_FIREBASE_TOKEN', firestoreCustomToken);
});

before(
    () => cy.task('initializeTestFirebase')
              .then((token) => {
                global.firestoreCustomToken = token;
                // Avoid Cypress getting confused by undefined return.
                return null;
              }));
