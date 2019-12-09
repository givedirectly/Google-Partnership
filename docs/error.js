import {showSnackbarMessage} from './snackbar.js';

export {createError, showError};

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
  console.error(msg);
  showSnackbarMessage(snackbarMsg ? snackbarMsg : msg);
}
