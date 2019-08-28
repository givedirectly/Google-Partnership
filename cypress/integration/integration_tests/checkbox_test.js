/**
 * Checks that submitting a threshold change automatically checks the priority
 * checkbox (since it automatically reshows the priority layer).
 */
describe('Integration test', () => {
  it('Checks threshold update checks priority box', () => {
    cy.visit(host);

    // Wait for page to fully load. Needed to ensure that layerMap is populated.
    // TODO(#53): check for loading bar element to finish instead of waiting.
    cy.wait(500);
    cy.get('#priority').uncheck();

    cy.get('#p-threshold').type('1.0');
    cy.get('#pt-button').click();

    // Wait for update.
    // TODO(#53): check for loading bar element to finish instead of waiting.
    cy.wait(200);

    cy.get('#priority').should('be.checked');
  });
});
