import {initializeDisasterPicker} from './disaster_picker.js';
import {showError} from './error.js';
import {AUTHENTICATION_ERROR_CODE} from './firebase_privileges.js';
import {getDisastersData} from './firestore_document.js';
import {getHelpUrl, getUrlUnderDocs} from './navbar_lib.js';

export {
  loadNavbarWithPicker,
  MANAGE_DISASTERS_PAGE,
  MANAGE_LAYERS_PAGE,
  UPLOAD_IMAGE_COLLECTION_PAGE,
};
// Visible for testing
export {loadNavbar};

const MANAGE_LAYERS_PAGE = 'import/manage_layers.html';
const MANAGE_DISASTERS_PAGE = 'import/manage_disaster.html';
const UPLOAD_IMAGE_COLLECTION_PAGE = 'import/upload_image_collection.html';

/**
 * Callback function for loading navbar.html that updates the bar based
 * on what kind of user is looking at it (firebase privileged or not).
 * @param {Promise<Map<string, Object>>} firebaseDataPromise Promise with data
 *     for all disasters
 * @param {?Function} changeDisasterHandler Function invoked when current
 *     disaster is changed. location.reload is called if null
 * @param {?Promise<any>} privilegedUserPromise if resolves without error,
 *     indicates should load navbar for a privileged user. If null, assumes not
 *     a privileged user. Often is a fetch of the usershapes collection.
 * @param {string} title Title of the page
 * @return {Promise<void>}
 */
async function loadNavbar(
    firebaseDataPromise, changeDisasterHandler, privilegedUserPromise, title) {
  const navToggle = $('#nav-toggle').hide();
  const navPublic = $('#public').hide();
  $('#nav-left')
      .load(
          getUrlUnderDocs('disaster_picker.html'),
          () => initializeDisasterPicker(
              firebaseDataPromise, changeDisasterHandler));
  $('#nav-title-header').html(title);
  $('.help-a').prop('href', getHelpUrl());
  if (!privilegedUserPromise) {
    navPublic.show();
    return;
  }
  try {
    await privilegedUserPromise;
  } catch (err) {
    if (err.code === AUTHENTICATION_ERROR_CODE) {
      navPublic.show();
    } else {
      showError(err, 'Error populating navbar. Try refreshing page.');
    }
    return;
  }
  navToggle.show();
  $('#map-a').prop('href', getUrlUnderDocs(''));
  $('#manage-layers-a').prop('href', getUrlUnderDocs(MANAGE_LAYERS_PAGE));
  $('#manage-disaster-a').prop('href', getUrlUnderDocs(MANAGE_DISASTERS_PAGE));
  $('#upload-image-collection-a')
      .prop('href', getUrlUnderDocs(UPLOAD_IMAGE_COLLECTION_PAGE));
}

/**
 * Loads the navbar with a disaster picker.
 * @param {Promise<void>} firebaseAuthPromise Promise that completes when
 *     Firebase login is done
 * @param {string} title Title of the page
 * @param {?Function} changeDisasterHandler Function invoked when current
 *     disaster is changed. location.reload is called if null
 * @param {?Promise<Map<string, Object>>} firebaseDataPromise Promise with data
 *     for all disasters
 * @param {?Promise<any>} privilegedUserPromise if resolves without error,
 *     indicates should load navbar for a privileged user. If null, assumes not
 *     a privileged user. Often is a fetch of the usershapes collection.
 */
function loadNavbarWithPicker({
  firebaseAuthPromise,
  title,
  changeDisasterHandler,
  firebaseDataPromise,
  privilegedUserPromise,
}) {
  if (!firebaseDataPromise) {
    firebaseDataPromise = firebaseAuthPromise.then(getDisastersData);
  }
  $('#navbar').load(
      getUrlUnderDocs('navbar.html'),
      () => loadNavbar(
          firebaseDataPromise, changeDisasterHandler, privilegedUserPromise,
          title));
}
