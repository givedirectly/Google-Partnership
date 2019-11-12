import './commands';
import './script_loader';

global.tableClass = '.google-visualization-table-table';

// On Travis, the "runner" screenshot only has the error message, not the page.
// Grab a screenshot of the page as well.
afterEach(function() {
  // eslint-disable-next-line no-invalid-this
  if (this.currentTest.state === 'failed' && Cypress.env('ON_TRAVIS')) {
    cy.screenshot({capture: 'viewport'});
    cy.get('elementthatdoesnotexistforimmediatefailure');
  }
});
