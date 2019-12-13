export {showSnackbar};

const ANIMATION_DURATION_MS = 500;
const SNACKBAR_DURATION_MS = 3000;

// Track number of messages shown so we don't accidentally hide a later message.
let showNumber = 0;

let snackbarOriginalClassName;
let iconOriginalClassName;

/**
 * Shows a snackbar notification.
 *
 * @param {string} msg the message to be shown
 * @param {string[]} snackbarClasses classes to be added to the snackbar
 * @param {string[]} iconClasses classes to be added to the icon
 * @param {number} duration Number of milliseconds to show the message. If
 *     non-positive, message stays up until this method is called again.
 */
function showSnackbar(
    msg, snackbarClasses, iconClasses, duration = SNACKBAR_DURATION_MS) {
  const snackbar = document.getElementById('snackbar');
  if (snackbarClasses) {
    snackbarClasses.forEach(
        (snackbarClass) => snackbar.classList.add(snackbarClass));
  }

  const icon = document.getElementById('snackbar-icon');
  if (iconClasses) {
    iconClasses.forEach((iconClass) =>  icon.classList.add(iconClass));
  }

  document.getElementById('snackbar-text').innerText = msg;

  $('#snackbar').fadeIn(ANIMATION_DURATION_MS);

  const currentShow = ++showNumber;

  if (duration > 0) {
    setTimeout(() => {
      // Only clear the snackbar if the current shown snackbar is the latest.
      if (currentShow === showNumber) {
        showNumber = 0;  // reset the counter to prevent overflow
        $('#snackbar').fadeOut(ANIMATION_DURATION_MS, () => {
          // In case another snackbar is already being shown again, we don't
          // want to reset the styles.
          if (showNumber > 0) return;

          snackbar.className = snackbarOriginalClassName;
          icon.className = iconOriginalClassName;
        });
      }
    }, duration);
  }
}

$(() => {
  $('#snackbar')
      .load(import.meta.url.replace(/snackbar\.js$/, 'snackbar.html'), () => {
        const snackbar = document.getElementById('snackbar');
        snackbarOriginalClassName = snackbar.className;
        const icon = document.getElementById('snackbar-icon');
        iconOriginalClassName = icon.className;
      });
});
