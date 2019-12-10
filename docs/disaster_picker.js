import {getDisaster} from './resources.js';

export {initializeDisasterPicker};

/**
 * Initializes the disaster picker.
 * @param {Promise<Map<string, Object>>} firebaseDataPromise Promise with data
 *     for all disasters
 * @param {?Function} changeDisasterHandler Function invoked when current
 *     disaster is changed. location.reload is called if null
 */
function initializeDisasterPicker(firebaseDataPromise, changeDisasterHandler) {
  const disasterDropdown = $('#disaster-dropdown');
  disasterDropdown.css('min-width', '250px');
  firebaseDataPromise.then((allDisasters) => {
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
