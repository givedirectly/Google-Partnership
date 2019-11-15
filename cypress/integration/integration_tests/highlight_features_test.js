describe('Integration tests for highlighting chosen districts', () => {
  it('Clicks on list and highlights district', () => {
    cy.visit('');
    cy.awaitLoad();

    // Actually verifying that the element appears is difficult, because the
    // drawing happens on a canvas, which doesn't expose its contents. So we
    // don't do it, instead just verifying that nothing terrible happens.
    getTable().get('tr').eq(1).click();
    // Shift-click to select a range.
    cy.get('body').type('{shift}', {release: false, force: true});
    getTable().get('tr').eq(3).click();
    // Clear shift modifier. Unfortunately this seems to swallow the next
    // click.
    cy.get('body').type('{shift}').click({force: true});
    // TODO(janakr): this click isn't registered properly. But the next one
    // is.
    getTable().get('tr').eq(2).click();
    getTable().get('tr').eq(2).click();
  });
});

/**
 * Gets the table with the ranked list.
 *
 * @return {Object}
 */
function getTable() {
  return cy.get(tableClass);
}
