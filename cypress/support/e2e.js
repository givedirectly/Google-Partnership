import './commands';
import './script_loader';

global.tableClass = '.google-visualization-table-table';

// Start off with Harvey for test cases since our tests assert against
// specific block groups and damage points.
beforeEach(() => window.localStorage.setItem('disaster', '2017-harvey'));

// If the  "runner" screenshot only has the error message, not the page,
// grab a screenshot of the page as well.
// TODO(janak): is this actually necessary/useful still?
afterEach(function() {
  cy.task('logg', 'here we go after each');
  // eslint-disable-next-line no-invalid-this
  if (this.currentTest.state === 'failed' && Cypress.env('GITHUB_WORKFLOW') &&
      Cypress.browser.name !== 'electron') {
    cy.screenshot({capture: 'viewport'});
  }
});
