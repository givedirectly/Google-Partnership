import {initializeDisasterPicker} from './disaster_picker.js';

export {loadNavbarWithPicker, loadNavbarWithTitle};

/**
 * Loads the navbar and invokes the callback upon load.
 *
 * @param {Function} callback the callback invoked upon load
 */
function loadNavbar(callback) {
  $('#navbar').load(getUrlRelativeToNavbarJs('navbar.html'), () => {
    $('#map-a').prop('href', getUrlRelativeToNavbarJs('index.html'));
    $('#add-disaster-a')
        .prop('href', getUrlRelativeToNavbarJs('import/add_disaster.html'));
    callback();
  });
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
 */
function loadNavbarWithPicker(firebaseAuthPromise) {
  loadNavbar(
      () => $('#nav-left')
                .load(
                    getUrlRelativeToNavbarJs('disaster_picker.html'),
                    () => initializeDisasterPicker(firebaseAuthPromise)));
}

/**
 * Get url of a file in or below our docs directory by using the path of this
 * current script.
 * @param {string} replaceWith
 * @return {string}
 */
function getUrlRelativeToNavbarJs(replaceWith) {
  return import.meta.url.replace(/navbar\.js$/, replaceWith);
}
