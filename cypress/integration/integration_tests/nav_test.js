describe('Integration test for the navbar', () => {
  it('Switch disasters', () => {
    cy.visit('');

    cy.get('#disaster-dropdown').select('2018-michael');

    // The page should now be switched to the Michael disaster.
    cy.url().should('include', 'disaster=2018-michael');
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
  });
});
