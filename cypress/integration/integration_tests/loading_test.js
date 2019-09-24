describe('Integration test for loading overlays', () => {
  beforeEach(() => {
    cy.visit(host);
    cy.awaitLoad();
  });

  it('Adds and removes the loading overlay on update', () => {
    // Triggering two updates to ensure loading lasts long enough.
    cy.get('[id="damage threshold"]').clear().type('0.75');
    cy.get('[id="update"]').click();
    cy.get('[id="damage threshold"]').clear().type('0.8');
    cy.get('[id="update"]').click();

    cy.awaitLoad();
  });

  it('Adds and removes the loading overlay on scroll', () => {
    // Zooming in twice to ensure loading lasts long enough.
    cy.get('.map').debug().click(620, 400).click(620, 400);

    cy.awaitLoad(['mapContainer']);
  });
});
