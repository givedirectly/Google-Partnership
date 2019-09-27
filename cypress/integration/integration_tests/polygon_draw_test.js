const hackyWaitTime = 1000;
const notes = 'Sphinx of black quartz, judge my vow';

describe('Integration tests for drawing polygons', () => {
  it('Draws a polygon and deletes it', () => {
    // Accept confirmation when it happens.
    cy.on('window:confirm', () => true);
    drawPolygonAndClickOnIt();
    pressPolygonButton('delete');
    // Polygon should be gone.
    cy.get('div[style*="left: -100px; top: -95px;"').should('not.exist');
  });

  it('Draws a polygon and almost deletes it', () => {
    // Reject confirmation when it happens.
    cy.on('window:confirm', () => false);
    drawPolygonAndClickOnIt();
    pressPolygonButton('delete');
    // Assert still exists.
    cy.get('div[style*="left: -100px; top: -95px;"');
  });

  it('Draws a polygon and edits its notes', () => {
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[id="notes"]').clear();
    cy.get('[id="notes"]').type(notes);
    pressPolygonButton('save');
    cy.get('.map').contains(notes);
  });

  it('Clicks on a region and edits notes locally', () => {
    cy.visit(host);
    cy.wait(hackyWaitTime);

    clickInsideKnownRegion();
    cy.get('.map').contains('second notes');
    pressPolygonButton('edit');
    cy.get('[id="notes"]').clear();
    cy.get('[id="notes"]').type(notes);
    pressPolygonButton('save');
    cy.get('.map').contains(notes);
  });

  it('Clicks on region and deletes polygon locally', () => {
    cy.visit(host);
    cy.wait(hackyWaitTime);

    // Experimented to find point on map within second triangle.
    clickInsideKnownRegion();
    cy.get('.map').contains('second notes');
    // Click again. Wait a little bit because it seems like without the wait
    // the page may not register the second click?
    cy.wait(hackyWaitTime);
    clickInsideKnownRegion();
    // Make sure that even though we clicked twice, there's only one pop-up.
    assertExactlyPopUps(1);
    // TODO(janakr): Why does Cypress claim to find two identical buttons?
    cy.get('button[title="Close"]').first().click();
    assertExactlyPopUps(0);
    clickInsideKnownRegion();
    cy.get('.map').contains('second notes');
    // Accept confirmation when it happens.
    cy.on('window:confirm', () => true);
    pressPolygonButton('delete');
    clickInsideKnownRegion();
    // Make sure that no pop-up, implying polygon is gone.
    assertExactlyPopUps(0);
  });
});

/** Click inside the known polygon we have stored in firestore. */
function clickInsideKnownRegion() {
  cy.get('.map').click(447, 250);
}

/** Visit page, draw a new polygon on the map, and press its delete button. */
function drawPolygonAndClickOnIt() {
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
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(400, 50);
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(450, 150);
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(50, 250);
  const handButton = cy.get('[title="Stop drawing"]');
  handButton.click();
  // Check draggable edge present, and click it to trigger pop-up.
  cy.get('div[style*="left: -100px; top: -95px;"').click();
}

/**
 * Clicks a button inside the map with the given id.
 * @param {string} button id of html button we want to click
 */
function pressPolygonButton(button) {
  cy.get('#mapContainer').contains(button).click();
}

/**
 * Asserts that a div with innerHtml 'second notes' is found exactly
 * expectedFound times. Cypress' normal #contains() function doesn't count
 * occurrences, and can't be used to assert there are no matches, and Cypress'
 * #get() function doesn't allow selecting on contents.
 *
 * @param {Number} expectedFound how many divs with content 'second notes' are
 *             expected
 */
function assertExactlyPopUps(expectedFound) {
  let foundElements = 0;
  cy.get('div')
      .each(($elt) => {
        if ($elt.html() === 'second notes') {
          expect(foundElements++).to.equal(0);
        }
      })
      .then(() => expect(foundElements).to.equal(expectedFound));
}

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
  cy.get(
      'div[style*="left: ' + (x - 325) + 'px; top: ' + (y - 245) + 'px;"',
      {timeout: 2000});
}
