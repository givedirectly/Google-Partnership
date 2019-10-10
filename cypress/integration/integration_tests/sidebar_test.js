describe('Integration test for the sidebar', () => {
  it('Enables toggling', () => {
    cy.visit(host);
    cy.awaitLoad();

    // The sidebar should be collapsed to start.
    cy.get('#sidebar').should('have.css', 'width').and('eq', '64px');
    cy.get('#sidebar-thresholds').should('have.css', 'display').and('eq', 'none');
    cy.get('#sidebar-datasets').should('have.css', 'display').and('eq', 'none');

    // The thresholds should appear on toggling.
    cy.get('#sidebar-toggle-thresholds').click();
    cy.get('#sidebar').should('have.css', 'width').and('eq', '25%');
    cy.get('#sidebar-thresholds').should('have.css', 'display').and('neq', 'none');
    cy.get('#sidebar-datasets').should('have.css', 'display').and('eq', 'none');

    // The thresholds sidebar should disappear on toggling.
    cy.get('#sidebar-toggle-thresholds').click();
    cy.get('#sidebar').should('have.css', 'width').and('eq', '64px');
    cy.get('#sidebar-thresholds').should('have.css', 'display').and('eq', 'none');
    cy.get('#sidebar-datasets').should('have.css', 'display').and('eq', 'none');

    // The datasets should appear on toggling.
    cy.get('#sidebar-toggle-datasets').click();
    cy.get('#sidebar').should('have.css', 'width').and('eq', '25%');
    cy.get('#sidebar-thresholds').should('have.css', 'display').and('eq', 'none');
    cy.get('#sidebar-datasets').should('have.css', 'display').and('neq', 'none');

    // The thresholds should appear on toggling even from another sidebar view.
    cy.get('#sidebar-toggle-thresholds').click();
    cy.get('#sidebar').should('have.css', 'width').and('eq', '25%');
    cy.get('#sidebar-thresholds').should('have.css', 'display').and('neq', 'none');
    cy.get('#sidebar-datasets').should('have.css', 'display').and('eq', 'none');
  });
});
