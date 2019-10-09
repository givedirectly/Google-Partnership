// Call this firebaseLibrary to avoid conflicting with mock firebase defined in
// commands.js.
import {startGet} from '../../../test/lib/test_support';
import {until} from 'selenium-webdriver';
import {expect} from 'chai';

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
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');
    cy.get('.map').contains(notes);
  });

  it('Draws a polygon and deletes it', () => {
    // Accept confirmation when it happens.
    cy.on('window:confirm', () => true);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');

    pressPolygonButton('delete');
    // Polygon should be gone.
    clickOnDrawnPolygon();
    assertExactlyPopUps(0, notes);
  });

  it('Draws a polygon and almost deletes it, then deletes', () => {
    // Reject confirmation when first happens, then accept it later.
    let confirmValue = false;
    cy.on('window:confirm', () => confirmValue);
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
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

  it('Draws a polygon, clicks it, closes its info box', () => {
    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');
    pressPolygonButton('close');
    // element is still there, just hidden
    assertExactlyPopUps(1, notes);
    cy.get('.map').contains(notes).should('not.be.visible');
  });

  it('Draws a polygon, almost closes while editing', () => {
    cy.on('window:confirm', () => false);

    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('close');
    pressPolygonButton('save');
    cy.get('#mapContainer').contains(notes).should('be.visible');
  });

  it('Draws a polygon, closes while editing', () => {
    cy.on('window:confirm', () => true);

    drawPolygonAndClickOnIt();
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type(notes);
    pressPolygonButton('save');
    pressPolygonButton('edit');
    cy.get('[class="notes"]').type('blahblahblah');
    pressPolygonButton('close');
    // element is still there, just hidden
    assertExactlyPopUps(1, notes);
    cy.get('#mapContainer').contains(notes).should('not.be.visible');
  });

  it('Tests hiding functionality', async () => {
    const driver = await driverPromise;
    startGet(driver);
    // Draw a polygon and verify that it goes away when box is unchecked.
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await assertNotesVisibleStatus(true, driver);
    await assertUserFeaturesCheckboxCheckedStatus(true, driver);
    await driver.findElement({id: 'user features-checkbox'}).click();
    await assertUserFeaturesCheckboxCheckedStatus(false, driver);
    await assertNotesVisibleStatus(false, driver);
    // Notes is invisible even if we click on the polygon, so it's really gone.
    // Use an offset because there's some weirdness around selecting block
    // groups that then suppress clicks.
    await clickOnDrawnPolygon(driver, -10);
    await assertNotesVisibleStatus(false, driver);

    // Check box again and verify that notes box can now be brought up.
    await driver.findElement({id: 'user features-checkbox'}).click();
    await assertUserFeaturesCheckboxCheckedStatus(true, driver);
    // Notes not visible yet.
    await assertNotesVisibleStatus(false, driver);
    await clickOnDrawnPolygon(driver);
    await assertNotesVisibleStatus(true, driver);

    // Try to hide user features in the middle of editing: will fail.
    await pressPolygonButton('edit', driver);
    await driver.findElement({id: 'user features-checkbox'})
        .click()
        .then(async () => {
          await driver.wait(until.alertIsPresent());
          await driver.switchTo().alert().accept();
        });
    await assertUserFeaturesCheckboxCheckedStatus(true, driver);
    // Confirm that save is still around to be pressed.
    await pressPolygonButton('save', driver);

    // After a save, the hide is successful.
    await driver.findElement({id: 'user features-checkbox'}).click();
    await assertUserFeaturesCheckboxCheckedStatus(false, driver);

    // With the box unchecked, draw a new polygon, below the first one, and set
    // its notes, but don't finish editing.
    await drawPolygonAndClickOnIt(driver, 50);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys('new notes');
    // Try to re-check the box. It will fail because we're editing.
    await driver.findElement({id: 'user features-checkbox'})
        .click()
        .then(async () => {
          await driver.wait(until.alertIsPresent());
          await driver.switchTo().alert().accept();
        });
    await assertUserFeaturesCheckboxCheckedStatus(false, driver);

    // Save the new notes and check the box, this time it succeeds.
    await pressPolygonButton('save', driver);
    await driver.findElement({id: 'user features-checkbox'}).click();
    await assertUserFeaturesCheckboxCheckedStatus(true, driver);

    // We can click on the old polygon and view its notes,
    await clickOnDrawnPolygon(driver);
    await assertNotesVisibleStatus(true, driver, notes);
    // And the new polygon and view its notes.
    await clickOnDrawnPolygon(driver, 50);
    await assertNotesVisibleStatus(true, driver, 'new notes');

    // Now hide both polygons, and verify that they're really gone.
    await driver.findElement({id: 'user features-checkbox'}).click();
    await assertUserFeaturesCheckboxCheckedStatus(false, driver);
    await assertNotesVisibleStatus(false, driver, notes);
    await assertNotesVisibleStatus(false, driver, 'new notes');
    await clickOnDrawnPolygon(driver, 50);
    await assertNotesVisibleStatus(false, driver, 'new notes');
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
  drawPointAndPrepareForNext(150, 250);
  // TODO(janakr): test seems to fail reliably on command line without these
  // and pass with it. Figure out what to actually test for on the page and
  // remove these waits.
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(400, 50);
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(450, 150);
  cy.wait(hackyWaitTime);
  drawPointAndPrepareForNext(150, 250);
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
  return cy.get('.map').click(150, 250);
}

/**
 * Clicks a button inside the map with the given id.
 * @param {string} button id of html button we want to click
 */
function pressPolygonButton(button) {
  cy.get('#mapContainer').contains(button).click();
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

/**
 * Asserts that the given notes have the given visibility.
 *
 * @param {boolean} visible
 * @param {WebDriver} driver
 * @param {string} expectedNotes defaults to the global notes
 */
async function assertNotesVisibleStatus(
    visible, driver, expectedNotes = notes) {
  const value =
      await driver.findElement({xpath: '//div[.="' + expectedNotes + '"]'})
          .isDisplayed();
  expect(value).to.eq(visible);
}

/**
 * Asserts that the user features checkbox is checked or not.
 *
 * @param {boolean} checked
 * @param {WebDriver} driver
 */
async function assertUserFeaturesCheckboxCheckedStatus(checked, driver) {
  const status =
      await driver.findElement({id: 'user features-checkbox'}).isSelected();
  expect(status).to.equal(checked);
}
