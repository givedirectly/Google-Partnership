export {addLoadingElement, loadingElementFinished};

/**
 * A mapping from a div id to the the number of components currently being
 * loaded within that div
 */
const loadingCounterMap = {};

/**
 * Retrieves the loading overlay of a given div if it is present and logs an
 * error otherwise.
 *
 * @param {string} divId The id of the div that may contain a loading overlay.
 * @return {Object} the div of the loading overlay or undefined.
 */
function getLoadingOverlay(divId) {
  const overlay = document.getElementById(divId + '-loader');
  if (!overlay) {
    console.error(
        'Trying to update loading state for div \'' + divId +
        '\' which does not have a loader div \'' + divId + '-loader\'!');
  }
  return overlay;
}

/**
 * Takes an id of a div, increments that div's number of outstanding loading
 * elements, and updates its UI loading state accordingly.
 *
 * @param {string} divId The id of the div that needs to update loading state
 */
function addLoadingElement(divId) {
  const overlay = getLoadingOverlay(divId);
  if (!overlay) return;

  if (!loadingCounterMap[divId]) loadingCounterMap[divId] = 0;
  loadingCounterMap[divId]++;

  overlay.style.opacity = 1;
}

/**
 * Takes an id of a div, decrements that div's number of outstanding loading
 * elements, and updates its UI loading state accordingly.
 *
 * @param {string} divId The id of the div that needs to update loading state
 */
function loadingElementFinished(divId) {
  const overlay = getLoadingOverlay(divId);
  if (!overlay) return;

  if (!loadingCounterMap[divId]) {
    console.error('Inaccurately marking a loading element as finished!');
    return;
  }
  loadingCounterMap[divId]--;

  if (loadingCounterMap[divId] === 0) overlay.style.opacity = 0;
}
