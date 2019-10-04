const {Builder, By} = require('selenium-webdriver');

// We use the ip address rather than 'localhost' because Selenium has issues
// with setting cookies on localhost.
const hostAddress = 'http://127.0.0.1:8080';

/**
 * Loads the page, waiting for all processes to finish.
 *
 * @param {Promise<ThenableWebDriver>} driverPromise The promise returned from setUp
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
  await driver.findElement(By.xpath('//div[@id="mapContainer-loader"][contains(@style,"opacity: 1")]'));
  await driver.findElement(By.xpath('//div[@id="mapContainer-loader"][contains(@style,"opacity: 0")]'));
};

/**
 * Sets up testing, should be called as first line in each describe() function.
 *
 * @param {Object} testFramework "this" variable inside describe().
 * @return {Promise<ThenableWebDriver>} Promise of Selenium webdriver for later
 * use.
 */
module.exports.setUp = async (testFramework) => {
  testFramework.timeout(40000);
  let resolveFunctionForDriver = null;
  const driverPromise = new Promise((resolve) => {
    resolveFunctionForDriver = resolve;
  });
  let driver;
  before(async () => {
    driver = new Builder().forBrowser('chrome').build();
    driver.manage().setTimeouts(
        {implicit: 10000, pageLoad: 10000, script: 10000});
    // Workaround for fact that cookies can only be set on the domain we've
    // already set: navigate to domain first, then set cookie.
    // https://docs.seleniumhq.org/docs/03_webdriver.jsp#cookies
    driver.get(hostAddress);
    // TODO(janakr): switch cookie name once fully migrated.
    await driver.manage().addCookie({name: 'IN_CYPRESS_TEST', value: 'true'});
    resolveFunctionForDriver(driver);
  });
  after(async () => {
    await driver.quit();
  });
  return driverPromise;
};
