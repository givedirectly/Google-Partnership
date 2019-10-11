/**
 * Checks that submitting a threshold change automatically checks the score
 * checkbox (since it automatically reshows the score layer).
 */
describe('Integration test', () => {
  it('Checks threshold update checks score box', () => {
    cy.visit(host);
    cy.awaitLoad();

    cy.get('#score-checkbox').uncheck();

    cy.get('[id="poverty threshold"]').clear().type('1.0');
    cy.get('#update').click();

    cy.get('#score-checkbox').should('be.checked');
  });
});
