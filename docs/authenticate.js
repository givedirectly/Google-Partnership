import {showError} from './error.js';
import {earthEngineTestTokenCookieName, firebaseTestTokenPropertyName, getValueFromLocalStorage, inProduction} from './in_test_util.js';
import SettablePromise from './settable_promise.js';

export {reloadWithSignIn, trackEeAndFirebase};
// For testing.
export {CLIENT_ID, firebaseConfigProd, firebaseConfigTest, getFirebaseConfig};

// The client ID from
// https://console.cloud.google.com/apis/credentials?project=mapping-crisis
const CLIENT_ID =
    '38420505624-boghq4foqi5anc9kc5c5tsq82ar9k4n0.apps.googleusercontent.com';

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
                  const basicProfile = gapi.auth2.getAuthInstance()
                                           .currentUser.get()
                                           .getBasicProfile();
                  if (this.needsGdUser &&
                      (!basicProfile ||
                       basicProfile.getEmail() !== gdUserEmail)) {
                    alert(
                        'You must be signed in as ' + gdUserEmail + ' to ' +
                        'access this page. Please open in an incognito window' +
                        ' or sign in as ' + gdUserEmail +
                        ' in this window after closing this alert.');
                    this.requireSignIn();
                  } else {
                    authenticateToFirebase(
                        gapi.auth2.getAuthInstance().currentUser.get())
                        .then(resolve, reject);
                  }
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
        // TODO(#340): Stand up a server that allows anonymous access in case of
        //  failure here.
        // TODO(#340): Maybe don't require EE failure every time, store
        //  something in localStorage so that we know user needs token.
        // Use a jQuery dialog because normal "alert" doesn't display hyperlinks
        // as clickable. Inferior, though, because it does allow page to
        // continue to load behind the dialog. Not too big a deal.
        $(eeErrorDialog)
            .dialog(
                {modal: true, width: 600, close: () => this.requireSignIn()});
      } else {
        defaultErrorCallback(err);
      }
    });
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
  if (inProduction()) {
    const authenticator = new Authenticator(() => {
      ee.data.setCloudApiEnabled(true);
      taskAccumulator.taskCompleted();
    }, needsGdUser);
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
            () => {
              ee.data.setCloudApiEnabled(true);
              taskAccumulator.taskCompleted();
            },
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
