// Call this firebaseLibrary to avoid conflicting with mock firebase defined in
// commands.js.
const firebaseLibrary = require('firebase');

const hackyWaitTime = 1000;
const notes = 'Sphinx of black quartz, judge my vow';

// TODO(janakr): do test authentication separately. We should have a separate
// test account that writes to a test database, to avoid interacting with
// production data.
const firebaseConfig = {
  apiKey: 'AIzaSyAbNHe9B0Wo4MV8rm3qEdy8QzFeFWZERHs',
  authDomain: 'givedirectly.firebaseapp.com',
  databaseURL: 'https://givedirectly.firebaseio.com',
  projectId: 'givedirectly',
  storageBucket: '',
  messagingSenderId: '634162034024',
  appId: '1:634162034024:web:c5f5b82327ba72f46d52dd',
};

firebaseLibrary.initializeApp(firebaseConfig);
const db = firebaseLibrary.firestore();

const userShapes = db.collection('usershapes-test');

describe('Integration tests for drawing polygons', () => {
  // Delete all test-defined polygons, identified by their starting point. We
  // depend on the high probability that no real person will randomly click on
  // precisely this point.
  const deleteAllRegionsDrawnByTest = () =>
      // Return a wrapped promise. Cypress will wait for the promise to finish.
      cy.wrap(userShapes.get().then((querySnapshot) => {
        const deletePromises = [];
        querySnapshot.forEach((userDefinedRegion) => {
          const storedGeometry = userDefinedRegion.get('geometry');
          if (storedGeometry[0].latitude === 29.711705459174475) {
            deletePromises.push(userShapes.doc(userDefinedRegion.id).delete());
          }
        });
        return Promise.all(deletePromises);
      }));

  beforeEach(deleteAllRegionsDrawnByTest);

  afterEach(deleteAllRegionsDrawnByTest);

  it('Draws a polygon and edits its notes', () => {
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[id="notes"]').clear();
    cy.get('[id="notes"]').type(notes);
    pressPolygonButton('save');
    cy.get('.map').contains(notes);
  });

  it('Draws a polygon and deletes it', () => {
    // Accept confirmation when it happens.
    cy.on('window:confirm', () => true);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[id="notes"]').type(notes);
    pressPolygonButton('save');

    pressPolygonButton('delete');
    // Polygon should be gone.
    cy.get('.map').click(160, 200);
    assertExactlyPopUps(0, notes);
  });

  it('Draws a polygon and almost deletes it, then deletes', () => {
    // Reject confirmation when first happens, then accept it later.
    let confirmValue = false;
    cy.on('window:confirm', () => confirmValue);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[id="notes"]').type(notes);
    pressPolygonButton('save');
    pressPolygonButton('delete');
    // Assert still exists.
    clickOnDrawnPolygon();
    assertExactlyPopUps(1, notes);
    // TODO(#18): wait for a notification that all writes have completed instead
    // of a hardcoded wait.
    cy.wait(1000);
    cy.visit(host);
    cy.awaitLoad();
    // Polygon is still there.
    clickOnDrawnPolygon();
    assertExactlyPopUps(1, notes);

    pressPolygonButton('delete');
    // Polygon is still there.
    // Accept confirmation when it happens.
    clickOnDrawnPolygon().then(() => confirmValue = true);
    pressPolygonButton('delete');
    // Polygon should be gone.
    clickOnDrawnPolygon();
    assertExactlyPopUps(0, notes);
    cy.wait(1000);
    cy.visit(host);
    cy.awaitLoad();
    // Polygon is gone.
    clickOnDrawnPolygon();
    assertExactlyPopUps(0, notes);
  });
});

/** Visit page, draw a new polygon on the map, click inside it. */
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
  cy.wait(2000);
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
  return cy.get('.map').click(150, 200);
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
 * @param {Number} expectedFound how many divs with notes param expected
 * @param {String} notes contents to look for
 */
function assertExactlyPopUps(expectedFound, notes) {
  let foundElements = 0;
  cy.get('div')
      .each(($elt) => {
        if ($elt.html() === notes) {
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
}
