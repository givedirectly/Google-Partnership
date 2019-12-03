import {getFirestoreRoot} from '../firestore_document.js';
import {getDisaster} from '../resources.js';

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
 * Write the current state of a disaster's data to firestore.
 * @param {Function} dataSupplier Function that returns data to be written for current disaster
 * @param {Function} startCallback Function that should be called before a write starts (to indicate loading progress, for instance)
 * @param {Function} finishCallback Function called whenever a write ends
 * @return {?Promise<void>} Returns when finished writing or null if it just
 * queued a write and doesn't know when that will finish.
 */
function updateDataInFirestore(dataSupplier, startCallback, finishCallback) {
  if (state !== STATE.SAVED) {
    state = STATE.QUEUED_WRITE;
    return null;
  }
  startCallback();
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
            finishCallback();
            return null;
          case STATE.QUEUED_WRITE:
            finishCallback();
            return updateDataInFirestore(
                dataSupplier, startCallback, finishCallback);
          case STATE.SAVED:
            console.error('Unexpected write state');
            return null;
        }
      });
}
