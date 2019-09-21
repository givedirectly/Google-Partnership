const LOADING_TIMEOUT = 20000;

describe('Integration test for loading spinners', () => {
  it('Removes the loading overlay on page load', () => {
    cy.visit(host);

    cy.get('#mapContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '0');
    cy.get('#tableContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '0');
  });

  it('Adds and removes the loading overlay on update', () => {
    cy.visit(host);

    // Await page load.
    cy.get('#mapContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '0');
    cy.get('#tableContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '0');

    // Triggering two updates to ensure loading lasts long enough.
    cy.get('[id="damage threshold"]').clear().type('0.75');
    cy.get('[id="update"]').click();
    cy.get('[id="damage threshold"]').clear().type('0.8');
    cy.get('[id="update"]').click();

    // The loading overlay should be made opaque while the content is loading.
    cy.get('#mapContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '1');
    cy.get('#tableContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '1');
    // Once the content is rendered, these should be made transparent.
    cy.get('#mapContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '0');
    cy.get('#tableContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '0');
  });

  it('Adds and removes the loading overlay on scroll', () => {
    cy.visit(host);

    // Await map load.
    cy.get('#mapContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '0');

    // Zooming in twice to ensure loading lasts long enough.
    cy.get('.map').debug().click(620, 400).click(620, 400);

    // The loading overlay should be made opaque while the mapt is updating.
    cy.get('#mapContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '1');
    // Once the map is updated, the overlay should be made transparent.
    cy.get('#mapContainer-loader', {timeout: LOADING_TIMEOUT})
        .should('have.css', 'opacity').and('eq', '0');
  });
});
