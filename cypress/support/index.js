import './commands';
import './script_loader';

global.tableClass = '.google-visualization-table-table';

// On Travis, the "runner" screenshot only has the error message, not the page.
// Grab a screenshot of the page as well.
afterEach(function() {
  cy.task(
      'logg',
      // eslint-disable-next-line no-invalid-this
      'What about ' + this.currentTest.state + ', ' + Cypress.env('TRAVIS'));
  // eslint-disable-next-line no-invalid-this
  if (this.currentTest.state === 'failed' && Cypress.env('TRAVIS')) {
    cy.screenshot({capture: 'viewport'});
  }
});
