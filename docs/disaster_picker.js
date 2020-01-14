import {getDisaster} from './resources.js';

export {initializeDisasterPicker};

/**
 * Initializes the disaster picker.
 * @param {Promise<Map<string, DisasterDocument>>} firebaseDataPromise Promise
 *     with data for all disasters
 * @param {?Function} changeDisasterHandler Function invoked when current
 *     disaster is changed. location.reload is called if null
 */
function initializeDisasterPicker(firebaseDataPromise, changeDisasterHandler) {
  const disasterDropdown = $('#disaster-dropdown');
  firebaseDataPromise.then((allDisasters) => {
    $('#pending-disaster').hide();
    disasterDropdown.show();
    const currentDisaster = getDisaster();
    for (const disaster of allDisasters.keys()) {
      const disasterItem = $(document.createElement('option')).text(disaster);
      disasterDropdown.prepend(disasterItem);
    }
    disasterDropdown.val(currentDisaster);
    disasterDropdown.on('change', () => {
      localStorage.setItem('disaster', disasterDropdown.val());
      changeDisasterHandler ? changeDisasterHandler() : location.reload();
    });
  });
}
