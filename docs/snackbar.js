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
  let snackbar = document.getElementById('snackbar');

  // Lazily initialize the snackbar.
  if (!snackbar) {
    initializeSnackbar();
    snackbar = document.getElementById('snackbar');
  }

  if (snackbarClasses) {
    snackbarClasses.forEach(
        (snackbarClass) => snackbar.classList.add(snackbarClass));
  }

  const icon = document.getElementById('snackbar-icon');
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
        $('#snackbar').fadeOut(ANIMATION_DURATION_MS, () => {
          // In case another snackbar is already being shown again, we don't
          // want to reset the styles.
          if (showNumber > 0) return;

          showNumber = 0;  // reset the counter to prevent overflow

          snackbar.className = snackbarOriginalClassName;
          icon.className = iconOriginalClassName;
        });
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
