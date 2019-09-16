describe('Integration test for loading spinners', () => {
  it('Removes the loading overlay on page load', () => {
    cy.visit(host);

    cy.get('#mapContainer-loader')
        .should('have.css', 'opacity').and('eq', '0');
    cy.get('#tableContainer-loader')
        .should('have.css', 'opacity').and('eq', '0');
  });

  it('Adds and removes the loading overlay on update', () => {
    cy.visit(host);

    cy.get('[id="damage threshold"]').type('0.75');
    cy.get('[id="update"]').click();

    // The loading overlay should be made opaque while the content is loading.
    cy.get('#mapContainer-loader')
        .should('have.css', 'opacity').and('eq', '1');
    cy.get('#tableContainer-loader')
        .should('have.css', 'opacity').and('eq', '1');
    // Once the content is rendered, these should be made transparent.
    cy.get('#mapContainer-loader')
        .should('have.css', 'opacity').and('eq', '0');
    cy.get('#tableContainer-loader')
        .should('have.css', 'opacity').and('eq', '0');
  });
});
