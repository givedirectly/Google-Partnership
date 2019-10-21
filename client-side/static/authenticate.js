export {
  authenticateToFirebase,
  Authenticator,
  firebaseConfig,
  initializeEE,
  initializeFirebase
};

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
const firebaseConfig = {
  apiKey: 'AIzaSyBAQkh-kRrYitkPafxVLoZx3E5aYM-auXM',
  authDomain: 'mapping-crisis.firebaseapp.com',
  databaseURL: 'https://mapping-crisis.firebaseio.com',
  projectId: 'mapping-crisis',
  storageBucket: 'mapping-crisis.appspot.com',
  messagingSenderId: '38420505624',
  appId: '1:38420505624:web:79425020e2f86c82a78f6d',
};

/**
 * Performs EarthEngine authentication and returns an auth object usable for
 * other things like GCS or Firebase.
 */
class Authenticator {
  /**
   * @constructor
   * @param {Function} authCallback Will receive the auth response coming from
   * authentication
   * @param {Function} eeInitializeCallback Called after EarthEngine
   *     initialization is complete
   * @param {Function} errorCallback Called on any errors (defaults to
   *     console.error)
   * @param {Array<string>} additionalScopes OAuth2 scopes to request, if any
   */
  constructor(
      authCallback, eeInitializeCallback, errorCallback = console.error,
      additionalScopes = []) {
    this.authCallback = authCallback;
    this.eeInitializeCallback = eeInitializeCallback;
    this.additionalScopes = additionalScopes;
    this.errorCallback = errorCallback;
    this.loginTasksToComplete = 2;
  }

  /** Kicks off all processes. */
  start() {
    this.eeAuthenticate(() => this.onSigninFailedFirstTime());
    const gapiSettings = Object.assign({}, gapiTemplate);
    gapiSettings.scope = this.additionalScopes.join(' ');
    gapi.load(
        'auth2',
        () => gapi.auth2.init(gapiSettings)
                  .then(() => this.onLoginTaskCompleted()));
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
        CLIENT_ID, () => this.internalInitializeEE(), failureCallback,
        this.additionalScopes);
  }

  /**
   * Falls back to showing a sign-in button on page so that user can click on
   * it, getting around pop-up-blocking functionality of browsers.
   */
  onSigninFailedFirstTime() {
    $('.g-sign-in').removeClass('hidden');
    $('.output').text('(Log in to see the result.)');
    $('.g-sign-in .button').click(() => {
      // TODO(janakr): If authentication fails here, user has to reload page to
      // try again. Not clear how that can happen, but maybe should be more
      // graceful?
      this.eeAuthenticate(
          (err) =>
              this.errorCallback('Error authenticating EarthEngine: ' + err));
      $('.g-sign-in').addClass('hidden');
    });
  }

  /** Initializes EarthEngine. */
  internalInitializeEE() {
    this.onLoginTaskCompleted();
    initializeEE(this.eeInitializeCallback, this.errorCallback);
  }

  /**
   * Notes that a login task has completed, and if all have, calls the callback
   * with the access token.
   */
  onLoginTaskCompleted() {
    if (--this.loginTasksToComplete === 0) {
      const user = gapi.auth2.getAuthInstance().currentUser.get();
      this.authCallback(user.getAuthResponse());
    }
  }
}

/** Initializes Firebase. Exposed only for use in test codepaths. */
function initializeFirebase() {
  firebase.initializeApp(firebaseConfig);
}

/** Initializes EarthEngine. Exposed only for use in test codepaths. */
function initializeEE(runCallback, errorCallback = console.error) {
  ee.initialize(
      /* opt_baseurl=*/ null, /* opt_tileurl=*/ null, runCallback,
      (err) => errorCallback('Error initializing EarthEngine: ' + err));
}

// Roughly copied from https://firebase.google.com/docs/auth/web/google-signin.

/**
 * Initializes Firebase and authenticates using the logged-in Google user
 * (most likely coming from Authenticator above).
 *
 * @param {gapi.auth2.AuthResponse} googleAuth
 * @return {Promise<any>} Promise that completes when authentication is done
 */
function authenticateToFirebase(googleAuth) {
  initializeFirebase();
  return new Promise((resolveFunction) => {
    const unsubscribe = firebase.auth().onAuthStateChanged((firebaseUser) => {
      unsubscribe();
      if (firebaseUser && firebaseUser.providerData &&
          firebaseUser.providerData[0].uid) {
        // The Firebase sample code checks that this is the same user as the
        // Google user. I don't really see how there can be a mismatch without
        // something pretty weird going on, so punting on it for now.
        console.warn('Not logging into Firebase again');
        resolveFunction(null);
        return;
      }
      // Build Firebase credential with the Google ID token.
      const credential =
          firebase.auth.GoogleAuthProvider.credential(googleAuth.id_token);
      // Sign in with credential from the Google user.
      const signinPromise = firebase.auth().signInWithCredential(credential);
      signinPromise.then(resolveFunction);
      return signinPromise;
    });
  });
}
