import {initializeDisasterPicker} from './disaster_picker.js';

export {loadNavbarWithTitle, loadNavbarWithPicker};

/**
 * Loads the navbar and invokes the callback upon load.
 *
 * @param {Function} callback the callback invoked upon load
 */
function loadNavbar(callback) {
  $('#navbar').load('/navbar.html', callback);
}

/**
 * Loads the navbar and sets the title.
 *
 * @param {string} title the title of the navbar
 */
function loadNavbarWithTitle(title) {
  $(() => loadNavbar(() => {
      const navHeader = $('<h1></h1>');
      navHeader.addClass('nav-header');
      navHeader.html(title);
      $('#nav-left').append(navHeader);
    }));
}

function loadNavbarWithPicker(firebaseAuthPromise) {
  loadNavbar(
      () => $('#nav-left')
          .load(
              '/disaster_picker.html',
              () => initializeDisasterPicker(firebaseAuthPromise)));
}
