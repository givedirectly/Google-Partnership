import {initializeDisasterPicker} from './disaster_picker.js';
import {getDisastersData} from './firestore_document.js';
import {HELP_DOC_URL, MANAGE_DISASTERS_HELP_URL, MANAGE_LAYERS_HELP_URL} from './help.js';

export {loadNavbarWithPicker};

const MANAGE_LAYERS_PAGE = 'import/manage_layers.html';
const MANAGE_DISASTERS_PAGE = 'import/manage_disaster.html';
const UPLOAD_IMAGE_COLLECTION_PAGE = 'import/upload_image_collection.html';

/**
 * Loads the navbar and invokes the callback upon load.
 *
 * @param {Function} callback the callback invoked upon load
 */
function loadNavbar(callback) {
  $('#navbar').load(getUrlUnderDocs('navbar.html'), () => {
    $('#map-a').prop('href', getUrlUnderDocs(''));
    $('#manage-layers-a').prop('href', getUrlUnderDocs(MANAGE_LAYERS_PAGE));
    $('#manage-disaster-a')
        .prop('href', getUrlUnderDocs(MANAGE_DISASTERS_PAGE));
    $('#upload-image-collection-a')
        .prop('href', getUrlUnderDocs(UPLOAD_IMAGE_COLLECTION_PAGE));
    $('#help-a').prop('href', getHelpUrl());
    callback();
  });
}

/**
 * Loads the navbar with a disaster picker.
 * @param {Promise<any>} firebaseAuthPromise Promise that completes when
 *     Firebase login is done
 * @param {string} title Title of page
 * @param {?Function} changeDisasterHandler Function invoked when disaster is
 *     changed. If not specified, reloads page
 * @param {?Promise<Map<string, DisasterDocument>>} firebaseDataPromise If
 *     caller has already kicked off a fetch of all disasters, pass that Promise
 *     in here to avoid a duplicate fetch
 */
function loadNavbarWithPicker(
    firebaseAuthPromise, title, changeDisasterHandler = null,
    firebaseDataPromise = null) {
  if (!firebaseDataPromise) {
    firebaseDataPromise = firebaseAuthPromise.then(getDisastersData);
  }
  loadNavbar(() => {
    $('#nav-left')
        .load(
            getUrlUnderDocs('disaster_picker.html'),
            () => initializeDisasterPicker(
                firebaseDataPromise, changeDisasterHandler));
    $('#nav-title-header').html(title);
  });
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

/**
 * Gets the url for the help section relevant to the current page
 * @return {string}
 */
function getHelpUrl() {
  if (window.location.pathname.endsWith(MANAGE_LAYERS_PAGE)) {
    return MANAGE_LAYERS_HELP_URL;
  } else if (window.location.pathname.endsWith(MANAGE_DISASTERS_PAGE)) {
    return MANAGE_DISASTERS_HELP_URL;
  }
  return HELP_DOC_URL;
}
