const host = 'http://localhost:8081/';
// Run via `yarn run cypress run`. Make sure you're using the right yarn!
describe('Integration test',() => {
  // it('Opens the page', () => {
  //   cy.visit(host);
  // });
  it('Draws a polygon', () => {
    cy.visit(host);
    const polygonButton = cy.get('[title="Draw a shape"]');
    polygonButton.click();
    // Wait for polygon selection overlay to appear.
    // Fragile, but ensures that "clicking" layer is present.
    cy.get('div[style*="cursor: url(\\"https://maps.gstatic.com/mapfiles/crosshair.cur\\") 7 7, crosshair;"]');
    drawPointAndWait(50, 250, 0);
    drawPointAndWait(400, 50);
    drawPointAndWait(450, 150);
    // This last wait won't actually wait because it's the first point on the
    // map, so we verify that there's a drag node present.
    drawPointAndWait(50, 250);
    cy.get('div[style*="left: -100px; top: -95px;"');
  })
});

function drawPointAndWait(x, y) {
  cy.get('.map').click(x, y);
  // cy.wait(200);
  cy.get('div[style*="left: ' + (x - 325) + 'px; top: ' + (y - 245) + 'px;"');
}
