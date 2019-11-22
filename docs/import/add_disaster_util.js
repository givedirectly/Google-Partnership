export {setStatus, clearStatus, ILLEGAL_STATE_ERR};

/**
 * Utility function for setting the status div.
 * @param {String} text
 */
function setStatus(text) {
  $('#status').text(text).show();
}

/** Utility function for clearing status div. */
function clearStatus() {
  $('#status').hide();
}

const ILLEGAL_STATE_ERR =
    'Internal Error: contact developer with the following information: ';
