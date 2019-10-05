const {By, until} = require('selenium-webdriver');
const firebase = require('firebase');
const testSupport = require('../lib/test_support');
const chai = require('chai');

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
  const driverPromise = testSupport.setUp(this, testCookieValue);
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
    const driver = await testSupport.loadPage(driverPromise);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement(By.className('notes')).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await driver.findElement(By.xpath('//div[.="' + notes + '"]'));
  });

  it('Draws a polygon and deletes it', async () => {
    const driver = await testSupport.loadPage(driverPromise);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement(By.className('notes')).sendKeys(notes);
    await pressPolygonButton('save', driver);

    await pressPolygonButton('delete', driver);
    await driver.wait(until.alertIsPresent());
    await driver.switchTo().alert().accept();
    // Polygon should be gone.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(0, notes, driver)
        .then(() => console.log('all done'));
  });

  it('Draws a polygon and almost deletes it, then deletes', async () => {
    const driver = await testSupport.loadPage(driverPromise);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement(By.className('notes')).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await pressPolygonButton('delete', driver);
    await driver.wait(until.alertIsPresent());
    await driver.switchTo().alert().dismiss();
    // Assert still exists.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(1, notes, driver);
    // TODO(#18): wait for a notification that all writes have completed instead
    // of a hardcoded wait.
    await driver.sleep(1000);
    await testSupport.loadPage(driverPromise);
    // Polygon is still there.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(1, notes, driver);

    await pressPolygonButton('delete', driver);
    await driver.wait(until.alertIsPresent());
    await driver.switchTo().alert().dismiss();
    // Polygon is still there.
    await clickOnDrawnPolygon(driver);
    await pressPolygonButton('delete', driver);
    await driver.wait(until.alertIsPresent());
    await driver.switchTo().alert().accept();
    // Polygon should be gone.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(0, notes, driver);
    await driver.sleep(1000);
    testSupport.loadPage(driverPromise);
    // Polygon is gone.
    await clickOnDrawnPolygon(driver);
    await assertExactlyPopUps(0, notes, driver);
  });

  it('Draws a polygon, clicks it, closes its info box', async () => {
    const driver = await testSupport.loadPage(driverPromise);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement(By.className('notes')).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await pressPolygonButton('close', driver);
    // element is still there, just hidden
    await assertExactlyPopUps(1, notes, driver);
    const isVisible =
        await driver.findElement(By.xpath('//div[.="' + notes + '"]'))
            .isDisplayed();
    chai.expect(isVisible).to.be.false;
  });

  it('Draws a polygon, almost closes while editing', async () => {
    const driver = await testSupport.loadPage(driverPromise);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement(By.className('notes')).sendKeys(notes);
    await pressPolygonButton('close', driver);
    await driver.wait(until.alertIsPresent());
    await driver.switchTo().alert().dismiss();
    await pressPolygonButton('save', driver);
    const isVisible =
        await driver.findElement(By.xpath('//div[.="' + notes + '"]'))
            .isDisplayed();
    chai.expect(isVisible).to.be.true;
  });

  it('Draws a polygon, closes while editing', async () => {
    const driver = await testSupport.loadPage(driverPromise);
    await drawPolygonAndClickOnIt(driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement(By.className('notes')).sendKeys(notes);
    await pressPolygonButton('save', driver);
    await pressPolygonButton('edit', driver);
    await driver.findElement(By.className('notes')).sendKeys('blahblahblah');
    pressPolygonButton('close', driver);
    await driver.wait(until.alertIsPresent());
    await driver.switchTo().alert().accept();
    // element is still there, just hidden
    await assertExactlyPopUps(1, notes, driver);
    const isVisible =
        await driver.findElement(By.xpath('//div[.="' + notes + '"]'))
            .isDisplayed();
    chai.expect(isVisible).to.be.false;
  });
});

/** Visit page, draw a new polygon on the map, click inside it. */
async function drawPolygonAndClickOnIt(driver) {
  await driver.findElement(By.css('[title="Draw a shape"]')).click();
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
  await driver.findElement(By.css('[title="Stop drawing"]')).click();
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
 * Clicks a button inside the map with the given id.
 * @param {string} button text of html button we want to click
 * @param {WebDriver} driver
 */
function pressPolygonButton(button, driver) {
  return driver.findElement(By.xpath('//button[.="' + button + '"]')).click();
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
  const elts = await driver.findElements(By.xpath('//div[.="' + notes + '"]'));
  chai.expect(elts).has.length(expectedFound);
  await testSupport.setTimeouts(driver);
}
