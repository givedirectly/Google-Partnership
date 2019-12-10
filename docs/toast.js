export {showToastMessage};

const TOAST_DURATION_MS = 2000;

// Track number of messages shown so we don't accidentally hide a later message.
let showNumber = 0;

function showToastMessage(message, duration = TOAST_DURATION_MS) {
  const toast = document.getElementById('toast-message');
  toast.className = 'show';
  document.getElementById('toast-message-text').innerText = message;
  let currentShow = ++showNumber;
  if (duration > 0) {
    setTimeout(() => {
      if (currentShow === showNumber) {
        toast.className = 'hide';
      }
    }, duration);
  }
}
