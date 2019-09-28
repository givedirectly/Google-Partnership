export {addLoadingElement, loadingElementFinished, registerLoadingCallbacks};

/**
 * A mapping from a div id to the the number of components currently being
 * loaded within that div.
 */
const loadingCounterMap = {};

/**
 * A mapping from a div id to callbacks that should be performed on loading
 * state changes as well as dependent divs that need to also be considered.
 */
const loadingCallbackMap = {};

/** Values of loadingCallbackMap. */
class LoadingCallbackMapValue {
  /**
   * @param {function(): *} onStart Callback invoked on loading started
   * @param {function(): *} onFinish Callback invoked on loading finished
   * @param {string[]} dependentDivIds List of div ids that also need to be
   *     checked before acting on loading state changes
   */
  constructor(onStart, onFinish, dependentDivIds) {
    this.onStart = onStart;
    this.onFinish = onFinish;
    this.dependentDivIds = dependentDivIds ? dependentDivIds : [];
  }
}

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

  if (loadingCounterMap[divId] === 1) {
    overlay.style.opacity = 1;

    // Invoke the onStart callback if dependent divs are not already loading.
    const loadingCallbacks = loadingCallbackMap[divId];
    if (loadingCallbacks !== null && loadingCallbacks.onStart !== null &&
        loadingCallbacks.dependentDivIds.reduce(
            (acc, divId) => acc &&
                (!loadingCounterMap[divId] || loadingCounterMap[divId] === 0),
            true)) {
      loadingCallbacks.onStart();
    }
  }
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

  if (loadingCounterMap[divId] === 0) {
    overlay.style.opacity = 0;

    // Invoke the onFinish callback if dependent divs are also loaded.
    const loadingCallbacks = loadingCallbackMap[divId];
    if (loadingCallbacks !== null && loadingCallbacks.onFinish !== null &&
        loadingCallbacks.dependentDivIds.reduce(
            (acc, divId) => acc && loadingCounterMap[divId] === 0, true)) {
      loadingCallbacks.onFinish();
    }
  }
}

/**
 * Registers a callback to be run anytime loading is finished for a given set of
 * elements. Please note that this will override any callbacks already
 * registered on the elements.
 *
 * @param {string[]} divIds The ids of the divs that may change loading state.
 * @param {function(): *} onStart Callback invoked on loading started
 * @param {function(): *} onFinish Callback invoked on loading finished
 */
function registerLoadingCallbacks(divIds, onStart, onFinish) {
  for (let i = 0; i < divIds.length; i++) {
    loadingCallbackMap[divIds[i]] = new LoadingCallbackMapValue(
        onStart, onFinish,
        divIds.slice(0, i).concat(divIds.slice(i + 1, divIds.length)));
  }
}
