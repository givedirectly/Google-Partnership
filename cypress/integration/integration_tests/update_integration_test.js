/**
 * Checks correct initial value of poverty threshold and checks it updates when
 * updated with valid value
 */
describe('Integration test', () => {
  it('Submits a new threshold value', () => {
    cy.visit(host);

    cy.get('#current-threshold')
        .should('have.text', 'Current poverty threshold: 0.3');

    cy.get('#threshold').type('0.5');
    cy.get('#update-button').click();

    cy.get('#current-threshold')
        .should('have.text', 'Current poverty threshold: 0.5');
    cy.get('#threshold-error-message').should('have.text', '');
  });
});

describe('Integration test', () => {
  it('Submits an invalid threshold value (empty)', () => {
    cy.visit(host);

    cy.get('#update-button').click();

    cy.get('#threshold-error-message')
        .should('have.text', 'Threshold must be between 0.00 and 1.00');
  });
});

/**
 * Checks error message disappears when bad threshold value replaced by
 * valid value.
 */
describe('Integration test', () => {
  it('Submits an invalid, then valid value ', () => {
    cy.visit(host);
    cy.get('#update-button').click();

    cy.get('#threshold').type('0.5');
    cy.get('#update-button').click();

    cy.get('#threshold-error-message').should('have.text', '');
  });
});

/**
 * Checks that by setting the threshold to 100% the list and page number empty.
 * This is somewhat brittle in that if we ever worked with some poverty data
 * that did have 100% poverty in any areas, this would break.
 *
 * On conditional testing:
 * https://docs.cypress.io/guides/core-concepts/conditional-testing.html#Definition
 */
describe('Integration test', () => {
  it('Checks list size updates with higher threshold', () => {
    cy.visit(host);

    cy.get('#threshold').type('0.0');
    cy.get('#update-button').click();

    const numPages = cy.get('.google-visualization-table-page-numbers')
                         .find('*')
                         .then((elm) => elm.length);
    numPages.should('gt', 0);

    cy.get('#threshold').type('1.0');
    cy.get('#update-button').click();

    // Wait for table to reload properly.
    // TODO: implement loading element and replace this with a find for that.
    cy.wait(200);

    cy.get(tableClass)
        .find('.google-visualization-table-page-numbers')
        .should('not.exist');
    cy.get(tableClass)
        .find('.google-visualization-table-tr-even')
        .should('not.exist');
  });
});
