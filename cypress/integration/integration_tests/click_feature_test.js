/**
 * This test relies on the FEMA damage data for Hurricane Michael and the
 * starting thresholds of poverty 0.3 and damage 0.5
 */
describe('Integration test for clicking feature', () => {
  it('clicks a feature on the map highlights feature in list', () => {
    cy.visit(host);
    // Wait for table to fully load. Needed to ensure that layerMap is
    // populated.
    // TODO(#53): check for loading bar element to finish instead of waiting.
    cy.wait(4000);
    cy.get('.map').click(343, 184);
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should('have.text', '482012511004');
  });

  it('click highlights correct feature even after resort', () => {
    cy.visit(host);
    // Wait for table to fully load. Needed to ensure that layerMap is
    // populated.
    // TODO(#53): check for loading bar element to finish instead of waiting.
    cy.wait(4000);
    // Sort by GEOID
    cy.get('.google-visualization-table-tr-head > :nth-child(1)').click();
    cy.get('.map').click(343, 184);
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should('have.text', '482012511004');
  });

  it.only('clicks a place where there is no damage -> no feature', () => {
    // https://github.com/cypress-io/cypress/issues/300#issuecomment-321587149
    // having a hard time asserting on what was logged though
    cy.window().then((win) => {cy.spy(win.console, 'log')});

    cy.visit(host);
    cy.wait(4000);
    cy.get('.map').click(25, 25);
  });
});
