import {API_KEY, CLIENT_ID} from './common_auth_utils.js';
import {eeLegacyPathPrefix, eeLegacyPrefix} from './ee_paths.js';
import {showError} from './error.js';
import {listEeAssets} from './import/ee_utils.js';
import {earthEngineTestTokenCookieName, firebaseTestTokenPropertyName, getValueFromLocalStorage, inProduction} from './in_test_util.js';
import {CONTACT, OWNER} from './owner.js';
import {getBackupScoreAssetPath, getDisaster, getScoreAssetPath} from './resources.js';
import {SettablePromise} from './settable_promise.js';
import {showToastMessage} from './toast.js';
a

export {reloadWithSignIn, trackEeAndFirebase};
// For testing.
export {firebaseConfigProd, firebaseConfigTest, getFirebaseConfig};

const gapiTemplate = {
  apiKey: API_KEY,
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
   * @param {Array<string>} additionalScopes
   */
  constructor(eeInitializeCallback, needsGdUser, additionalScopes) {
    this.eeInitializeCallback = eeInitializeCallback;
    this.needsGdUser = needsGdUser;
    this.additionalScopes = additionalScopes;
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
    gapiSettings.scope = this.additionalScopes.join(' ');
    return new Promise(
        (resolve, reject) => gapi.load(
            'auth2',
            () => this.gapiInitDone.setPromise(
                gapi.auth2.init(gapiSettings).then(() => {
                  const currentUser =
                      gapi.auth2.getAuthInstance().currentUser.get();
                  const basicProfile = currentUser.getBasicProfile();
                  if (!basicProfile) {
                    doSignIn();
                  }
                  const isGdUser =
                      basicProfile && basicProfile.getEmail() === OWNER;
                  if (this.needsGdUser && !isGdUser) {
                    alert(
                        'You must be signed in as ' + OWNER + ' to ' +
                        'access this page. Please open in an incognito window' +
                        ' or sign in as ' + OWNER +
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
        showToastMessage(
            'Not whitelisted for EarthEngine access: ' +
                'trying anonymous access',
            -1);
        this.getAndSetEeTokenWithErrorHandling().then(() => {
          showToastMessage('Anonymous access successful', 1000);
          initializeEE(this.eeInitializeCallback, defaultErrorCallback);
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
            // TODO(#395): Find GD contact to list here.
            alert(
                'Error contacting server for access without EarthEngine ' +
                        'whitelisting. Please reload page and log in with an ' +
                        'EarthEngine-whitelisted account or contact ' +
                        CONTACT ?
                    CONTACT :
                    OWNER + ' ' +
                        'with error from JavaScript console.');
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
 * @param {Array<string>} additionalScopes Additional scopes to request if
 *     needed
 * @return {Promise} Promise that completes when Firebase is logged in
 */
function trackEeAndFirebase(
    taskAccumulator, needsGdUser = false, additionalScopes = []) {
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
    authenticator =
        new Authenticator(eeInitializeCallback, needsGdUser, additionalScopes);
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

const allReadBinding = Object.freeze({
  role: 'roles/viewer',
  members: ['allUsers'],
});

/**
 * Lists assets in the current disaster's folder and for any that match a score
 * asset path (either standard or backup) and are not already world-readable,
 * send a request to make that asset world-readable. This should only be called
 * when logged in as the GD user. It does not wait for these calls to complete,
 * and does not print any errors, since it is just trying to help other users,
 * and is not triggered by an explicit user action.
 *
 * Optimized for the common case of assets already being world-readable: the
 * getIamPolicy is technically not necessary, but usually it will avoid a set,
 * which should be at least as expensive.
 *
 * See
 * https://cloud.google.com/resource-manager/reference/rest/Shared.Types/Policy
 * for documentation of the `Policy` object, and
 * https://cloud.google.com/iam/docs/understanding-roles#primitive_roles for
 * some background on IAM roles.
 */
function makeScoreAssetsWorldReadable() {
  // TODO(janakr): Consider sharing cache with list_ee_assets.js. Not trivial
  //  because that code does additional EE requests to look at geometries, so
  //  we would need a two-level cache, one raw and one with geometries.
  listEeAssets(eeLegacyPathPrefix + getDisaster()).then((listedAssets) => {
    if (!listedAssets) {
      return;
    }
    const paths = new Set([getScoreAssetPath(), getBackupScoreAssetPath()]);
    const numAssets = paths.size;
    let foundAssets = 0;
    for (const {id} of listedAssets) {
      if (paths.has(id)) {
        foundAssets++;
        ee.data.getIamPolicy(eeLegacyPrefix + id, () => {}).then((policy) => {
          for (const binding of policy.bindings) {
            // Only want to modify 'reader' permissions.
            if (binding.role === 'roles/viewer') {
              if (!binding.members.includes('allUsers')) {
                binding.members.push('allUsers');
                ee.data.setIamPolicy(eeLegacyPrefix + id, policy, () => {});
              }
              return;
            }
          }
          // TODO(janakr): Do better. See what EE says.
          // If we got here, no roles/viewer binding. Use some Javascript magic.
          const BindingConstructor = policy.bindings[0].constructor;
          policy.bindings.push(new BindingConstructor(allReadBinding));
          ee.data.setIamPolicy(eeLegacyPrefix + id, policy, () => {});
        });
      }
      if (foundAssets === numAssets) {
        return;
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
 * @return {Promise<gapi.auth2.AuthResponse>} Promise that completes when
 *     authentication is done with the original gapi authorization response
 */
function authenticateToFirebase(googleUser) {
  initializeFirebase();
  return new Promise((resolve) => {
    const unsubscribe = firebase.auth().onAuthStateChanged((firebaseUser) => {
      unsubscribe();
      const authResponse = googleUser.getAuthResponse();
      if (isUserEqual(googleUser, firebaseUser)) {
        resolve(authResponse);
        return;
      }
      // Build Firebase credential with the Google ID token.
      const credential =
          firebase.auth.GoogleAuthProvider.credential(authResponse.id_token);
      // Sign in with credential from the Google user.
      const signinPromise = firebase.auth().signInWithCredential(credential);
      signinPromise.then(() => resolve(authResponse));
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
