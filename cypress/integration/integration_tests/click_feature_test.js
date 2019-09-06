/**
 * This test relies on the FEMA damage data for Hurricane Michale and the
 * relevant starting thresholds.
 */
describe('Integration test for clicking feature', () => {
  it('clicks a feature in the list', () => {
    cy.visit(host);
    // Wait for table to fully load. Needed to ensure that layerMap is
    // populated.
    // TODO(#53): check for loading bar element to finish instead of waiting.
    cy.wait(4000);
    cy.get('.map').click(343, 184);
    cy.get(
        '[class="google-visualization-table-tr-odd' +
          ' google-visualization-table-tr-sel"]')
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
    cy.get(
        '[class="google-visualization-table-tr-odd' +
          ' google-visualization-table-tr-sel"]')
        .find('[class="google-visualization-table-td"]')
        .should('have.text', '482012511004');
  });
});
