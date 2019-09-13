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
    cy.wait(4500);
    cy.get('.map').click(343, 184);
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should(
            'have.text',
            'Block Group 4, Census Tract 2511, Harris County, Texas');
  });

  it('click highlights correct feature even after resort', () => {
    cy.visit(host);
    // Wait for table to fully load. Needed to ensure that layerMap is
    // populated.
    // TODO(#53): check for loading bar element to finish instead of waiting.
    cy.wait(4500);
    // Sort descending by damage percentage
    cy.get('.google-visualization-table-tr-head > :nth-child(4)').click();
    cy.get('.google-visualization-table-tr-head > :nth-child(4)').click();

    cy.get('.map').click(343, 184);
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should(
            'have.text',
            'Block Group 4, Census Tract 2511, Harris County, Texas');
  });

  it('clicks a place where there is no damage -> no feature', () => {
    cy.visit(host);
    cy.wait(4500);
    cy.get('.map').click(25, 25);
    cy.get('.google-visualization-table-tr-sel').should('not.exist');
  });

  // Ensures that listeners are cleared when table instance and data
  // are updated.
  it('click highlights correct feature even after update', () => {
    cy.visit(host);
    cy.wait(4500);
    cy.get('.map').click(343, 184);
    cy.get('[id="damage threshold"]').type('0.9');
    cy.get('[id="update"]').click();
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should(
            'have.text',
            'Block Group 4, Census Tract 2511, Harris County, Texas');
  });
});
