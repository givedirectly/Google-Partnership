import {CLIENT_ID} from './common_auth_utils.js';
import {eeLegacyPathPrefix, eeLegacyPrefix} from './ee_paths.js';
import {listEeAssets} from './ee_utils.js';
import {showError} from './error.js';
import {earthEngineTestTokenCookieName, firebaseTestTokenPropertyName, getTestValue, getValueFromLocalStorage, inProduction,} from './in_test_util.js';
import {getBackupScoreAssetPath, getDisaster, getScoreAssetPath,} from './resources.js';
import {SettablePromise} from './settable_promise.js';

export {reloadWithSignIn, trackEeAndFirebase};
// For testing.
export {firebaseConfigProd, firebaseConfigTest, getFirebaseConfig};

const gapiTemplate = {
  // From same page as above.
  apiKey: 'AIzaSyBAQkh-kRrYitkPafxVLoZx3E5aYM-auXM',
  clientId: CLIENT_ID,
};

// Taken from
// https://console.firebase.google.com/project/mapping-crisis/settings/general/
const firebaseConfigProd = {
  apiKey: 'AIzaSyBAQkh-kRrYitkPafxVLoZx3E5aYM-auXM',
  authDomain: 'mapping-crisis.firebaseapp.com',
  databaseURL: 'https://mapping-crisis.firebaseio.com',
  projectId: 'mapping-crisis',
  storageBucket: 'mapping-crisis.appspot.com',
  messagingSenderId: '38420505624',
  appId: '1:38420505624:web:79425020e2f86c82a78f6d',
};

const firebaseConfigTest = {
  apiKey: 'AIzaSyDYBhqocosjCo6FKs-_L3gCDK5vRBXnB4k',
  authDomain: 'mapping-test-data.firebaseapp.com',
  databaseURL: 'https://mapping-test-data.firebaseio.com',
  projectId: 'mapping-test-data',
  storageBucket: 'mapping-test-data.appspot.com',
  messagingSenderId: '340543030947',
  appId: '1:340543030947:web:0cf3235904250687592116',
};

const gdUserEmail = 'gd-earthengine-user@givedirectly.org';

const eeErrorDialog =
    '<div title="EarthEngine authentication error">You do not appear to be ' +
    'whitelisted for EarthEngine access. Please whitelist your account at ' +
    '<a href="https://signup.earthengine.google.com">https://signup.earthengine.google.com</a>' +
    ' or sign into a whitelisted account after closing this dialog</div>';

const TOKEN_SERVER_URL = 'https://mapping-crisis.appspot.com';
// For local testing.
// const TOKEN_SERVER_URL = 'http://localhost:9080';

// Request a new token with 5 minutes of validity remaining on our current token
// to leave time for any slowness.
const TOKEN_EXPIRE_BUFFER = 300000;

/**
 * Logs an error message to the console and shows a snackbar notification
 * indicating an issue with authentication.
 *
 * @param {string} msg the message to be logged
 */
function defaultErrorCallback(msg) {
  showError(msg, 'Authentication Error');
}

/** Performs EarthEngine and Firebase authentication. */
class Authenticator {
  /**
   * @constructor
   * @param {Function} eeInitializeCallback Called after EarthEngine
   *     initialization is complete
   * @param {boolean} needsGdUser See {@link trackEeAndFirebase}
   */
  constructor(eeInitializeCallback, needsGdUser) {
    this.eeInitializeCallback = eeInitializeCallback;
    this.needsGdUser = needsGdUser;
    /** Promise will have boolean, true if gd user */
    this.gapiInitDone = new SettablePromise();
  }

  /**
   * Kicks off all processes.
   * @return {Promise<void>} Promise that completes when Firebase authentication
   *     is finished
   */
  start() {
    this.eeAuthenticate(() => this.navigateToSignInPage());
    const gapiSettings = Object.assign({}, gapiTemplate);
    gapiSettings.scope = '';
    return new Promise(
        (resolve, reject) => gapi.load(
            'auth2',
            () => this.gapiInitDone.setPromise(
                gapi.auth2.init(gapiSettings).then(() => {
                  const currentUser =
                      gapi.auth2.getAuthInstance().currentUser.get();
                  const basicProfile = currentUser.getBasicProfile();
                  const isGdUser =
                      basicProfile && basicProfile.getEmail() === gdUserEmail;
                  if (this.needsGdUser && !isGdUser) {
                    alert(
                        'You must be signed in as ' + gdUserEmail + ' to ' +
                        'access this page. Please open in an incognito window' +
                        ' or sign in as ' + gdUserEmail +
                        ' in this window after closing this alert.');
                    this.requireSignIn();
                  } else {
                    authenticateToFirebase(currentUser).then(resolve, reject);
                  }
                  return isGdUser;
                }))));
  }

  /**
   * Authenticates to EarthEngine. If not already logged in, tries to put up a
   * pop-up. If that fails (or if something else goes wrong), calls
   * failureCallback.
   *
   * @param {Function} failureCallback Called on failure
   */
  eeAuthenticate(failureCallback) {
    ee.data.authenticateViaOauth(
        CLIENT_ID, () => this.internalInitializeEE(), failureCallback, []);
  }

  /**
   * Redirects page so that user can log in, getting around pop-up-blocking
   * functionality of browsers.
   */
  navigateToSignInPage() {
    this.gapiInitDone.getPromise().then(doSignIn);
  }

  /**
   * Forces sign-in page to come up, even if user already signed into Google.
   * Useful if user is not signed in to a required account.
   */
  requireSignIn() {
    this.gapiInitDone.getPromise().then(reloadWithSignIn);
  }

  /** Initializes EarthEngine. */
  internalInitializeEE() {
    initializeEE(this.eeInitializeCallback, (err) => {
      if (err.message.includes('401') || err.message.includes('404')) {
        // HTTP code 401 indicates "unauthorized".
        // 404 shows up when not on Google internal network.
        // TODO(#340): Maybe don't require EE failure every time, store
        //  something in localStorage so that we know user needs token. Then
        //  tests can just set that as well, unifying the codepaths.
        const dialog = $(eeErrorDialog).dialog({
          buttons: [
            {
              text: 'Sign in with EarthEngine-enabled account',
              click: () => this.requireSignIn(),
            },
            {
              text: 'Continue without sign-in',
              click: () => {
                // Don't trigger close callback, but close dialog.
                dialog.dialog({close: () => {}});
                dialog.dialog('close');
                this.getAndSetEeTokenWithErrorHandling().then(
                    () => initializeEE(
                        this.eeInitializeCallback, defaultErrorCallback));
              },
            },
          ],
          modal: true,
          width: 600,
          close: () => this.requireSignIn(),
        });
      } else {
        defaultErrorCallback(err);
      }
    });
  }

  /**
   * Requests EE token from token server, then sets it locally, and sets itself
   * up to run again 5 minutes before token expires. Passes user's id token to
   * server so server can verify these aren't totally anonymous requests.
   * @return {Promise<void>} Promise that resolves when token has been set
   */
  getAndSetEeTokenWithErrorHandling() {
    // To get here, we must already have logged into Google via gapi, even if
    // not with an EE-enabled account, so Google user id token available.
    const idToken = gapi.auth2.getAuthInstance()
                        .currentUser.get()
                        .getAuthResponse()
                        .id_token;
    return fetch(TOKEN_SERVER_URL, {
             method: 'POST',
             body: $.param({idToken}),
             headers: {'Content-type': 'application/x-www-form-urlencoded'},
           })
        .then((response) => {
          if (!response.ok) {
            const message = 'Refresh token error: ' + response.status;
            console.error(message, response);
            // TODO(janakr): Find GD contact to list here.
            alert(
                'Error contacting server for access without EarthEngine ' +
                'whitelisting. Please reload page and log in with an ' +
                'EarthEngine-whitelisted account or contact website ' +
                'maintainers with error from JavaScript console.');
            throw new Error(message);
          }
          return response.json();
        })
        .then(
            ({accessToken, expireTime}) =>
                new Promise(
                    (resolve) => ee.data.setAuthToken(
                        CLIENT_ID, 'Bearer', accessToken,
                        Math.floor(
                            getMillisecondsToDateString(expireTime) / 1000),
                        /* extraScopes */[], resolve,
                        /* updateAuthLibrary */ false))
                    .then(
                        () => setTimeout(
                            () => this.getAndSetEeTokenWithErrorHandling(),
                            Math.max(
                                getMillisecondsToDateString(expireTime) -
                                    TOKEN_EXPIRE_BUFFER,
                                0))));
  }
}

/**
 * Static utility function for the most common use of this Authenticator:
 * logging into Firebase as soon as we have a Google user token, and
 * counting down a {@link TaskAccumulator} when EarthEngine is logged in.
 * @param {TaskAccumulator} taskAccumulator that will be counted down when
 *     EarthEngine is logged in
 * @param {boolean} needsGdUser True if page needs user to be logged in as GD
 *     user (gd-earthengine-user@givedirectly.org) in order to work
 * @return {Promise} Promise that completes when Firebase is logged in
 */
function trackEeAndFirebase(taskAccumulator, needsGdUser = false) {
  let authenticator;
  const eeInitializeCallback = () => {
    ee.data.setCloudApiEnabled(true);
    taskAccumulator.taskCompleted();
    if (!authenticator) {
      return;
    }
    authenticator.gapiInitDone.getPromise().then((isGdUser) => {
      if (isGdUser) {
        makeScoreAssetsWorldReadable();
      }
    });
  };

  if (inProduction()) {
    authenticator = new Authenticator(eeInitializeCallback, needsGdUser);
    return authenticator.start();
  } else {
    // We're inside a test. The test setup should have tokens for us that will
    // directly authenticate with Firebase and EarthEngine.
    initializeFirebase();
    const firebaseToken =
        getValueFromLocalStorage(firebaseTestTokenPropertyName);
    if (!firebaseToken) {
      throw new Error('Did not receive Firebase token in test');
    }
    const eeToken = getValueFromLocalStorage(earthEngineTestTokenCookieName);
    if (!eeToken) {
      throw new Error('Did not receive EarthEngine token in test');
    }
    ee.data.setAuthToken(
        CLIENT_ID, 'Bearer', eeToken,
        // Expires in 3600 is a lie, but no need to tell the truth.
        /* expiresIn */ 3600, /* extraScopes */[],
        /* callback */
        () => initializeEE(
            eeInitializeCallback,
            (err) => {
              throw new Error('EarthEngine init failure: ' + err);
            }),
        /* updateAuthLibrary */ false);
    return firebase.auth().signInWithCustomToken(firebaseToken);
  }
}

/** Initializes Firebase. Exposed only for use in test codepaths. */
function initializeFirebase() {
  firebase.initializeApp(getFirebaseConfig(inProduction()));
}

function makeScoreAssetsWorldReadable() {
  listEeAssets(eeLegacyPathPrefix + getDisaster()).then((listResult) => {
    if (!listResult) {
      return;
    }
    const paths = new Set([getScoreAssetPath(), getBackupScoreAssetPath()]);
    let foundAssets = 0;
    for (const {id} of listResult) {
      if (paths.has(id)) {
        ee.data.setAssetAcl(eeLegacyPathPrefix + id, {all_users_can_read: true}, () => {});
        foundAssets++;
      }
      if (foundAssets === paths.size) {
        break;
      }
    }
  });
}

/**
 * Initializes EarthEngine.
 * @param {Function} runCallback Called if initialization succeeds
 * @param {Function} failureCallback Called if initialization fails, likely
 *     because user not whitelisted for EarthEngine.
 */
function initializeEE(runCallback, failureCallback) {
  ee.initialize(
      /** opt_baseurl */ null, /** opt_tileurl */ null, runCallback,
      failureCallback);
}

/**
 * Returns the firebase config.
 * @param {boolean} inProduction If we are in production or a test
 * @return {Object} firebase config
 */
function getFirebaseConfig(inProduction) {
  return inProduction ? firebaseConfigProd : firebaseConfigTest;
}

/** Forces page to redirect to Google sign-in. */
function reloadWithSignIn() {
  doSignIn({prompt: 'select_account'});
}

/**
 * Redirects to Google sign-in, if necessary or if forced by options.
 * @param {gapi.auth.SignInOptions} extraOptions Dictionary of sign-in options
 */
function doSignIn(extraOptions = {}) {
  gapi.auth2.getAuthInstance().signIn(
      {...{ux_mode: 'redirect'}, ...extraOptions});
}

// Roughly copied from https://firebase.google.com/docs/auth/web/google-signin.

/**
 * Initializes Firebase and authenticates using the logged-in Google user
 * coming from Authenticator above.
 *
 * @param {gapi.auth2.GoogleUser} googleUser
 * @return {Promise<any>} Promise that completes when authentication is done
 */
function authenticateToFirebase(googleUser) {
  initializeFirebase();
  return new Promise((resolveFunction) => {
    const unsubscribe = firebase.auth().onAuthStateChanged((firebaseUser) => {
      unsubscribe();
      if (isUserEqual(googleUser, firebaseUser)) {
        resolveFunction(null);
        return;
      }
      // Build Firebase credential with the Google ID token.
      const credential = firebase.auth.GoogleAuthProvider.credential(
          googleUser.getAuthResponse().id_token);
      // Sign in with credential from the Google user.
      const signinPromise = firebase.auth().signInWithCredential(credential);
      signinPromise.then(resolveFunction);
      return signinPromise;
    });
  });
}

/**
 * Checks if a Firebase user is equal to the given Google user.
 * @param {gapi.auth2.GoogleUser} googleUser
 * @param {firebase.User} firebaseUser
 * @return {boolean}
 */
function isUserEqual(googleUser, firebaseUser) {
  if (firebaseUser) {
    for (const providerItem of firebaseUser.providerData) {
      if (providerItem.providerId ===
              firebase.auth.GoogleAuthProvider.PROVIDER_ID &&
          providerItem.uid === googleUser.getBasicProfile().getId()) {
        // We don't need to reauth the Firebase connection.
        return true;
      }
    }
  }
  return false;
}

/**
 * Given a string representation of a future time (in some format parsed by
 * {@link Date}, return the number of milliseconds from now until then.
 * @param {string} dateAsString
 * @return {number} Number of milliseconds until time given by `dateAsString`
 */
function getMillisecondsToDateString(dateAsString) {
  return Date.parse(dateAsString) - Date.now();
}
