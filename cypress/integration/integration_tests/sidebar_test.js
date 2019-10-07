import {initializeSidebar} from '../../../client-side/static/sidebar';

const SIDEBAR_MIN_WIDTH = '64px';

describe('Integration test for the sidebar', () => {
  beforeEach(() => {
    cy.visit(host);
    cy.awaitLoad();
    initializeSidebar();
  });

  it('enables toggling', () => {
    // The sidebar should be invisible to start.
    cy.get('[id="sidebar"]')
        .should('have.css', 'width').and('eq', SIDEBAR_MIN_WIDTH);
    cy.get('[id="sidebar-thresholds"]')
        .should('have.css', 'display').and('eq', 'none');
    cy.get('[id="sidebar-datasets"]')
        .should('have.css', 'display').and('eq', 'none');

    // The thresholds should appear on toggling.
    cy.get('[id="sidebar-toggle-thresholds"]').click();
    cy.get('[id="sidebar"]')
        .should('have.css', 'width').and('neq', SIDEBAR_MIN_WIDTH);
    cy.get('[id="sidebar-thresholds"]')
        .should('have.css', 'display').and('neq', 'none');
    cy.get('[id="sidebar-datasets"]')
        .should('have.css', 'display').and('eq', 'none');

    // The tresholds sidebar shhould disappear on toggling.
    cy.get('[id="sidebar-toggle-thresholds"]').click();
    cy.get('[id="sidebar"]')
        .should('have.css', 'width').and('eq', SIDEBAR_MIN_WIDTH);
    cy.get('[id="sidebar-thresholds"]')
        .should('have.css', 'display').and('neq', 'none');
    cy.get('[id="sidebar-datasets"]')
        .should('have.css', 'display').and('eq', 'none');

    // The datsets should appear on toggling.
    cy.get('[id="sidebar-toggle-datasets"]').click();
    cy.get('[id="sidebar"]')
        .should('have.css', 'width').and('neq', SIDEBAR_MIN_WIDTH);
    cy.get('[id="sidebar-thresholds"]')
        .should('have.css', 'display').and('eq', 'none');
    cy.get('[id="sidebar-datasets"]')
        .should('have.css', 'display').and('neq', 'none');

    // The tresholds sidebar shhould disappear on toggling.
    cy.get('[id="sidebar-toggle-thresholds"]').click();
    cy.get('[id="sidebar"]')
        .should('have.css', 'width').and('eq', SIDEBAR_MIN_WIDTH);
    cy.get('[id="sidebar-thresholds"]')
        .should('have.css', 'display').and('neq', 'none');
    cy.get('[id="sidebar-datasets"]')
        .should('have.css', 'display').and('eq', 'none');
  });
});
