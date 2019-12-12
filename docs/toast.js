import {showSnackbar} from './snackbar.js';

export {showToastMessage};

const TOAST_COLOR = '#F4FBFA';
const TOAST_DURATION_MS = 2000;

/**
 * Shows a message to the user in a "toast" popup.
 * @param {string} message Message to show
 * @param {number} duration Number of milliseconds to show the message. If
 *     non-positive, message stays up until this method is called again.
 */
function showToastMessage(message, duration = TOAST_DURATION_MS) {
  showSnackbar(
    message,
    (snackbar) => {
      snackbar.style.backgroundColor = TOAST_COLOR
      snackbar.style.color = '#000';
    },
    (icon) => {
      icon.classList.add('fa');
      icon.classList.add('fa-check');
      icon.classList.add('fa-2x');
    },
    duration);
}
