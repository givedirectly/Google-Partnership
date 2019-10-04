const {Builder, By} = require('selenium-webdriver');

let driver;

// We use the ip address rather than 'localhost' because Selenium has issues
// with setting cookies on localhost.
const hostAddress = 'http://127.0.0.1:8080';

module.exports.loadPage = async () => {
  driver.get(hostAddress);
  await driver.findElement(By.xpath('//div[@id="mapContainer-loader"][contains(@style,"opacity: 1")]'));
  await driver.findElement(By.xpath('//div[@id="mapContainer-loader"][contains(@style,"opacity: 0")]'));
  return driver;
};

module.exports.setUp = (testFramework) => {
  testFramework.timeout(40000);
  before(async () => {
    driver = new Builder().forBrowser('chrome').build();
    driver.manage().setTimeouts({implicit: 10000, pageLoad: 10000, script: 10000});
    // Workaround for fact that cookies can only be set on the domain we've
    // already set: navigate to domain first, then set cookie.
    // https://docs.seleniumhq.org/docs/03_webdriver.jsp#cookies
    driver.get(hostAddress);
    // TODO(janakr): switch cookie name once fully migrated.
    await driver.manage().addCookie({name: 'IN_CYPRESS_TEST', value: 'true'});
  });
  after(async () => {
    await driver.quit();
  });
};
