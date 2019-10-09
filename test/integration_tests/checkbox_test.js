describe('Integration test', function() {
  const driverPromise = setUp(this);

  it('Checks threshold update checks score box', async () => {
    const driver = await loadPage(driverPromise);
    driver.findElement({id: 'score-checkbox'}).click();
    const result =
        await driver.findElement({id: 'score-checkbox'}).isSelected();
    expect(result).to.be.false;
    await driver.findElement({id: 'poverty threshold'}).clear();
    await driver.findElement({id: 'poverty threshold'}).sendKeys('1.0');
    await driver.findElement({id: 'update'}).click();
    const nextResult =
        await driver.findElement({id: 'score-checkbox'}).isSelected();
    expect(nextResult).to.be.true;
  });
});
