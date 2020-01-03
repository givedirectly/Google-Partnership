const hackyWaitTime = 2000;
const notes = 'Sphinx of black quartz, judge my vow';

// Most tests should be added to unit_tests/polygon_draw_test.js, since it's
// much faster.

// This test doesn't wait for the page to load, since that's not necessary to
// draw polygons.
describe('Integration tests for drawing polygons', () => {
  it('User features checkbox works', () => {
    cy.visit('');
    drawPolygonAndClickOnIt();
    pressPopupButton('edit');
    cy.get('.notes').type(notes);
    saveAndAwait();
    cy.get('#sidebar-toggle-datasets').click();
    cy.get('#mapContainer').contains(notes).should('be.visible');
    cy.get('#layer-user-features-checkbox').click();
    cy.get('#layer-user-features-checkbox').should('not.be.checked');
    cy.get('#mapContainer').contains(notes);
    cy.get('#mapContainer').contains(notes).should('not.be.visible');
    cy.get('#layer-user-features-checkbox').click();
    cy.get('#layer-user-features-checkbox').should('be.checked');
    cy.get('#mapContainer').contains(notes).should('not.be.visible');
    clickOnDrawnPolygon();
    cy.get('#mapContainer').contains(notes).should('be.visible');
  });

  it('Degenerate polygon with one vertex not allowed', () => {
    cy.visit('');
    startDrawing();
    drawPointAndPrepareForNext(400, 400);
    let alertShown = false;
    cy.on('window:alert', () => alertShown = true);
    cy.get('[title="Stop drawing"]')
        .click()
        .then(() => expect(alertShown).to.be.true);
    // Assert there is no edit button, even invisible, showing that polygon was
    // not drawn.
    cy.get(':button').each(($elt) => expect($elt.html()).to.not.eql('edit'));
  });
});

/**
 * Draws a new polygon on the map, clicks inside it.
 *
 * @param {number} offset Shift polygon down this many pixels
 */
function drawPolygonAndClickOnIt() {
  startDrawing();
  // Wait for polygon selection overlay to appear.
  // Fragile, but ensures that "clicking" layer is present.
  // Explanation of string: 'div' means we're searching for elements that are
  // divs. The [] indicate we're searching for an attribute of these elements.
  // 'style' means that we are inspecting the style attribute in particular.
  // The '*=' means we're searching for a substring, as opposed to the full
  // attribute (contrast the 'title=' in startDrawing). The remainder of the
  // string was derived by inspecting the page after starting to draw a polygon.
  cy.get(
      'div[style*="cursor: url(\\"https://maps.gstatic.com/mapfiles/crosshair.cur\\") 7 7, crosshair;"]');
  // Without this, seeing flaky failures on Travis where first point is off map.
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(150, 650);
  // TODO(janakr): test seems to fail reliably on command line without these
  // and pass with it. Figure out what to actually test for on the page and
  // remove these waits.
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(400, 500);
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(450, 650);
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(425, 750);
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(150, 650);
  const handButton = cy.get('[title="Stop drawing"]');
  handButton.click();
  cy.wait(hackyWaitTime);
  // click to trigger pop up.
  clickOnDrawnPolygon();
}

/**
 * Click on the map inside the test-drawn polygon to trigger a pop-up if it's
 * there. Returns the result for chaining.
 *
 * @return {Cypress.Chainable}
 */
function clickOnDrawnPolygon() {
  return cy.get('.map').click(300, 620);
}

/**
 * Clicks a visible button inside the map with the given id.
 * @param {string} button id of html button we want to click
 */
function pressPopupButton(button) {
  cy.get('.main-content').scrollTo(0, 0);
  cy.get(':button:visible').contains(button).click();
}

/**
 * Clicks on point and checks that point is drawn.
 *
 * @param {number} x x-coordinate of the point in Cypress's scheme.
 * @param {number} y y-coordinate of the point in Cypress's scheme.
 */
function drawPointAndPrepareForNext(x, y) {
  cy.get('.map').click(x, y);
}

/**
 * Helper function that presses save button and then asserts we waited for a
 * write.
 */
function saveAndAwait() {
  pressPopupButton('save');
  // Give some extra time for Firestore write to complete.
  cy.get('#snackbar', {timeout: 15000}).contains('Saved');
}

/**
 * Clicks on the "Draw a shape" button on map. Waits longer than usual for it to
 * be found because it requires Firebase authentication to finish. Forces the
 * click because page may still be loading, causing "animation".
 */
function startDrawing() {
  cy.get('[title="Draw a shape"]', {timeout: 20000}).click({force: true});
}
