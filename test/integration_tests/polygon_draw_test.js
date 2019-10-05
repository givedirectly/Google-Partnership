import {until} from 'selenium-webdriver';
import * as firebase from 'firebase';
import {expect} from 'chai';
import {setUp, setTimeouts, loadPage} from "../lib/test_support.js";

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
  const testCookieValue = Math.random() + 'suffix';
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
    const driver = await loadPage(driverPromise);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement({className: 'notes'}).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await driver.findElement({xpath: '//div[.="' + notes + '"]'});
  });

  it('Draws a polygon and deletes it', async () => {
    const driver = await loadPage(driverPromise);
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
    const driver = await loadPage(driverPromise);
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
    loadPage(driverPromise);
    // Polygon is gone.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(0, notes, driver);
  });

  it('Draws a polygon, clicks it, closes its info box', async () => {
    const driver = await loadPage(driverPromise);
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
    const driver = await loadPage(driverPromise);
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
    const driver = await loadPage(driverPromise);
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
});

/**
 * Visit page, draw a new polygon on the map, click inside it.
 * @param {WebDriver} driver
 * */
async function drawPolygonAndClickOnIt(driver) {
  await driver.findElement({css: '[title="Draw a shape"]'}).click();
  await driver.actions()
      .move({x: 150, y: 250})
      .click()
      .pause(hackyWaitTime)
      .move({x: 400, y: 150})
      .click()
      .pause(hackyWaitTime)
      .move({x: 450, y: 260})
      .click()
      .pause(hackyWaitTime)
      .move({x: 150, y: 250})
      .click()
      .perform();
  await driver.findElement({css: '[title="Stop drawing"]'}).click();
  await driver.sleep(hackyWaitTime);
  // click to trigger pop up.
  await driver.actions().move({x: 170, y: 250}).click().perform();
}

/**
 * Click on the map inside the test-drawn polygon to trigger a pop-up if it's
 * there.
 * @param {WebDriver} driver
 */
async function clickOnDrawnPolygon(driver) {
  await driver.actions().move({x: 170, y: 250}).click().perform();
}

/**
 * Clicks a button inside the map with the given text.
 * @param {string} button text of html button we want to click
 * @param {WebDriver} driver
 * @return {Promise} promise to wait for
 */
function pressPolygonButton(button, driver) {
  return driver.findElement({xpath: '//button[.="' + button + '"]'}).click();
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
  return pressPolygonButton(button, driver)
      .then(async () => {
        await driver.wait(until.alertIsPresent());
        if (accept) {
          await driver.switchTo().alert().accept();
        } else {
          await driver.switchTo().alert().dismiss();
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
