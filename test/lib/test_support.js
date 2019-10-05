// TODO(janakr): migrate to ES6-style exports if possible.
const {Builder, By} = require('selenium-webdriver');
const {Options} = require('selenium-webdriver/chrome');

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
module.exports.loadPage = async (driverPromise) => {
  const driver = await driverPromise;
  driver.get(hostAddress);
  await module.exports.waitForLoad(driver);
  return driver;
};

/**
 * Waits for all loading to finish. Should be inlineable once deck-gl changes
 * are submitted.
 *
 * @param {ThenableWebDriver} driver Selenium webdriver
 */
module.exports.waitForLoad = async (driver) => {
  await driver.findElement(By.xpath(
      '//div[@id="mapContainer-loader"][contains(@style,"opacity: 1")]'));
  await driver.findElement(By.xpath(
      '//div[@id="mapContainer-loader"][contains(@style,"opacity: 0")]'));
};

const chromeOptions = new Options().addArguments(['--headless']);

/**
 * Sets up testing, should be called as first line in each describe() function.
 *
 * @param {Object} testFramework "this" variable inside describe().
 * @param {string} testCookieValue value to set test cookie to.
 * @return {Promise<ThenableWebDriver>} Promise of Selenium webdriver for later
 * use.
 */
module.exports.setUp = async (testFramework, testCookieValue) => {
  // 40 seconds to run an individual test case.
  testFramework.timeout(10000);
  let resolveFunctionForDriver = null;
  const driverPromise = new Promise((resolve) => {
    resolveFunctionForDriver = resolve;
  });
  let driver;
  before(async () => {
    driver = new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();
    await module.exports.setTimeouts(driver);
    // Workaround for fact that cookies can only be set on the domain we've
    // already set: navigate to domain first, then set cookie.
    // https://docs.seleniumhq.org/docs/03_webdriver.jsp#cookies
    driver.get(hostAddress);
    // TODO(janakr): switch cookie name once fully migrated.
    await driver.manage().addCookie({name: 'IN_CYPRESS_TEST', value: testCookieValue});
    resolveFunctionForDriver(driver);
  });
  after(async () => {
    await driver.quit();
  });
  return driverPromise;
};
/**
 * Timeout after 10 seconds if page isn't loaded, script isn't run, or element on page isn't found.
 *
 * @param driver
 */
module.exports.setTimeouts = async (driver) => {
  driver.manage().setTimeouts(
      {implicit: 10000, pageLoad: 10000, script: 10000});
};
