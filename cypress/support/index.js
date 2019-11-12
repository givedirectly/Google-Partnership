import './commands';
import './script_loader';

global.tableClass = '.google-visualization-table-table';

// On Travis, the "runner" screenshot only has the error message, not the page.
// Grab a screenshot of the page as well.
afterEach(function () {
  if (this.currentTest.state === 'failed' && Cypress.env('TRAVIS')) {
    cy.screenshot({capture: "viewport"});
  }
});