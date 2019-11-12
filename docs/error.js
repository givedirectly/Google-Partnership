export {createError, showError};

const SNACKBAR_DURATION_MS = 3000;

/**
 * Simple function that returns a lambda to print an error to console.
 *
 * @param {string} msg
 * @return {Function}
 */
function createError(msg) {
  // TODO(janakr): use some standard error library?
  return (error) => {
    document.getElementById('caption').innerText =
        'Error ' + msg + ': ' + error;
    console.error('Error ' + msg + ': ' + error);
  };
}

/**
 * Logs an error message to the console and shows a snackbar notification.
 *
 * @param {string} msg the message to be logged
 * @param {string} snackbarMsg the message to be shown in the notification (this
 *     can be omitted if the message should just be the logged message).
 */
function showError(msg, snackbarMsg) {
  if (snackbarMsg == null) snackbarMsg = msg;

  console.error(msg);
  const snackbar = document.getElementById('snackbar');
  snackbar.className = 'show';
  document.getElementById('snackbar-text').innerHTML = snackbarMsg;
  setTimeout(() => {
    snackbar.className = snackbar.className.replace('show', '');
  }, SNACKBAR_DURATION_MS);
}
