/**
 * Checks that submitting a threshold change automatically checks the score
 * checkbox (since it automatically reshows the score layer).
 */
describe('Integration test', () => {
  it('Checks threshold update checks score box', () => {
    cy.visit('').then(() => cy.awaitLoad());

    cy.get('#sidebar-toggle-datasets').click();

    cy.get('#layer-score-checkbox').uncheck();

    cy.get('#sidebar-toggle-thresholds').click();

    cy.get('[id="poverty threshold"]').clear().type('1.0');
    cy.get('#update').click();

    cy.get('#layer-score-checkbox').should('be.checked');
  });
});
