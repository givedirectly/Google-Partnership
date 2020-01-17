export {createOptionFrom, stylePendingSelect};

/**
 * Styles `select` to be "pending": disabled, with a "pending" option.
 * @param {JQuery<HTMLSelectElement>} select
 * @return {JQuery<HTMLSelectElement>} Same element, for chaining
 */
function stylePendingSelect(select) {
  return select.empty()
      .attr('disabled', true)
      .append(createOptionFrom('pending...').val(''));
}

/**
 * Simple utility to create an option for a select.
 * @param {string} text Displayed text/value of option
 * @return {JQuery<HTMLOptionElement>}
 */
function createOptionFrom(text) {
  return $(document.createElement('option')).text(text);
}
