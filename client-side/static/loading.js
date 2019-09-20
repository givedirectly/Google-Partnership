export {setLoading};

/**
 * Takes an id of a div and updates that div's loading state (i.e. shows or
 * hides its loader overlay).
 *
 * @param {Number} divId The id of the div that needs to update loading state
 * @param {boolean} loading True iff the div is currently reloading content
 */
function setLoading(divId, loading) {
  let overlay = document.getElementById(divId + '-loader');

  // Create the overlay if it does not exist already.
  if (!overlay) {
    const primaryDiv = document.getElementById(divId);
    if (!primaryDiv) return;

    overlay = document.createElement('div');
    overlay.id = divId + '-loader';
    overlay.className = 'loader';
    overlay.innerHTML = '<div class="ellipsis"><div></div><div></div><div>' +
        '</div><div></div></div>';

    primaryDiv.appendChild(overlay);
  }

  if (loading) {
    overlay.style.opacity = 1;
  } else {
    overlay.style.opacity = 0;
  }
}
