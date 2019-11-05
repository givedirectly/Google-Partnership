describe('Integration test for the navbar', () => {
  it('Open the nav menu and change pages', () => {
    cy.visit(host);

    // Click the burger.
    cy.get('#nav-input').click();

    // Click the add asset page link.
    cy.get('#nav-menu a:first').next().click({force: true});

    // The page should now be navigated to add_asset.html.
    cy.url().should('include', '/add_asset.html')
  });
});
