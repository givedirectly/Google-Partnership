import {getDisasters} from './firestore_document.js';
import {getDisaster} from './resources.js';

export {initializeDisasterPicker};

/**
 * Initializes the disaster picker.
 * @param {Promise} firebaseAuthPromise Promise that completes when logged in to
 *     Firebase
 */
function initializeDisasterPicker(firebaseAuthPromise) {
  firebaseAuthPromise.then(() => {
    getDisasters().then((querySnapshot) => {
      querySnapshot.forEach((disasterDoc) => {
        const currentDisaster = getDisaster();
        const disasterDropdown = $('#disaster-dropdown');
        const disasterItem = document.createElement('option');
        const disaster = disasterDoc.id;
        disasterItem.innerHTML = disaster;
        if (disaster === currentDisaster) {
          disasterItem.selected = 'selected';
        }
        disasterDropdown.prepend(disasterItem);
      });

      disasterDropdown.onchange = () => {
        localStorage.setItem('disaster', disasterDropdown.value);
        location.reload();
      };
    });
  });
}
