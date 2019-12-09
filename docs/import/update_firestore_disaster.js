import {getFirestoreRoot} from '../firestore_document.js';
import {getDisaster} from '../resources.js';
import {showSnackbarMessage} from '../snackbar.js';

export {updateDataInFirestore};

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
 * Writes the current state of a disaster's data to firestore, displaying status
 * messages in the snackbar as it does so.
 * @param {Function} dataSupplier Function that returns data to be written for
 *     current disaster
 * @return {?Promise<void>} Returns when finished writing or null if it just
 * queued a write and doesn't know when that will finish.
 */
function updateDataInFirestore(dataSupplier, startCallback, finishCallback) {
  if (state !== STATE.SAVED) {
    state = STATE.QUEUED_WRITE;
    return null;
  }
  startWrite();
  innerUpdate(dataSupplier);
}

function innerUpdate(dataSupplier) {
  state = STATE.WRITING;
  pendingWriteCount++;
  return getFirestoreRoot()
      .collection('disaster-metadata')
      .doc(getDisaster())
      .set(dataSupplier(), {merge: true})
      .then(() => {
        pendingWriteCount--;
        const oldState = state;
        state = STATE.SAVED;
        switch (oldState) {
          case STATE.WRITING:
            finishWrite();
            return null;
          case STATE.QUEUED_WRITE:
            return innerUpdate(dataSupplier);
          case STATE.SAVED:
            console.error('Unexpected write state');
            return null;
        }
      });
}

function startWrite() {
  // Keep message up as long as saving is in progress.
  showSnackbarMessage('Saving...', -1);
}

function finishWrite() {
  showSnackbarMessage('Saved');
}
