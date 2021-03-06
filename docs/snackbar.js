export {showErrorSnackbar, showSnackbar};

const ANIMATION_DURATION_MS = 500;
const SNACKBAR_DURATION_MS = 3000;

// Track number of messages shown so we don't accidentally hide a later message.
let showNumber = 0;

let snackbarOriginalClassName;
let iconOriginalClassName;

/**
 * Shows a red snackbar with an error icon.
 * @param {string} msg the message to be shown
 */
function showErrorSnackbar(msg) {
  showSnackbar(
      msg, ['snackbar-error'], ['fa', 'fa-exclamation-circle', 'fa-2x']);
}

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
  let snackbar = document.getElementById('snackbar');

  // Lazily initialize the snackbar.
  if (!snackbar) {
    initializeSnackbar();
    snackbar = document.getElementById('snackbar');
  }

  const icon = document.getElementById('snackbar-icon');
  snackbar.className = snackbarOriginalClassName;
  icon.className = iconOriginalClassName;

  if (snackbarClasses) {
    snackbarClasses.forEach(
        (snackbarClass) => snackbar.classList.add(snackbarClass));
  }

  if (iconClasses) {
    iconClasses.forEach((iconClass) => icon.classList.add(iconClass));
  }

  document.getElementById('snackbar-text').innerText = msg;

  $('#snackbar').fadeIn(ANIMATION_DURATION_MS);

  const currentShow = ++showNumber;

  if (duration > 0) {
    setTimeout(() => {
      // Only clear the snackbar if the current shown snackbar is the latest.
      if (currentShow === showNumber) {
        $('#snackbar').fadeOut(ANIMATION_DURATION_MS);
      }
    }, duration);
  }
}

/** Creates the snackbar element and initializes original class lists. */
function initializeSnackbar() {
  const icon = $('<i id="snackbar-icon"></i>')
                   .addClass('snackbar-icon')
                   .attr('aria-hidden', 'true');
  const snackbarText = $('<span id="snackbar-text"></span>');
  const snackbar =
      $('<div id="snackbar"></div>').append(icon).append(snackbarText);
  $('body').append(snackbar);

  snackbarOriginalClassName = snackbar.attr('class');
  iconOriginalClassName = icon.attr('class');
}
