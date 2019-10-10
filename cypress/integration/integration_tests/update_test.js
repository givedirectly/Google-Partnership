describe('Integration test for update.js', () => {
  /**
   * Checks that by setting the threshold to 100% the list and page number
   * empty. This is somewhat brittle in that if we ever worked with some poverty
   * data that did have 100% poverty in any areas, this would break.
   *
   * On conditional testing:
   * https://docs.cypress.io/guides/core-concepts/conditional-testing.html#Definition
   */
  // Has been historically disabled for flakiness
  //    CypressError: Timed out retrying: Expected to find element:
  //    '.google-visualization-table-page-numbers', but never found it.

  it('Checks list size updates with higher threshold', () => {
    cy.visit(host);
    cy.awaitLoad();

    cy.get('[id="sidebar-toggle-thresholds"]').click();

    cy.get('[id="damage threshold"]').clear().type('0.0');
    cy.get('[id="update"]').click();

    const numPages = cy.get('.google-visualization-table-page-numbers')
                         .find('*')
                         .then((elm) => elm.length);
    numPages.should('gt', 0);

    cy.get('[id="poverty threshold"]').clear().type('1.0');
    cy.get('[id="damage threshold"]').clear().type('1.0');
    cy.get('[id="update"]').click();

    cy.get(tableClass)
        .find('.google-visualization-table-page-numbers')
        .should('not.exist');
    cy.get(tableClass)
        .find('.google-visualization-table-tr-even')
        .should('not.exist');
  });
});
