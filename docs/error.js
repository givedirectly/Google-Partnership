import {showSnackbar} from './snackbar.js';

export {createError, showError};

const ERROR_COLOR = '#F44336';

/**
 * Simple function that returns a lambda to print an error to console.
 *
 * @param {string} msg
 * @return {Function}
 */
function createError(msg) {
  // TODO(janakr): use some standard error library?
  return (error) => console.error('Error ' + msg + ': ' + error);
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
  showSnackbar(
      snackbarMsg,
      (snackbar) => snackbar.style.backgroundColor = ERROR_COLOR,
      (icon) => {
        icon.classList.add('fa');
        icon.classList.add('fa-exclamation-circle');
        icon.classList.add('fa-2x');
      });
}
