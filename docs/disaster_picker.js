import {getDisasters} from './firestore_document.js';
import {getDisaster} from './resources.js';

export {initializeDisasterPicker};

/**
 * Initializes the disaster picker.
 * @param {Promise} firebaseAuthPromise Promise that completes when logged in to
 *     Firebase
 */
function initializeDisasterPicker(firebaseAuthPromise) {
  const disasterDropdown = $('#disaster-dropdown');
  firebaseAuthPromise.then(() => {
    getDisasters().then((querySnapshot) => {
      const currentDisaster = getDisaster();
      querySnapshot.forEach((disasterDoc) => {
        const disaster = disasterDoc.id;
        const disasterItem = $(document.createElement('option')).text(disaster);
        disasterDropdown.prepend(disasterItem);
      });
      disasterDropdown.val(currentDisaster);
    });
    disasterDropdown.on('change', () => {
      localStorage.setItem('disaster', disasterDropdown.val());
      location.reload();
    });
  });
}
