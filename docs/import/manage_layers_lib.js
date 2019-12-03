import {writeWaiterId} from '../dom_constants.js';
import {getFirestoreRoot} from '../firestore_document.js';
import {addLoadingElement, loadingElementFinished} from '../loading.js';
import {getDisaster} from '../resources.js';

export {
  clearStatus,
  disasterData,
  getCurrentData,
  getCurrentLayers,
  getRowIndex,
  ILLEGAL_STATE_ERR,
  onUpdate,
  setCurrentDisaster,
  setDisasterData,
  setStatus,
  updateLayersInFirestore,
};

// A map of disaster names to data. This pulls once on firebase
// authentication and then makes local updates afterwards so we don't need to
// wait on firebase writes to read new info. Initialized when Firestore is
// ready, but set to an empty map for use in tests.
let disasterData = new Map();

/**
 * Sets the global {@link disasterData} to the passed-in parameter.
 * @param {Map} readDisasterData value to set disasterData to
 */
function setDisasterData(readDisasterData) {
  disasterData = readDisasterData;
}

/**
 * Utility function for getting current data.
 * @return {Object}
 */
function getCurrentData() {
  return disasterData.get(getDisaster());
}

/**
 * Utility function for getting current layers.
 * @return {Array<Object>}
 */
function getCurrentLayers() {
  return getCurrentData()['layers'];
}

/**
 * Sets the current disaster so getCurrentData works for testing.
 * @param {string} disasterId
 */
function setCurrentDisaster(disasterId) {
  localStorage.setItem('disaster', disasterId);
}

/**
 * Looks up the real (not table) index of the given row.
 * @param {JQuery<HTMLTableDataCellElement>} row
 * @return {string}
 */
function getRowIndex(row) {
  return row.children('.index-td').text();
}

/**
 * A common update method that writes to local data and firestore based on
 * a customizable version of the value of the input.
 * @param {Object} event
 * @param {string} property
 * @param {Function} fxn how to read/transform the raw value from the DOM.
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function onUpdate(event, property, fxn) {
  const input = $(event.target);
  const index = getRowIndex(input.parents('tr'));
  getCurrentLayers()[index][property] = fxn(input);
  return updateLayersInFirestore();
}

const STATE = {
  SAVED: 0,
  WRITING: 1,
  QUEUED_WRITE: 2,
};
Object.freeze(STATE);

let state = STATE.SAVED;
let pendingWriteCount = 0;

window.onbeforeunload = () => pendingWriteCount > 0 ? true : null;

/**
 * Write the current state of {@code disasterData} to firestore.
 * @return {?Promise<void>} Returns when finished writing or null if it just
 * queued a write and doesn't know when that will finish.
 */
function updateLayersInFirestore() {
  if (state !== STATE.SAVED) {
    state = STATE.QUEUED_WRITE;
    return null;
  }
  addLoadingElement(writeWaiterId);
  state = STATE.WRITING;
  pendingWriteCount++;
  return getFirestoreRoot()
      .collection('disaster-metadata')
      .doc(getDisaster())
      .set({layers: getCurrentLayers()}, {merge: true})
      .then(() => {
        pendingWriteCount--;
        const oldState = state;
        state = STATE.SAVED;
        switch (oldState) {
          case STATE.WRITING:
            // loadingElementFinished(writeWaiterId);
            return null;
          case STATE.QUEUED_WRITE:
            // loadingElementFinished(writeWaiterId);
            return updateLayersInFirestore();
          case STATE.SAVED:
            console.error('Unexpected layer write state');
            return null;
        }
      });
}

/**
 * Utility function for setting the status div.
 * @param {String} text
 */
function setStatus(text) {
  $('#status').text(text).show();
}

/** Utility function for clearing status div. */
function clearStatus() {
  $('#status').hide();
}

const ILLEGAL_STATE_ERR =
    'Internal Error: contact developer with the following information: ';
