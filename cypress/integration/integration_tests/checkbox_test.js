/**
 * Checks that submiting a threshold change automatically checks the priority
 * checkbox (since it automatically reshows the priority layer).
 */
describe('Integration test', () => {
  it('Checks threshold update checks priority box', () => {
    cy.visit(host);

    // Wait for page to fully load. Needed to ensure that layerMap is populated.
    cy.wait(500);
    cy.get('#priority').uncheck();

    cy.get('#threshold').type('1.0');
    cy.get('#update-button').click();

    // Wait for update.
    // TODO: implement loading element and replace this with a find for that.
    cy.wait(200);

    cy.get('#priority').should('be.checked');
  });
});
