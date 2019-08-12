const host = 'http://localhost:8080/';
// Run via `yarn run cypress run`. Make sure you're using the right yarn!
describe('Integration test', () => {
  it('Draws a polygon', () => {
    cy.visit(host);
    const polygonButton = cy.get('[title="Draw a shape"]');
    polygonButton.click();
    // Wait for polygon selection overlay to appear.
    // Fragile, but ensures that "clicking" layer is present.
    // Explanation of string: 'div' means we're searching for elements that are
    // divs. The [] indicate we're searching for an attribute of these elements.
    // 'style' means that we are inspecting the style attribute in particular.
    // The '*=' means we're searching for a substring, as opposed to the full
    // attribute (contrast the 'title=' above). The remainder of the string was
    // derived by inspecting the page after starting to draw a polygon.
    cy.get(
        'div[style*="cursor: url(\\"https://maps.gstatic.com/mapfiles/crosshair.cur\\") 7 7, crosshair;"]');
    drawPointAndPrepareForNext(50, 250);
    // TODO(janakr): test seems to fail reliably on command line without these
    // and pass with it. Figure out what to actually test for on the page and
    // remove these waits.
    cy.wait(200);
    drawPointAndPrepareForNext(400, 50);
    cy.wait(200);
    drawPointAndPrepareForNext(450, 150);
    drawPointAndPrepareForNext(50, 250);
    // Is the draggable edge present?
    cy.get('div[style*="left: -100px; top: -95px;"');
  });
});

/**
 * Clicks on point and checks that point is drawn.
 *
 * @param {number} x x-coordinate of the point in Cypress's scheme.
 * @param {number} y y-coordinate of the point in Cypress's scheme.
 */
function drawPointAndPrepareForNext(x, y) {
  // TODO(janakr): delete these lines or uncomment them if they're needed.
  // mouse-move on map to simulate moving to next point might be necessary?
  // const clientX = x + 5;
  // const clientY = y + 81;
  // cy.get('.map').trigger('mousemove', {clientX: clientX, clientY: clientY});
  cy.get('.map').click(x, y);
  // Ensure that element from click is present.
  cy.get('div[style*="left: ' + (x - 325) + 'px; top: ' + (y - 245) + 'px;"');
}
