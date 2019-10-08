describe('Integration test for the sidebar', function() {
  const driverPromise = setUp(this);

  it('enables toggling', async () => {
    const driver = await loadPage(driverPromise);
    debugger
    // The sidebar should be collapsed to start.
    await driver.findElement({
      xpath: '//div[@id="sidebar"][contains(@style,"width: 64px")]',
    });
    await driver.findElement({
      xpath: '//div[@id="sidebar-thresholds"][contains(@style,"display: none")]',
    });
    await driver.findElement({
      xpath: '//div[@id="sidebar-datasets"][contains(@style,"display: none")]',
    });

    // The thresholds should appear on toggling.
    driver.findElement({id: 'sidebar-toggle-thresholds'}).click();
    await driver.findElement({
      xpath: '//div[@id="sidebar"][contains(@style,"width: 25%")]',
    });
    await driver.findElement({
      xpath: '//div[@id="sidebar-thresholds"][contains(@style,"display: block")]',
    });
    await driver.findElement({
      xpath: '//div[@id="sidebar-datasets"][contains(@style,"display: none")]',
    });

    // The thresholds sidebar should disappear on toggling.
    driver.findElement({id: 'sidebar-toggle-thresholds'}).click();
    await driver.findElement({
      xpath: '//div[@id="sidebar"][contains(@style,"width: 64px")]',
    });
    await driver.findElement({
      xpath: '//div[@id="sidebar-thresholds"][contains(@style,"display: none")]',
    });
    await driver.findElement({
      xpath: '//div[@id="sidebar-datasets"][contains(@style,"display: none")]',
    });

    // The datasets should appear on toggling.
    driver.findElement({id: 'sidebar-toggle-datasets'}).click();
    await driver.findElement({
      xpath: '//div[@id="sidebar"][contains(@style,"width: 25%")]',
    });
    await driver.findElement({
      xpath: '//div[@id="sidebar-thresholds"][contains(@style,"display: none")]',
    });
    await driver.findElement({
      xpath: '//div[@id="sidebar-datasets"][contains(@style,"display: block")]',
    });

    // The thresholds should appear on toggling even from another sidebar view.
    driver.findElement({id: 'sidebar-toggle-thresholds'}).click();
    await driver.findElement({
      xpath: '//div[@id="sidebar"][contains(@style,"width: 25%")]',
    });
    await driver.findElement({
      xpath: '//div[@id="sidebar-thresholds"][contains(@style,"display: block")]',
    });
    await driver.findElement({
      xpath: '//div[@id="sidebar-datasets"][contains(@style,"display: none")]',
    });
  });
});
