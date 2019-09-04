/**
 * Checks that submitting a threshold change automatically checks the score
 * checkbox (since it automatically reshows the score layer).
 */
describe('Integration test', () => {
  it('Checks threshold update checks score box', () => {
    cy.visit(host);

    // Wait for page to fully load. Needed to ensure that layerMap is populated.
    // TODO(#53): check for loading bar element to finish instead of waiting.
    cy.wait(500);
    cy.get('#score').uncheck();

    cy.get('#threshold').type('1.0');
    cy.get('#update-button').click();

    // Wait for update.
    // TODO(#53): check for loading bar element to finish instead of waiting.
    cy.wait(200);

    cy.get('#score').should('be.checked');
  });
});
