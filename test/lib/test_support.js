import {Builder, until} from 'selenium-webdriver';
import {Options} from 'selenium-webdriver/chrome';

export {
  loadPage,
  randomString,
  setTimeouts,
  setUp,
  startGet,
};

// We use the ip address rather than 'localhost' because Selenium has issues
// with setting cookies on localhost.
const hostAddress = 'http://127.0.0.1:8080';

/**
 * Loads the page, waiting for all processes to finish.
 *
 * @param {Promise<ThenableWebDriver>} driverPromise The promise returned from
 *     setUp
 * @return {ThenableWebDriver} The resolved driver (although it is wrapped in a
 * Promise since this function is async, so callers still need to await it)
 */
async function loadPage(driverPromise) {
  const driver = await driverPromise;
  await startGet(driver);
  await waitForLoad(driver);
  return driver;
}

/**
 * Starts fetching the main page.
 *
 * @param {WebDriver} driver
 * @return {Promise}
 */
function startGet(driver) {
  return driver.get(hostAddress);
}

const loadingTimeout = 60000;

/**
 * Waits for all loading to finish.
 *
 * @param {WebDriver} driver Selenium webdriver
 */
async function waitForLoad(driver) {
  driver.findElement({
    xpath: '//div[@id="tableContainer-loader"][contains(@style,"opacity: 1")]',
  });
  await driver.findElement({
    xpath: '//div[@id="mapContainer-loader"][contains(@style,"opacity: 1")]',
  });
  driver.wait(
      until.elementLocated({
        xpath:
            '//div[@id="tableContainer-loader"][contains(@style,"opacity: 0")]',
      }),
      loadingTimeout);
  driver.wait(
      until.elementLocated({
        xpath:
            '//div[@id="mapContainer-loader"][contains(@style,"opacity: 0")]',
      }),
      loadingTimeout);
}

const chromeOptions = new Options();//.addArguments(['--headless']);

/**
 * Sets up testing, should be called as first line in each describe() function.
 *
 * @param {Object} testFramework "this" variable inside describe().
 * @param {string} testCookieValue value to set test cookie to.
 * @return {Promise<WebDriver>} Promise of Selenium webdriver for later
 * use.
 */
async function setUp(testFramework, testCookieValue = randomString()) {
  // 100 seconds to run an individual test case.
  testFramework.timeout(200000);
  let resolveFunctionForDriver = null;
  const driverPromise = new Promise((resolve) => {
    resolveFunctionForDriver = resolve;
  });
  let driver;
  before(async () => {
    driver = new Builder()
                 .forBrowser('chrome')
                 .setChromeOptions(chromeOptions)
                 .build();
    setTimeouts(driver);
    driver.manage().window().setRect({width: 1024, height: 1700});
    // Workaround for fact that cookies can only be set on the domain we've
    // already set: navigate to domain first, then set cookie.
    // https://docs.seleniumhq.org/docs/03_webdriver.jsp#cookies
    driver.get(hostAddress);
    // TODO(janakr): switch cookie name once fully migrated.
    await driver.manage().addCookie(
        {name: 'IN_CYPRESS_TEST', value: testCookieValue});
    resolveFunctionForDriver(driver);
  });
  after(async () => {
    await driver.quit();
  });
  return driverPromise;
}

/**
 * Timeout after 60 seconds if page isn't loaded or script isn't run, and 2 if
 * element on page isn't found.
 *
 * @param {WebDriver} driver
 */
function setTimeouts(driver) {
  driver.manage().setTimeouts({implicit: 2000, pageLoad: 60000, script: 60000});
}

/**
 * Returns a random string.
 *
 * @return {string}
 */
function randomString() {
  return Math.random() + 'suffix';
}
