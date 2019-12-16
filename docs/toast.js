import {showSnackbar} from './snackbar.js';

export {showToastMessage};

const TOAST_DURATION_MS = 2000;

/**
 * Shows a message to the user in a "toast" popup.
 * @param {string} message Message to show
 * @param {number} duration Number of milliseconds to show the message. If
 *     non-positive, message stays up until this method is called again.
 */
function showToastMessage(message, duration = TOAST_DURATION_MS) {
  showSnackbar(
      message, ['snackbar-toast'], ['fa', 'fa-check', 'fa-2x'], duration);
}
