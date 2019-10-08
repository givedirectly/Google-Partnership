import {setTimeouts, setValueOfField} from '../lib/test_support.js';

/**
 * This test relies on the FEMA damage data for Hurricane Harvey and the
 * starting thresholds of poverty 0.3 and damage 0.5
 */
describe('Integration test for clicking feature', function() {
  const driverPromise = setUp(this);

  it('clicks a map feature, highlights feature in list', async () => {
    const driver = await loadPage(driverPromise);

    await driver.actions()
        .move({x: 39, y: 4, origin: driver.findElement({className: 'map'})})
        .click()
        .perform();

    const blockGroup =
        await driver
            .findElement({
              xpath: '//tr[contains(@class,' +
                  ' "google-visualization-table-tr-sel")]/child::td[1]',
            })
            .getText();
    expect(blockGroup)
        .to.equal(
            'Block Group 1, Census Tract 2525, ' +
            'Harris County, Texas');
  });

  it('click highlights correct feature even after resort', async () => {
    const driver = await loadPage(driverPromise);

    // Sort descending by damage percentage
    await driver
        .findElement({
          xpath:
              '//tr[@class="google-visualization-table-tr-head"]/child::th[4]',
        })
        .click();
    await driver
        .findElement({
          xpath:
              '//tr[@class="google-visualization-table-tr-head"]/child::th[4]',
        })
        .click();
    await driver.actions()
        .move({x: 39, y: 4, origin: driver.findElement({className: 'map'})})
        .click()
        .perform();
    const blockGroup =
        await driver
            .findElement({
              xpath: '//tr[contains(@class,' +
                  ' "google-visualization-table-tr-sel")]/child::td[1]',
            })
            .getText();
    expect(blockGroup)
        .to.equal(
            'Block Group 1, Census Tract 2525, ' +
            'Harris County, Texas');
  });

  it('clicks a place where there is no damage', async () => {
    const driver = await loadPage(driverPromise);

    await driver.actions()
        .move({x: 200, y: 400, origin: driver.findElement({className: 'map'})})
        .click()
        .perform();
    await driver.manage().setTimeouts({implicit: 0});
    const emptyElements = await driver.findElements(
        {xpath: '//tr[contains(@class, "google-visualization-table-tr-sel")]'});
    expect(emptyElements).is.empty;
    await setTimeouts(driver);
  });

  it('click highlights correct feature even after update', async () => {
    const driver = await loadPage(driverPromise);

    await driver.actions()
        .move({x: 39, y: 4, origin: driver.findElement({className: 'map'})})
        .click()
        .perform();
    await setValueOfField(driver, 'damage threshold', 0.8);
    const blockGroup =
        await driver
            .findElement({
              xpath: '//tr[contains(@class,' +
                  ' "google-visualization-table-tr-sel")]/child::td[1]',
            })
            .getText();
    expect(blockGroup)
        .to.equal(
        'Block Group 1, Census Tract 2525,' +
        ' Harris County, Texas');
    await driver.findElement({id: 'update'}).click();
    const blockGroupAfter =
        await driver
            .findElement({
              xpath: '//tr[contains(@class,' +
                  ' "google-visualization-table-tr-sel")]/child::td[1]',
            })
            .getText();
    expect(blockGroupAfter)
        .to.equal(
        'Block Group 1, Census Tract 2525,' +
        ' Harris County, Texas');
  });
});
