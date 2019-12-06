import {geoPointToLatLng} from '../../docs/map_util.js';

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
    div.id = 'test-map-div';
    div.style = 'height: 80%; width: 100%';
    document.body.appendChild(div);
    const map = new google.maps.Map(div, {center: {lat: 0, lng: 0}, zoom: 1});
    // Corresponds to zoom level 0.
    map.fitBounds(new google.maps.LatLngBounds(
        new google.maps.LatLng({lat: 0, lng: 0}),
        new google.maps.LatLng({lat: 1, lng: 1})));
    return map;
  });
}
