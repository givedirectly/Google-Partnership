/**
 * This test relies on the FEMA damage data for Hurricane Harvey and the
 * starting thresholds of poverty 0.3 and damage 0.5
 */
describe('Integration test for clicking feature', () => {
  // Ensures that listeners are cleared when table instance and data
  // are updated.
  it('click highlights correct feature even after update', () => {
    cy.visit('');
    cy.awaitLoad();

    clickBlockGroup();
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
function clickBlockGroup() {
  cy.get('[placeholder="Search"]').clear().type('Greater Greenspoint{enter}');
  cy.wait(4000);
  cy.get('.map').click(900, 500);
}
