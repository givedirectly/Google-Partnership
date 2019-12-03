import {initializeDisasterPicker} from './disaster_picker.js';
import {getDisastersData} from './firestore_document.js';

export {loadNavbarWithPicker, loadNavbarWithTitle};

/**
 * Loads the navbar and invokes the callback upon load.
 *
 * @param {Function} callback the callback invoked upon load
 */
function loadNavbar(callback) {
  $('#navbar').load(getUrlUnderDocs('navbar.html'), () => {
    $('#map-a').prop('href', getUrlUnderDocs(''));
    $('#manage-layers-a')
        .prop('href', getUrlUnderDocs('import/manage_layers.html'));
    $('#manage-disaster-a')
        .prop('href', getUrlUnderDocs('import/manage_disaster.html'));
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
 * @param {?Function} changeDisasterHandler Function invoked when disaster is
 *     changed. If not specified, reloads page
 * @param {?Promise<Map<string, Object>>} firebaseDataPromise If caller has
 *     already kicked off a fetch of all disasters, pass that Promise in here to
 *     avoid a duplicate fetch
 */
function loadNavbarWithPicker(
    firebaseAuthPromise, changeDisasterHandler = null,
    firebaseDataPromise = null) {
  if (!firebaseDataPromise) {
    firebaseDataPromise = firebaseAuthPromise.then(getDisastersData);
  };
  loadNavbar(
      () => $('#nav-left')
                .load(
                    getUrlUnderDocs('disaster_picker.html'),
                    () => initializeDisasterPicker(
                        firebaseDataPromise, changeDisasterHandler)));
}

/**
 * Get url of a file in or below our docs directory by using the path of this
 * current script.
 * @param {string} pathFragment path fragment to append to '.../docs/'
 * @return {string}
 */
function getUrlUnderDocs(pathFragment) {
  return import.meta.url.replace(/navbar\.js$/, pathFragment);
}
