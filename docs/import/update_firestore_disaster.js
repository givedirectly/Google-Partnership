import {getFirestoreRoot} from '../firestore_document.js';
import {getDisaster} from '../resources.js';
import {showToastMessage} from '../toast.js';

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
 * messages in the toast bar as it does so and disabling the disaster picker
 * until write completes.
 * @param {Function} dataSupplier Function that returns data to be written for
 *     current disaster
 * @return {?Promise<void>} Returns when finished writing or null if it just
 * queued a write and doesn't know when that will finish.
 */
function updateDataInFirestore(dataSupplier) {
  if (state !== STATE.SAVED) {
    state = STATE.QUEUED_WRITE;
    return null;
  }
  startWrite();
  return innerUpdate(dataSupplier);
}

/**
 * Called "recursively" as writes complete. Separated out from
 * {@link updateDataInFirestore} so that we only notify the user once that we
 * are saving.
 * @param {Function} dataSupplier See {@link updateDataInFirestore}
 * @return {?Promise<void>} See {@link updateDataInFirestore}
 */
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

/** Notes that a write has started. Disable disaster picker and notify user. */
function startWrite() {
  $('#disaster-dropdown').prop('disabled', true);
  // Keep message up as long as saving is in progress.
  showToastMessage('Saving...', -1);
}

/** Notes that a write has started. Re-enable picker and notify user. */
function finishWrite() {
  $('#disaster-dropdown').prop('disabled', false);
  showToastMessage('Saved');
}
