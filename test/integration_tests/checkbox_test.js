import {expect} from 'chai';

import {loadPage, setUp, waitForLoad} from '../lib/test_support';

describe('Integration test', function() {
  const driverPromise = setUp(this);

  it('Checks threshold update checks score box', async () => {
    const driver = await loadPage(driverPromise);
    driver.findElement({id: 'score'}).click();
    const result = await driver.findElement({id: 'score'}).isSelected();
    expect(result).to.be.false;
    await driver.findElement({id: 'poverty threshold'}).sendKeys('1.0');
    await driver.findElement({id: 'update'}).click();
    await waitForLoad(driver);
    const nextResult = await driver.findElement({id: 'score'}).isSelected();
    expect(nextResult).to.be.true;
  });
});
