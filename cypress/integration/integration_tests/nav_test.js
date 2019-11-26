describe('Integration test for the navbar', () => {
  it('Switch disasters', () => {
    cy.visit('');

    // Michael on top of Harvey.
    // Give Firestore time to return by extending the timeout.
    cy.get('#disaster-dropdown', {timeout: 10000})
        .children('option')
        .eq(1)
        .contains('2017-harvey');
    cy.get('#disaster-dropdown')
        .children('option')
        .eq(0)
        .contains('2018-michael');
    cy.get('#disaster-dropdown').select('2018-michael');

    // The page should now be switched to the Michael disaster.
    cy.get('.google-visualization-table-td').contains('Florida');

    cy.visit('');

    // On reload, the most recently selected disaster should be persisted.
    cy.get('#disaster-dropdown').should('have.value', '2018-michael');
    cy.get('.google-visualization-table-td').contains('Florida');
  });

  it('Open the nav menu and change pages', () => {
    cy.visit('');

    // Click the burger.
    cy.get('#nav-input').click();

    // Click the add disaster page link. This is forced because Cypress
    // mistakenly believes the element is not visible due to the <a> tag being
    // 0x0.
    cy.get('.nav-menu a:first').next().click({force: true});

    // The page should now be navigated to add_disaster.html.
    cy.url().should('include', '/add_disaster.html');
    // Make sure navigation bar is visible.
    cy.get('#nav-input');
  });
});
