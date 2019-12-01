import {initializeDisasterPicker} from './disaster_picker.js';

export {loadNavbarWithPicker, loadNavbarWithTitle};

/**
 * Loads the navbar and invokes the callback upon load.
 *
 * @param {Function} callback the callback invoked upon load
 */
function loadNavbar(callback) {
  // Use this script's URL to derive the URL for navbar.html.
  $('#navbar').load(import.meta.url.replace(/\.js$/, '.html'), callback);
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

/**
 * Loads the navbar with a disaster picker.
 * @param {Promise} firebaseAuthPromise Promise that completes when Firebase
 *     login is done
 * @param {?Function} changeDisasterHandler Function invoked when disaster is
 *     changed. If not specified, reloads page
 */
function loadNavbarWithPicker(firebaseAuthPromise, changeDisasterHandler = location.reload) {
  loadNavbar(
      () => $('#nav-left')
                .load(
                    import.meta.url.replace('/navbar.js', '') +
                    '/disaster_picker.html',
                    () => initializeDisasterPicker(firebaseAuthPromise, changeDisasterHandler)));
}
