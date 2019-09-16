export {setLoading};

/**
 * Takes an id of a div and updates that div's loading state (i.e. adds or
 * removes the loader overlay).
 *
 * @param {Number} divId The id of the div that needs to update loading state
 * @param {boolean} loading True iff the div is currently reloading content
 */
function setLoading(divId, loading) {
  if (loading) {
    const overlay = document.getElementById(divId + '-loader');
    if (overlay) {
      overlay.style.opacity = 1;
    }
  } else {
    const overlay = document.getElementById(divId + '-loader');
    if (overlay) {
      overlay.style.opacity = 0;
    }
  }
}
