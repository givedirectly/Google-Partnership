import * as firebase from 'firebase';
import {until} from 'selenium-webdriver';
const util = require('util');
const fs = require('fs');
const writeFile = util.promisify(fs.writeFile);

function takeScreenshot(driver, file){
  return driver.takeScreenshot()
      .then(image => writeFile(file, image, 'base64'));
}

import {randomString, setTimeouts, startGet} from '../lib/test_support.js';

const hackyWaitTime = 200;
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

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

describe('Integration tests for drawing polygons', function() {
  const testCookieValue = randomString();
  // Don't wait for the load, we don't need it for drawing polygons.
  const driverPromise = setUp(this, testCookieValue);
  const userShapes = db.collection('usershapes-test-' + testCookieValue);
  // Delete all polygons in the test database.
  const deleteAllRegionsInDatabase = async () => {
    await userShapes.get().then((querySnapshot) => {
      const deletePromises = [];
      querySnapshot.forEach((userDefinedRegion) => {
        deletePromises.push(userShapes.doc(userDefinedRegion.id).delete());
      });
      Promise.all(deletePromises);
    });
  };

  beforeEach(deleteAllRegionsInDatabase);
  afterEach(deleteAllRegionsInDatabase);
  // Shut down Firebase library to avoid hanging after test.
  after(() => firebase.app().delete());

  it('Draws a polygon and edits its notes', async () => {
    const driver = await driverPromise;
    startGet(driver);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await driver.findElement({xpath: '//div[.="' + notes + '"]'});
  });

  it('Draws a polygon and deletes it', async () => {
    const driver = await driverPromise;
    startGet(driver);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await pressPolygonButtonAndReactToConfirm('delete', true, driver);
    // Polygon should be gone.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(0, notes, driver);
  });

  it('Draws a polygon and almost deletes it, then deletes', async () => {
    const driver = await driverPromise;
    const getPromise = startGet(driver);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await pressPolygonButtonAndReactToConfirm('delete', false, driver);
    // Assert still exists.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(1, notes, driver);
    // TODO(#18): wait for a notification that all writes have completed instead
    // of a hardcoded wait.
    await driver.sleep(1000);
    // Make sure page started loading, at least.
    await getPromise;
    await loadPage(driverPromise);
    // Polygon is still there.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(1, notes, driver);

    await pressPolygonButtonAndReactToConfirm('delete', false, driver);
    // Polygon is still there.
    await clickOnDrawnPolygon(driver);
    await pressPolygonButtonAndReactToConfirm('delete', true, driver);
    // Polygon should be gone.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(0, notes, driver);
    await driver.sleep(1000);
    await loadPage(driverPromise);
    // Polygon is gone.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(0, notes, driver);
  });

  it('Draws a polygon, clicks it, closes its info box', async () => {
    const driver = await driverPromise;
    startGet(driver);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await pressPolygonButton('close', driver);
    // element is still there, just hidden
    await assertExactlyPopUps(1, notes, driver);
    const isVisible =
        await driver.findElement({xpath: '//div[.="' + notes + '"]'})
            .isDisplayed();
    expect(isVisible).to.be.false;
  });

  it('Draws a polygon, almost closes while editing', async () => {
    const driver = await driverPromise;
    startGet(driver);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys(notes);
    await pressPolygonButtonAndReactToConfirm('close', false, driver);
    await pressPolygonButton('save', driver);
    const isVisible =
        await driver.findElement({xpath: '//div[.="' + notes + '"]'})
            .isDisplayed();
    expect(isVisible).to.be.true;
  });

  it('Draws a polygon, closes while editing', async () => {
    const driver = await driverPromise;
    startGet(driver);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys('blahblahblah');
    await pressPolygonButtonAndReactToConfirm('close', true, driver);
    // element is still there, just hidden
    await assertExactlyPopUps(1, notes, driver);
    const isVisible =
        await driver.findElement({xpath: '//div[.="' + notes + '"]'})
            .isDisplayed();
    expect(isVisible).to.be.false;
  });

  it('Tests hiding functionality', async () => {
    const driver = await driverPromise;
    startGet(driver);
    // const driver = await loadPage(driverPromise);
    // Draw a polygon and verify that it goes away when box is unchecked.
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys(notes);
    await pressPolygonButton('save', driver);
    console.log('saved');
    await assertNotesVisibleStatus(true, driver);
    console.log('visible');
    const beforeClick1 =
        await driver.findElement({id: 'user features-checkbox'}).isSelected();
    expect(beforeClick1).to.be.true;
    await driver.findElement({id: 'user features-checkbox'}).click();
    await assertUserFeaturesCheckboxCheckedStatus(driver, false);
    await assertNotesVisibleStatus(false, driver);
    // Notes is invisible even if we click on the polygon, so it's really gone.
    // Use an offset because there's some weirdness around selecting block
    // groups that then suppress clicks.
    await clickOnDrawnPolygon(driver, -10);
    await assertNotesVisibleStatus(false, driver);

    // Check box again and verify that notes box can now be brought up.
    await driver.findElement({id: 'user features-checkbox'}).click();
    await assertUserFeaturesCheckboxCheckedStatus(driver, true);
    // Notes not visible yet.
    await assertNotesVisibleStatus(false, driver);
    // await driver.findElement({css: '[title="Add a marker"]'}).click();
    await clickOnDrawnPolygon(driver);
    console.log('new saved');
    try {
      await assertNotesVisibleStatus(true, driver);
    } catch (err) {
      await takeScreenshot(driver, 'screenshot.png');
      throw err;
    }
    console.log('now visible');

    // Try to hide user features in the middle of editing: will fail.
    await pressPolygonButton('edit', driver);
    await driver.findElement({id: 'user features-checkbox'}).click()
        .then(async () => {
          await driver.wait(until.alertIsPresent());
          await driver.switchTo().alert().accept();
        });
    await assertUserFeaturesCheckboxCheckedStatus(driver, true);
    // Confirm that save is still around to be pressed.
    await pressPolygonButton('save', driver);

    // After a save, the hide is successful.
    await driver.findElement({id: 'user features-checkbox'}).click();
    await assertUserFeaturesCheckboxCheckedStatus(driver, false);

    // With the box unchecked, draw a new polygon, below the first one, and set
    // its notes, but don't finish editing.
    await drawPolygonAndClickOnIt(driver, 50);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys('new notes');
    // Try to re-check the box. It will fail because we're editing.
    await driver.findElement({id: 'user features-checkbox'}).click()
        .then(async () => {
          await driver.wait(until.alertIsPresent());
          await driver.switchTo().alert().accept();
        });
    await assertUserFeaturesCheckboxCheckedStatus(driver, false);

    // Save the new notes and check the box, this time it succeeds.
    await pressPolygonButton('save', driver);
    await driver.findElement({id: 'user features-checkbox'}).click();
    await assertUserFeaturesCheckboxCheckedStatus(driver, true);

    // We can click on the old polygon and view its notes,
    await clickOnDrawnPolygon(driver);
    await assertNotesVisibleStatus(true, driver, notes);
    // And the new polygon and view its notes.
    await clickOnDrawnPolygon(driver, 50);
    await assertNotesVisibleStatus(true, driver, 'new notes');

    // Now hide both polygons, and verify that they're really gone.
    await driver.findElement({id: 'user features-checkbox'}).click();
    await assertUserFeaturesCheckboxCheckedStatus(driver, false);
    await assertNotesVisibleStatus(false, driver, notes);
    await assertNotesVisibleStatus(false, driver, 'new notes');
    await clickOnDrawnPolygon(driver, 50);
    await assertNotesVisibleStatus(false, driver, 'new notes');
  });
});

/**
 * Visit page, draw a new polygon on the map, click inside it.
 * @param {WebDriver} driver
 * @param {number} offset Number to add to y coordinate (shifting down).
 * */
async function drawPolygonAndClickOnIt(driver, offset=0) {
  await driver.findElement({css: '[title="Draw a shape"]'}).click();
  const mapPromise = driver.findElement({className: 'map'});
  await driver.actions()
      .move({x: -100, y: -50 + offset, origin: mapPromise})
      .click()
      .pause(hackyWaitTime)
      .move({x: 100, y: -50 + offset, origin: mapPromise})
      .click()
      .pause(hackyWaitTime)
      .move({x: 0, y: -100 + offset, origin: mapPromise})
      .click()
      .pause(hackyWaitTime)
      .move({x: -100, y: -50 + offset, origin: mapPromise})
      .click()
      .perform();
  await driver.findElement({css: '[title="Stop drawing"]'}).click();
  await driver.sleep(hackyWaitTime);
  // click to trigger pop up.
  await clickOnDrawnPolygon(driver, offset);
}

/**
 * Click on the map inside the test-drawn polygon to trigger a pop-up if it's
 * there.
 * @param {WebDriver} driver
 * @param {number} offset Number to add to y coordinate (shifting down).
 */
async function clickOnDrawnPolygon(driver, offset=0) {
  await driver.actions().move({x: 0, y: -90 + offset, origin: driver.findElement({className: 'map'})}).click().perform();
}

/**
 * Clicks a non-hidden button inside the map with the given text.
 * @param {string} button text of html button we want to click
 * @param {WebDriver} driver
 * @return {Promise} promise to wait for
 */
function pressPolygonButton(button, driver) {
  return driver.findElement({xpath: '//button[.="' + button
        + '" and not(ancestor::div[contains(@style,"visibility: hidden")])]'}).click();
}

/**
 * Clicks a button inside the map with the given text that triggers a confirm
 * dialog, then accepts/rejects the dialog.
 * @param {string} button text of html button we want to click
 * @param {boolean} accept whether or not to accept the confirmation.
 * @param {WebDriver} driver
 * @return {Promise} promise to wait on
 */
function pressPolygonButtonAndReactToConfirm(button, accept, driver) {
  return pressPolygonButton(button, driver).then(() => {
    const waitPromise = driver.wait(until.alertIsPresent());
    if (accept) {
      return waitPromise.then(() => driver.switchTo().alert().accept());
    } else {
      return waitPromise.then(() => driver.switchTo().alert().dismiss());
    }
  });
}
/**
 * Asserts that a div with innerHtml notes is found exactly
 * expectedFound times.
 *
 * @param {Number} expectedFound how many divs with notes param expected
 * @param {String} notes contents to look for
 * @param {WebDriver} driver
 */
async function assertExactlyPopUps(expectedFound, notes, driver) {
  await driver.manage().setTimeouts({implicit: 0});
  const elts = await driver.findElements({xpath: '//div[.="' + notes + '"]'});
  expect(elts).has.length(expectedFound);
  await setTimeouts(driver);
}

async function assertNotesVisibleStatus(visible, driver, expectedNotes = notes) {
  const value =
      await driver.findElement({xpath: '//div[.="' + expectedNotes + '"]'})
          .isDisplayed();
  expect(value).to.eq(visible);
}

async function assertUserFeaturesCheckboxCheckedStatus(driver, checked) {
  const status = await driver.findElement({id: 'user features-checkbox'}).isSelected();
  expect(status).to.equal(checked);
}