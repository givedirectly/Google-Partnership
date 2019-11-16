import {getDisaster, getDisasters} from './resources.js';

export {initializeDisasterPicker};

/**
 * Initializes the disaster picker.
 */
function initializeDisasterPicker() {
  const disasterDropdown = document.getElementById('disaster-dropdown');
  getDisasters().forEach(disaster => {
    const disasterItem = document.createElement('option');
    disasterItem.innerHTML = disaster;
    if (disaster === getDisaster()) {
      disasterItem.selected = 'selected';
    }
    disasterDropdown.appendChild(disasterItem);
  });

  disasterDropdown.onchange = () => {
    const params = new URLSearchParams(window.location.search);
    params.set('disaster', disasterDropdown.value);
    window.location.search = params.toString();
  };
}
