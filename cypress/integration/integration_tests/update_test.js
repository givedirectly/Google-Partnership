describe('Integration test', () => {
  it('Submits multiple new values at once', () => {
    cy.visit(host);

    cy.get('[id="poverty weight"]').type('0.2');
    cy.get('[id="damage threshold"]').type('0.5');
    cy.get('[id="update"]').click();

    // TODO(#53): implement loading element and replace with call to it.
    cy.wait(200);

    cy.get('[id="current poverty weight"]')
        .should('have.text', 'current poverty weight: 0.2');
    cy.get('[id="current damage threshold"]')
        .should('have.text', 'current damage threshold: 0.5');
  });

  /** Ensures that setting one weight also sets the other one */
  it.only('Submits a new weight', () => {
    cy.visit(host);

    cy.get('[id="poverty weight"]').type('0.2');
    cy.get('[id="update"]').click();

    // TODO(#53): implement loading element and replace with call to it.
    cy.wait(200);

    cy.get('[id="current poverty weight"]')
        .should('have.text', 'current poverty weight: 0.2');
    cy.get('[id="current damage weight"]')
        .should('have.text', 'current damage weight: 0.8');
  });

  it('Submits new weights that do not add to 1', () => {
    cy.visit(host);

    cy.get('[id="poverty weight"]').type('0.2');
    cy.get('[id="damage weight"]').type('0.2');
    cy.get('[id="update"]').click();

    cy.get('[id="error"]')
        .should(
            'have.text',
            'ERROR: poverty weight and damage weight must add up to 1.0');
  });

  it('Submits a new threshold value', () => {
    cy.visit(host);

    cy.get('[id="current poverty threshold"]')
        .should('have.text', 'current poverty threshold: 0.3');

    cy.get('[id="poverty threshold"]').type('0.5');
    cy.get('[id="update"]').click();

    cy.get('[id="current poverty threshold"]')
        .should('have.text', 'current poverty threshold: 0.5');
    cy.get('[id="error"]').should('have.text', '');
  });

  it('Submits an invalid threshold value (empty)', () => {
    cy.visit(host);

    cy.get('[id="poverty threshold"]').type('-0.1');
    cy.get('[id="update"]').click();

    cy.get('[id="error"]')
        .should(
            'have.text',
            'ERROR: poverty threshold must be between 0.00 and 1.00');
  });

  it('Submits an invalid, then valid value ', () => {
    cy.visit(host);

    // Wait for page to load.
    // TODO(#53): implement loading element and replace with call to it.
    cy.wait(300);

    cy.get('[id="update"]').click();

    cy.get('[id="poverty threshold"]').type('0.5');
    cy.get('[id="update"]').click();

    cy.get('[id="error"]').should('have.text', '');
  });

  /**
   * Checks that by setting the threshold to 100% the list and page number
   * empty. This is somewhat brittle in that if we ever worked with some poverty
   * data that did have 100% poverty in any areas, this would break.
   *
   * On conditional testing:
   * https://docs.cypress.io/guides/core-concepts/conditional-testing.html#Definition
   */
  // Disabling for flakiness
  //    CypressError: Timed out retrying: Expected to find element:
  //    '.google-visualization-table-page-numbers', but never found it.

  it.only('Checks list size updates with higher threshold', () => {
    cy.visit(host);

    cy.get('[id="damage threshold"]').type('0.0');
    cy.get('[id="update"]').click();

    // Wait for table to reload properly.
    // TODO(#53): implement loading element and replace with call to it.
    cy.wait(500);

    const numPages = cy.get('.google-visualization-table-page-numbers')
                         .find('*')
                         .then((elm) => elm.length);
    numPages.should('gt', 0);

    cy.get('[id="poverty threshold"]').type('1.0');
    cy.get('[id="update"]').click();

    cy.get('[id="damage threshold"]').type('1.0');
    cy.get('[id="update"]').click();

    // Wait for table to reload properly.
    // TODO(#53): implement loading element and replace with call to it.
    cy.wait(500);

    cy.get(tableClass)
        .find('.google-visualization-table-page-numbers')
        .should('not.exist');
    cy.get(tableClass)
        .find('.google-visualization-table-tr-even')
        .should('not.exist');
  });
});
