import {showErrorSnackbar} from './snackbar.js';

export {showError};

/**
 * Logs an error message to the console and shows a snackbar notification.
 *
 * @param {*} msg the message to be logged
 * @param {?string} snackbarMsg the message to be shown in the notification
 *     (this can be omitted if the message should just be the logged message).
 */
function showError(msg, snackbarMsg = null) {
  if (snackbarMsg) {
    console.error(snackbarMsg, msg);
  } else {
    console.error(msg);
    snackbarMsg = msg;
  }
  showErrorSnackbar(snackbarMsg);
}
