export {getCheckBoxId, getCheckBoxRowId};

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
