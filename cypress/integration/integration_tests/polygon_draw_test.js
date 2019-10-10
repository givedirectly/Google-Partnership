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

// This test generally doesn't wait for the page to load, since that's not
// necessary to draw polygons.
describe('Integration tests for drawing polygons', () => {
  // Delete all test-defined polygons.
  const deleteAllRegionsDrawnByTest = () => {
    const userShapes = db.collection('usershapes-test/' + testCookieValue);
    // Return a wrapped promise. Cypress will wait for the promise to finish.
    cy.wrap(userShapes.get().then((querySnapshot) => {
      const deletePromises = [];
      querySnapshot.forEach((userDefinedRegion) => {
        deletePromises.push(userShapes.doc(userDefinedRegion.id).delete());
      });
      return Promise.all(deletePromises);
    }));
  };

  beforeEach(deleteAllRegionsDrawnByTest);

  afterEach(deleteAllRegionsDrawnByTest);

  it('Draws a polygon and edits its notes', () => {
    cy.visit(host);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('.map').contains('damage count: 64197');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');
    cy.wait(2000);

    cy.get('.map').contains(notes);
  });

  it('Draws a polygon and deletes it', () => {
    // Accept confirmation when it happens.
    cy.on('window:confirm', () => true);
    cy.visit(host);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');
    cy.wait(2000);

    pressPolygonButton('delete');
    // Polygon should be gone.
    clickOnDrawnPolygon();
    assertExactlyPopUps(0, notes);
  });

  it('Draws a polygon and almost deletes it, then deletes', () => {
    // Reject confirmation when first happens, then accept it later.
    let confirmValue = false;
    cy.on('window:confirm', () => confirmValue);
    cy.visit(host);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');
    cy.wait(2000);

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

  it('Draws a polygon, clicks it, closes its info box', () => {
    cy.visit(host);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');
    cy.wait(2000);

    pressPolygonButton('close');
    // element is still there, just hidden
    assertExactlyPopUps(1, notes);
    cy.get('.map').contains(notes).should('not.be.visible');
  });

  it('Draws a polygon, almost closes while editing', () => {
    cy.on('window:confirm', () => false);

    cy.visit(host);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('close');
    pressPolygonButton('save');
    cy.wait(2000);

    cy.get('#mapContainer').contains(notes).should('be.visible');
  });

  it('Draws a polygon, closes while editing', () => {
    cy.on('window:confirm', () => true);

    cy.visit(host);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');
    cy.wait(2000);

    // cy.wait(3000);
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type('blahblahblah');
    pressPolygonButton('close');
    // element is still there, just hidden
    assertExactlyPopUps(1, notes);
    cy.get('#mapContainer').contains(notes).should('not.be.visible');
  });

  it('Hides polygon, re-shows, tries to hide during edit', () => {
    cy.visit(host);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');
    cy.wait(2000);

    cy.get('#mapContainer').contains(notes).should('be.visible');
    cy.get('#user-features-checkbox').should('be.checked');
    cy.get('#user-features-checkbox').click();
    cy.get('#mapContainer').contains(notes).should('not.be.visible');
    // Notes is invisible even if we click on the polygon, so it's really gone.
    // Use an offset because there's some weirdness around selecting block
    // groups that then suppress clicks.
    clickOnDrawnPolygon(-50);
    cy.get('#mapContainer').contains(notes).should('not.be.visible');

    // Check box again and verify that notes box can now be brought up.
    cy.get('#user-features-checkbox').click();
    cy.get('#user-features-checkbox').should('be.checked');
    // Notes not visible yet.
    cy.get('#mapContainer').contains(notes).should('not.be.visible');
    clickOnDrawnPolygon();
    cy.get('#mapContainer').contains(notes).should('be.visible');

    // Try to hide user features in the middle of editing: will fail.
    pressPolygonButton('edit');
    let alertCameUp = false;
    cy.on('window:alert', () => alertCameUp = true);
    cy.get('#user-features-checkbox').click().then(() => {
      expect(alertCameUp).to.be.true;
    });
    cy.get('#user-features-checkbox').should('be.checked');
    // Confirm that save is still around to be pressed.
    pressPolygonButton('save');
    cy.wait(2000);


    // After a save, the hide is successful.
    cy.get('#user-features-checkbox').click();
    cy.get('#user-features-checkbox').should('not.be.checked');
  });

  it('Hides, draws new one, tries to hide during edit, re-shows, hides', () => {
    cy.visit(host);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');
    cy.wait(2000);

    cy.get('#user-features-checkbox').click();
    cy.get('#user-features-checkbox').should('not.be.checked');
    // With the box unchecked, draw a new polygon, below the first one, and set
    // its notes, but don't finish editing.
    drawPolygonAndClickOnIt(200);
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type('new notes');
    // Try to re-check the box. It will fail because we're editing.
    let alertCameUp = false;
    cy.on('window:alert', () => alertCameUp = true);
    cy.get('#user-features-checkbox').click().then(() => {
      expect(alertCameUp).to.be.true;
    });
    cy.get('#user-features-checkbox').should('not.be.checked');

    // Save the new notes and check the box, this time it succeeds.
    pressPolygonButton('save');
    cy.wait(2000);

    cy.get('#user-features-checkbox').click();
    cy.get('#user-features-checkbox').should('be.checked');

    // We can click on the old polygon and view its notes,
    clickOnDrawnPolygon();
    cy.get('#mapContainer').contains(notes).should('be.visible');
    // And the new polygon and view its notes.
    clickOnDrawnPolygon(200);
    cy.get('#mapContainer').contains('new notes').should('be.visible');

    // Now hide both polygons, and verify that they're really gone.
    cy.get('#user-features-checkbox').click();
    cy.get('#user-features-checkbox').should('not.be.checked');
    cy.get('#mapContainer').contains(notes).should('not.be.visible');
    cy.get('#mapContainer').contains('new notes').should('not.be.visible');
    clickOnDrawnPolygon(200);
    cy.get('#mapContainer').contains('new notes').should('not.be.visible');
  });
});

/**
 * Draws a new polygon on the map, clicks inside it.
 *
 * @param {number} offset Shift polygon down this many pixels
 */
function drawPolygonAndClickOnIt(offset = 0) {
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
  drawPointAndPrepareForNext(150, 250 + offset);
  // TODO(janakr): test seems to fail reliably on command line without these
  // and pass with it. Figure out what to actually test for on the page and
  // remove these waits.
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(400, 100 + offset);
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(450, 250 + offset);
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(150, 250 + offset);
  const handButton = cy.get('[title="Stop drawing"]');
  handButton.click();
  cy.wait(500);
  // click to trigger pop up.
  clickOnDrawnPolygon(offset);
}

/**
 * Click on the map inside the test-drawn polygon to trigger a pop-up if it's
 * there. Returns the result for chaining.
 *
 * @param {number} offset Shift click down this many pixels
 * @return {Cypress.Chainable}
 */
function clickOnDrawnPolygon(offset = 0) {
  return cy.get('.map').click(300, 220 + offset);
}

/**
 * Clicks a visible button inside the map with the given id.
 * @param {string} button id of html button we want to click
 */
function pressPolygonButton(button) {
  cy.get(':button:visible').contains(button).click();
}

/**
 * Asserts that a div with innerHtml notes is found exactly
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
