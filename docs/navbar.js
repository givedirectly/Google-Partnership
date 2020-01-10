import {initializeDisasterPicker} from './disaster_picker.js';
import {showError} from './error.js';
import {AUTHENTICATION_ERROR_CODE} from './firebase_privileges.js';
import {getDisastersData, getUserFeatures} from './firestore_document.js';
import {getHelpUrl, getUrlUnderDocs} from './navbar_lib.js';

export {loadNavbarWithPicker};
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
 * @param {Promise<any>} privilegedUserPromise Promise with user shapes data *
 * @param {string} title Title of the page
 * @return {Promise<void>}
 */
async function loadNavbar(
    firebaseDataPromise, changeDisasterHandler, privilegedUserPromise, title) {
  // console.log($('#nav-toggle'));
  const navToggle = $('#nav-toggle').hide();
  const navPublic = $('#public').hide();
  $('#nav-left')
      .load(
          getUrlUnderDocs('disaster_picker.html'),
          () => initializeDisasterPicker(
              firebaseDataPromise, changeDisasterHandler));
  $('#nav-title-header').html(title);
  $('.help-a').prop('href', getHelpUrl());
  try {
    console.log('trying');
    await privilegedUserPromise;
  } catch (err) {
    console.log('error');
    if (err.code === AUTHENTICATION_ERROR_CODE) {
      navPublic.show();
    } else {
      showError(err, 'Error populating navbar. Try refreshing page.');
    }
    return;
  }
  console.log('succeeded');
  navToggle.show();
  console.log($('#nav-toggle').is(':visible'));
  $('#map-a').prop('href', getUrlUnderDocs(''));
  $('#manage-layers-a').prop('href', getUrlUnderDocs(MANAGE_LAYERS_PAGE));
  $('#manage-disaster-a').prop('href', getUrlUnderDocs(MANAGE_DISASTERS_PAGE));
  $('#upload-image-collection-a')
      .prop('href', getUrlUnderDocs(UPLOAD_IMAGE_COLLECTION_PAGE));
}

/**
 * Loads the navbar with a disaster picker.
 * @param {Object} data
 */
function loadNavbarWithPicker(data) {
  let {
    // promise that completes when Firebase login is done
    firebaseAuthPromise,
    // title of the page
    title,
    // function invoked when disaster is changed, if not specified, reloads page
    changeDisasterHandler,
    // fetch of all disasters
    firebaseDataPromise,
    // fetch of all user shapes - used as a proxy to determine if loading
    // for a privileged user or not
    userShapesPromise,
  } = data;
  if (!firebaseDataPromise) {
    firebaseDataPromise = firebaseAuthPromise.then(getDisastersData);
  }
  // On every page other than the main map, this will be null but if you're
  // there and using the nav, you're already on a privileged page so we know
  // this will resolve fine. Simplify?
  if (!userShapesPromise) {
    userShapesPromise = firebaseAuthPromise.then(getUserFeatures);
  }
  $('#navbar').load(
      getUrlUnderDocs('navbar.html'),
      () => loadNavbar(
          firebaseDataPromise, changeDisasterHandler, userShapesPromise,
          title));
}
