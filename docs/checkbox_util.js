export {
  getCheckBoxId,
  getCheckBoxRowId,
  partiallyHandleBadRowAndReturnCheckbox,
};

/**
 * Creates the id of a show/hide checkbox.
 * @param {number|string} index Number unless 'score'
 * @return {string}
 */
function getCheckBoxId(index) {
  return 'layer-' + index + '-checkbox';
}

/**
 * Creates the id of a show/hide checkbox's row.
 * @param {number|string} index See {@link getCheckBoxId}
 * @return {string}
 */
function getCheckBoxRowId(index) {
  return getCheckBoxId(index) + '-row';
}

/**
 * Does common work of marking a layers row as somehow bad: strikes through the
 * text and unchecks the checkbox.
 * @param {JQuery<HTMLDivElement>} row
 * @return {JQuery<HTMLInputElement>} checkbox of this row
 */
function partiallyHandleBadRowAndReturnCheckbox(row) {
  row.css('text-decoration', 'line-through');
  return row.children('input').prop('checked', false);
}
