/**
 * This test relies on the FEMA damage data for Hurricane Michael and the
 * starting thresholds of poverty 0.3 and damage 0.5
 */
describe('Integration test for clicking feature', () => {
  it('clicks a feature on the map highlights feature in list', () => {
    cy.visit(host);
    cy.awaitLoad();

    cy.get('.map').click(528, 624);
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should(
            'have.text',
            'Block Group 1, Census Tract 2525, Harris County, Texas32574');
  });

  it('clicks on a feature on the map, then unclicks it', () => {
    cy.visit(host);
    cy.awaitLoad();

    zoom(3);
    cy.get('.map').click(473, 240);
    cy.get('.map').should(
        'contain', 'Block Group 1, Census Tract 2404, Harris County, Texa');

    // Not sure why this first click isn't registering but double click seems to
    // do the job.
    cy.get('.map').click(475, 250);
    cy.get('.map').click(474, 250);
    cy.get('.map').should(
        'not.contain', 'Block Group 1, Census Tract 2404, Harris County, Texa');
  });

  it('clicks on a feature on the map, then clicks on another', () => {
    cy.visit(host);
    cy.awaitLoad();

    zoom(3);
    cy.get('.map').click(473, 240);
    cy.get('.map').should('contain', 'SCORE: 0');
    cy.get('.map').should(
        'contain', 'Block Group 1, Census Tract 2404, Harris County, Texa');

    // deselect
    cy.get('.map').click(783, 270);
    cy.get('.map').click(783, 270);
    // show first one is closed.
    cy.get('.map').should(
        'not.contain', 'Block Group 1, Census Tract 2404, Harris County, Texa');
  });

  it('click highlights correct feature even after resort', () => {
    cy.visit(host);
    cy.awaitLoad();

    // Sort descending by damage percentage
    cy.get('.google-visualization-table-tr-head > :nth-child(4)').click();
    cy.get('.google-visualization-table-tr-head > :nth-child(4)').click();

    cy.get('.map').click(528, 624);
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should(
            'have.text',
            'Block Group 1, Census Tract 2525, Harris County, Texas32574');
  });

  it('clicks a place where there is no damage -> no feature', () => {
    cy.visit(host);
    cy.awaitLoad();

    cy.get('.map').click(25, 25);
    cy.get('.google-visualization-table-tr-sel').should('not.exist');
  });

  // Ensures that listeners are cleared when table instance and data
  // are updated.
  it('click highlights correct feature even after update', () => {
    cy.visit(host);
    cy.awaitLoad();

    cy.get('.map').click(528, 624);
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should(
            'have.text',
            'Block Group 1, Census Tract 2525, Harris County, Texas32574');
    cy.get('#sidebar-toggle-thresholds').click();
    cy.get('[id="damage threshold"]').type('0.8');
    cy.get('[id="update"]').click();
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should(
            'have.text',
            'Block Group 1, Census Tract 2525, Harris County, Texas32574');
  });
});

/**
 * Helper function to zoom some amount of times.
 * @param {Integer} numTimes
 */
function zoom(numTimes) {
  for (let i = 0; i < numTimes; i++) {
    cy.get('[title="Zoom in"]').click();
    cy.wait(200);
  }
}
