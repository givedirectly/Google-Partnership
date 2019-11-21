import './commands';
import './script_loader';

global.tableClass = '.google-visualization-table-table';

// Start off with Harvey for test cases since our tests assert against
// specific block groups and damage points.
beforeEach(() => window.localStorage.setItem('disaster', '2017-harvey'));

// On Travis, the "runner" screenshot only has the error message, not the page.
// Grab a screenshot of the page as well.
afterEach(function() {
  // eslint-disable-next-line no-invalid-this
  if (this.currentTest.state === 'failed' && Cypress.env('ON_TRAVIS')) {
    cy.screenshot({capture: 'viewport'});
  }
});
