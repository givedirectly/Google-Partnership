/**
 * This test relies on the FEMA damage data for Hurricane Michael and the
 * starting thresholds of poverty 0.3 and damage 0.5
 */
describe('Integration test for clicking feature', () => {
  it('clicks a feature on the map highlights feature in list', () => {
    cy.visit(host);
    cy.awaitLoad();

    clickAndVerifyBlockGroup();
  });

  it('clicks on a feature on the map, then unclicks it', () => {
    cy.visit(host);
    cy.awaitLoad();

    clickAndVerifyBlockGroup();
    // Not sure why this first click isn't registering but double click seems to
    // do the job.
    cy.get('.map').click(400, 600);
    cy.get('.map').click(400, 600);
    cy.get('.map').should(
        'not.contain',
        'Block Group 1, Census Tract 2309, Harris County, Texas');
  });

  it('clicks on a feature on the map, then clicks on another', () => {
    cy.visit(host);
    cy.awaitLoad();

    clickAndVerifyBlockGroup();
    // deselect

    cy.get('.map').click(250, 585);
    cy.get('.map').click(250, 585);
    // show first one is closed.
    cy.get('.map').should(
        'not.contain',
        'Block Group 1, Census Tract 2309, Harris County, Texas');
    cy.get('.map').should(
        'contain', 'Block Group 1, Census Tract 2405.02, Harris County, Texas');
  });

  it('click highlights correct feature even after resort', () => {
    cy.visit(host);
    cy.awaitLoad();

    // Sort descending by damage percentage
    cy.get('.google-visualization-table-tr-head > :nth-child(4)').click();
    cy.get('.google-visualization-table-tr-head > :nth-child(4)').click();
    clickAndVerifyBlockGroup();
  });

  it('clicks a place where there is no damage -> no feature', () => {
    cy.visit(host);
    cy.awaitLoad();

    cy.get('.map').click(200, 200);
    cy.get('.google-visualization-table-tr-sel').should('not.exist');
  });

  // Ensures that listeners are cleared when table instance and data
  // are updated.
  it('click highlights correct feature even after update', () => {
    cy.visit(host);
    cy.awaitLoad();

    clickAndVerifyBlockGroup();
    cy.get('#sidebar-toggle-thresholds').click();
    cy.get('[id="damage threshold"]').clear().type('0.7');
    cy.get('[id="update"]').click();
    cy.get('.google-visualization-table-tr-sel')
        .find('[class="google-visualization-table-td"]')
        .should(
            'have.text',
            'Block Group 4, Census Tract 2415, Harris County, Texas21681');
  });
});

/** Convenience function for clicking on the block group we use for testing. */
function clickAndVerifyBlockGroup() {
  cy.get('[placeholder="Search"]').clear().type('Aldine Estates{enter}');

  zoomOut(3);
  // These waits are embarrassing, but otherwise Travis fails flakily.
  cy.wait(2000);
  cy.get('.map').click(400, 600);
  cy.get('.map').should('contain', 'SCORE: 72');
  cy.get('.google-visualization-table-tr-sel')
      .find('[class="google-visualization-table-td"]')
      .should(
          'have.text',
          'Block Group 4, Census Tract 2415, Harris County, Texas21681');
}

/**
 * Helper function to zoom out some amount of times.
 * @param {number} numTimes
 */
function zoomOut(numTimes) {
  for (let i = 0; i < numTimes; i++) {
    cy.get('[title="Zoom out"]').click();
    cy.wait(500);
  }
}
