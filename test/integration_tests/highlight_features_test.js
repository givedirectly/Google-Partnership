import {Key} from 'selenium-webdriver/lib/input';

describe('Integration tests for highlighting chosen districts', function() {
  const driverPromise = setUp(this);
  it('Clicks on list and highlights district', async () => {
    const driver = await loadPage(driverPromise);
    // Actually verifying that the element appears is difficult, because the
    // drawing happens on a canvas, which doesn't expose its contents. So we
    // don't do it, instead just verifying that nothing terrible happens.
    await getRow(driver, 1).click();
    // Shift-click to select a range.
    await driver.actions()
        .keyDown(Key.SHIFT)
        .click(getRow(driver, 3))
        .keyUp(Key.SHIFT)
        .perform();
    await getRow(driver, 2).click();
  });
});

/**
 * Gets the index-th row of the table with the ranked list.
 *
 * @param {WebDriver} driver
 * @param {number} index Index of row
 * @return {Object}
 */
function getRow(driver, index) {
  return driver.findElement({xpath: '//table/tbody/tr[' + index + ']'});
}
