import {setTimeouts, setValueOfField, waitForLoad} from '../lib/test_support';

describe('Integration test for update.js', function() {
  const driverPromise = setUp(this);
  /**
   * Checks that by setting the threshold to 100% the list and page number
   * empty. This is somewhat brittle in that if we ever worked with some poverty
   * data that did have 100% poverty in any areas, this would break.
   */
  it('Checks list size updates with higher threshold', async () => {
    const driver = await loadPage(driverPromise);
    await setValueOfField(driver, 'damage threshold', 0);
    await driver.findElement({id: 'update'}).click();
    await waitForLoad(driver);
    const pageElts =
        await driver
            .findElement({className: 'google-visualization-table-page-numbers'})
            .findElements({tagName: 'a'});
    expect(pageElts).is.not.empty;

    await setValueOfField(driver, 'damage threshold', 1);
    await setValueOfField(driver, 'poverty threshold', 1);
    await driver.findElement({id: 'update'}).click();
    await waitForLoad(driver);

    await driver.manage().setTimeouts({implicit: 0});
    const emptyPageElts = await driver.findElements(
        {className: 'google-visualization-table-page-numbers'});
    expect(emptyPageElts).is.empty;
    const emptyEvenRows = await driver.findElements(
        {className: 'google-visualization-table-tr-even'});
    expect(emptyEvenRows).is.empty;
    await setTimeouts(driver);
  });
});
