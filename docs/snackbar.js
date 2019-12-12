export {showSnackbar};

const ANIMATION_DURATION_MS = 500;
const SNACKBAR_DURATION_MS = 3000;

// Track number of messages shown so we don't accidentally hide a later message.
let showNumber = 0;

/**
 * Shows a snackbar notification.
 *
 * @param {string} msg the message to be shown
 * @param {function} snackbarStyler applies styles to the snackbar div
 * @param {function} iconStyler applies styles to the icon div
 * @param {number} duration Number of milliseconds to show the message. If
 *     non-positive, message stays up until this method is called again.
 */
function showSnackbar(
    msg, snackbarStyler, iconStyler, duration = SNACKBAR_DURATION_MS) {
  const snackbar = document.getElementById('snackbar');
  const snackbarOriginalClasses = snackbar.className;
  const snackbarOriginalStyle = snackbar.style;
  if (snackbarStyler) snackbarStyler(snackbar);

  const icon = document.getElementById('snackbar-icon');
  const iconOriginalClasses = icon.className;
  const iconOriginalStyle = icon.style;
  if (iconStyler) iconStyler(icon);

  document.getElementById('snackbar-text').innerHTML = msg;

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

          snackbar.className = snackbarOriginalClasses;
          snackbar.style = snackbarOriginalStyle;
          icon.className = iconOriginalClasses;
          icon.style = iconOriginalStyle;
        });
      }
    }, duration);
  }
}

$(() => $('#snackbar').load(
    import.meta.url.replace(/snackbar\.js$/, 'snackbar.html')));
