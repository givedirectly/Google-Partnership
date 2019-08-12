const host = 'http://localhost:8081/';
// Run via `yarn run cypress run`. Make sure you're using the right yarn!
describe(
    'Integration test',
    () => {it('Draws a polygon', () => {
      cy.visit(host);
      const polygonButton = cy.get('[title="Draw a shape"]');
      polygonButton.click();
      // Wait for polygon selection overlay to appear.
      // Fragile, but ensures that "clicking" layer is present.
      cy.get(
          'div[style*="cursor: url(\\"https://maps.gstatic.com/mapfiles/crosshair.cur\\") 7 7, crosshair;"]');
      drawPointAndPrepareForNext(50, 250, 0);
      drawPointAndPrepareForNext(400, 50);
      drawPointAndPrepareForNext(450, 150);
      drawPointAndPrepareForNext(50, 250);
      // Is the draggable edge present?
      cy.get('div[style*="left: -100px; top: -95px;"');
    });
  });

/**
 * Draws a point on the map and mouses over to simulate moving to the next one.
 *
 * @param {number} x x-coordinate of the point in Cypress's scheme.
 * @param {number} y y-coordinate of the point in Cypress's scheme.
 */
function drawPointAndPrepareForNext(x, y) {
  cy.get('.map').click(x, y);
  // mouse-over on map to simulate moving to next point seems necessary.
  cy.get('.map').trigger('mouseover');
}
