describe('Integration test for loading spinners', () => {
  it('Removes the loading overlay', () => {
    cy.visit(host);

    cy.get('#mapContainer-loader', {timeout: 10000})
        .should('have.css', 'opacity').and('eq', '0');
    cy.get('#tableContainer-loader', {timeout: 10000})
        .should('have.css', 'opacity').and('eq', '0');
  });
});
