const {By} = require('selenium-webdriver');
const chai = require('chai');
const testUtil = require('../lib/test_support');

describe('Integration test', function() {
  const driverPromise = testUtil.setUp(this);

  it('Checks threshold update checks score box', async () => {
    const driver = await testUtil.loadPage(driverPromise);
    driver.findElement(By.id('score')).click();
    const result = await driver.findElement(By.id('score')).isSelected();
    chai.expect(result).to.be.false;
    driver.findElement(By.id('poverty threshold')).sendKeys('1.0');
    driver.findElement(By.id('update')).click();
    const nextResult = await driver.findElement(By.id('score')).isSelected();
    chai.expect(nextResult).to.be.true;
  });
});
