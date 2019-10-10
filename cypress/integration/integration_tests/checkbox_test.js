/**
 * Checks that submitting a threshold change automatically checks the score
 * checkbox (since it automatically reshows the score layer).
 */
describe('Integration test', () => {
  it('Checks threshold update checks score box', () => {
    cy.visit(host);
    cy.awaitLoad();

    cy.get('[id="score"]').uncheck();

    cy.get('[id="poverty threshold"]').type('1.0');
    cy.get('[id="update"]').click();

    cy.get('[id="score"]').should('be.checked');
  });
});
