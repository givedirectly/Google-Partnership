export {createGoogleMap};

/**
 * Visits empty page (to empty out document), then creates and returns a Map.
 * @return {Cypress.Chainable<google.maps.Map>} for use in a test
 */
function createGoogleMap() {
  // Visit a blank page first to clear out any prior page state.
  cy.visit('test_utils/empty.html');
  return cy.document().then((document) => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    return new google.maps.Map(div, {center: {lat: 0, lng: 0}, zoom: 1});
  });
}
