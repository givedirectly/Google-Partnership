import {initializeDisasterPicker} from './disaster_picker.js';
import {getDisastersData, getUserFeatures} from './firestore_document.js';
import {HELP_DOC_URL, MANAGE_DISASTERS_HELP_URL, MANAGE_LAYERS_HELP_URL} from './help.js';
import {AUTHENTICATION_ERROR_CODE} from './firebase_privileges.js';
import {showError} from './error.js';

export {loadNavbarWithPicker};

const MANAGE_LAYERS_PAGE = 'import/manage_layers.html';
const MANAGE_DISASTERS_PAGE = 'import/manage_disaster.html';
const UPLOAD_IMAGE_COLLECTION_PAGE = 'import/upload_image_collection.html';

/**
 * Loads the navbar with a disaster picker.
 * @param {Promise} firebaseAuthPromise Promise that completes when Firebase
 *     login is done
 * @param {string} title Title of page
 * @param {?Function} changeDisasterHandler Function invoked when disaster is
 *     changed. If not specified, reloads page
 * @param {?Promise<Map<string, Object>>} firebaseDataPromise If caller has
 *     already kicked off a fetch of all disasters, pass that Promise in here to
 *     avoid a duplicate fetch
 */
function loadNavbarWithPicker(data) {
  let {
    firebaseAuthPromise,
    title,
    changeDisasterHandler,
    firebaseDataPromise,
    userShapesPromise
  } = data;
  if (!firebaseDataPromise) {
    firebaseDataPromise = firebaseAuthPromise.then(getDisastersData);
  }
  // On every callsite other than the main map, this will be null but if you're
  // there and using the nav, you're already on a privileged page.
  if (!userShapesPromise) {
    userShapesPromise = firebaseAuthPromise.then(getUserFeatures());
  }
  $('#navbar').load(getUrlUnderDocs('navbar.html'), async () => {
    const navInput = $('#nav-input')
    navInput.prop('disabled', true);
    $('#map-a').prop('href', getUrlUnderDocs(''));
    $('#nav-left')
        .load(
            getUrlUnderDocs('disaster_picker.html'),
            () => initializeDisasterPicker(
                firebaseDataPromise, changeDisasterHandler));
    $('#nav-title-header').html(title);
    $('#help-a').prop('href', getHelpUrl());
    try {
      // could also create a new document with same privileges and then
      // wouldn't be tied to this.
      await userShapesPromise;
    } catch (err) {
      if (err.code === AUTHENTICATION_ERROR_CODE) {
        $('#manage-layers-a').hide();
        $('#manage-disaster-a').hide();
        $('#upload-image-collection-a').hide();
      } else {
        showError(err, 'Error populating navbar. Try refreshing page.');
        $('#nav-input').hide();
      }
      return;
    }
    navInput.prop('disabled', false);
    $('#manage-layers-a').prop('href', getUrlUnderDocs(MANAGE_LAYERS_PAGE));
    $('#manage-disaster-a')
        .prop('href', getUrlUnderDocs(MANAGE_DISASTERS_PAGE));
    $('#upload-image-collection-a')
        .prop('href', getUrlUnderDocs(UPLOAD_IMAGE_COLLECTION_PAGE));
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
