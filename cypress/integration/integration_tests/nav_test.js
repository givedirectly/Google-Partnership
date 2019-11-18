describe('Integration test for the navbar', () => {
  it('Open the nav menu and change pages', () => {
    cy.visit('');

    // Click the burger.
    cy.get('#nav-input').click();

    // Click the add disaster page link. This is forced because Cypress
    // mistakenly believes the element is not visible.
    cy.get('.nav-menu a:first').next().click({force: true});

    // The page should now be navigated to add_disaster.html.
    cy.url().should('include', '/add_disaster.html');
  });
});
