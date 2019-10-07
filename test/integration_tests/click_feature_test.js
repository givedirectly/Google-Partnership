/**
 * This test relies on the FEMA damage data for Hurricane Harvey and the
 * starting thresholds of poverty 0.3 and damage 0.5
 */
describe('Integration test for clicking feature', function() {
  const driverPromise = setUp(this);

  it('clicks a feature on the map highlights feature in list', async () => {
    const driver = await loadPage(driverPromise);

    await driver.actions().move({x: 370, y: 320}).click().perform();
    await driver.findElement({className: 'google-visualization-table-tr-sel'})
        .findElement({
          xpath: '//td[@class="google-visualization-table-td"]' +
              '[text()="Block Group 4, Census Tract 2511, Harris County, Texas"]'
        });
  });

  it('click highlights correct feature even after resort', async () => {
    const driver = await loadPage(driverPromise);

    // Sort descending by damage percentage
    await driver
        .findElement({
          xpath:
              '//tr[@class="google-visualization-table-tr-head"]/child::th[4]'
        })
        .click();
    await driver
        .findElement({
          xpath:
              '//tr[@class="google-visualization-table-tr-head"]/child::th[4]'
        })
        .click();
    await driver.actions().move({x: 370, y: 320}).click().perform();
    await driver.findElement({className: 'google-visualization-table-tr-sel'})
        .findElement({
          xpath: '//td[@class="google-visualization-table-td"]' +
              '[text()="Block Group 4, Census Tract 2511, Harris County, Texas"]'
        });
  });

  it('clicks a place where there is no damage -> no feature', async () => {
    const driver = await loadPage(driverPromise);

    await driver.actions().move({x: 100, y: 200}).click().perform();
    const emptyElements = await driver.findElements(
        {className: 'google-visualization-table-tr-sel'});
    expect(emptyElements).is.empty;
  });

  it('click highlights correct feature even after update', async () => {
    const driver = await loadPage(driverPromise);

    await driver.actions().move({x: 370, y: 320}).click().perform();
    await setValueOfField(driver, 'damage threshold', 0.9);
    await driver.findElement({id: 'update'}).click();
    await driver.findElement({className: 'google-visualization-table-tr-sel'})
        .findElement({
          xpath: '//td[@class="google-visualization-table-td"]' +
              '[text()="Block Group 4, Census Tract 2511, Harris County, Texas"]'
        });
  });
});


// TODO: dedupe with same method in update_test.js when that gets submitted.
/**
 * Sets the value of the input with id inputId to value.
 *
 * @param {WebDriver} driver
 * @param {string} inputId
 * @param {Object} value
 * @return {Promise}
 */
async function setValueOfField(driver, inputId, value) {
  await driver.findElement({id: inputId}).clear();
  return driver.findElement({id: inputId}).sendKeys(value);
}