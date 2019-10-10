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

// Alternatively you can use CommonJS syntax:
// require('./commands')

global.host = 'http://localhost:8080/';
global.tableClass = '.google-visualization-table-table';

global.testCookieValue = Math.random() + '/suffix';
beforeEach(() => cy.setCookie('IN_CYPRESS_TEST', testCookieValue));
