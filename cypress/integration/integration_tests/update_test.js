describe('Integration test', () => {
  /** Ensures that setting one weight also sets the other one */
  it('Submits a new weight', () => {
    cy.visit(host);

    cy.get('#p-weight').type('0.2');
    cy.get('#pw-button').click();

    // TODO(#53): implement loading element and replace with call to it.
    cy.wait(200);

    cy.get('#current-pw').should('have.text', 'Current poverty weight: 0.2');
    cy.get('#current-dw').should('have.text', 'Current damage weight: 0.8');
  });

  it('Submits a new threshold value', () => {
    cy.visit(host);

    cy.get('#current-pt').should('have.text', 'Current poverty threshold: 0.3');

    cy.get('#p-threshold').type('0.5');
    cy.get('#pt-button').click();

    // TODO(#53): implement loading element and replace with call to it.
    cy.wait(200);

    cy.get('#current-pt').should('have.text', 'Current poverty threshold: 0.5');
    cy.get('#pt-error-message').should('have.text', '');
  });

  it('Submits an invalid threshold value (empty)', () => {
    cy.visit(host);

    cy.get('#p-threshold').type('-0.1');
    cy.get('#pt-button').click();

    cy.get('#pt-error-message')
        .should('have.text', 'Threshold must be between 0.00 and 1.00');
  });

  it('Submits an invalid, then valid value ', () => {
    cy.visit(host);

    // Wait for page to load.
    // TODO(#53): implement loading element and replace with call to it.
    cy.wait(300);

    cy.get('#pt-button').click();

    cy.get('#p-threshold').type('0.5');
    cy.get('#pt-button').click();

    cy.get('#pt-error-message').should('have.text', '');
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
// Disabling for flakiness
//    CypressError: Timed out retrying: Expected to find element:
//    '.google-visualization-table-page-numbers', but never found it.

// describe('Integration test', () => {
//   it('Checks list size updates with higher threshold', () => {
//     cy.visit(host);
//
//     cy.get('#p-threshold').type('0.0');
//     cy.get('#pt-button').click();
//
//     // Wait for table to reload properly.
//     // TODO(#53): implement loading element and replace with call to it.
//     cy.wait(200);
//
//     const numPages = cy.get('.google-visualization-table-page-numbers')
//                          .find('*')
//                          .then((elm) => elm.length);
//     numPages.should('gt', 0);
//
//     cy.get('#p-threshold').type('1.0');
//     cy.get('#pt-button').click();
//
//     // Wait for table to reload properly.
//     // TODO(#53): implement loading element and replace with call to it.
//     cy.wait(500);
//
//     cy.get(tableClass)
//         .find('.google-visualization-table-page-numbers')
//         .should('not.exist');
//     cy.get(tableClass)
//         .find('.google-visualization-table-tr-even')
//         .should('not.exist');
//   });
// });
