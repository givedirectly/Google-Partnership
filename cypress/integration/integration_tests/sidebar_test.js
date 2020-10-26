describe('Integration test for the sidebar', () => {
  it('Enables toggling', () => {
    cy.visit('');
    cy.awaitLoad();

    // The sidebar should be collapsed to start.
    cy.get('#sidebar').should('have.css', 'width', '64px');
    cy.get('#sidebar-thresholds').should('have.css', 'display', 'none');
    cy.get('#sidebar-datasets').should('have.css', 'display', 'none');

    // The thresholds should appear on toggling.
    cy.get('#sidebar-toggle-thresholds').click();
    assertSidebarWidth();
    cy.get('#sidebar-thresholds').should('not.have.css', 'display', 'none');
    cy.get('#sidebar-datasets').should('have.css', 'display', 'none');

    // The thresholds sidebar should disappear on toggling.
    cy.get('#sidebar-toggle-thresholds').click();
    cy.get('#sidebar').should('have.css', 'width', '64px');
    cy.get('#sidebar-thresholds').should('have.css', 'display', 'none');
    cy.get('#sidebar-datasets').should('have.css', 'display', 'none');

    // The datasets should appear on toggling.
    cy.get('#sidebar-toggle-datasets').click();
    assertSidebarWidth();
    cy.get('#sidebar-thresholds').should('have.css', 'display', 'none');
    cy.get('#sidebar-datasets').should('not.have.css', 'display', 'none');

    // The thresholds should appear on toggling even from another sidebar view.
    cy.get('#sidebar-toggle-thresholds').click();
    assertSidebarWidth();
    cy.get('#sidebar-thresholds').should('not.have.css', 'display', 'none');
    cy.get('#sidebar-datasets').should('have.css', 'display', 'none');
  });
});

/**
 * Asserts that sidebar has a reasonable width.
 */
function assertSidebarWidth() {
  cy.get('#sidebar').should('have.css', 'width').and((width) => {
    expect(width).to.have.string('px');
    const val = parseInt(width.substring(0, width.length - 2));
    expect(val).to.be.within(271, 275);
  });
}
