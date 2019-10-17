export {Authenticator, authenticateToFirebase};

// The client ID from https://console.cloud.google.com/apis/credentials?project=mapping-crisis
const CLIENT_ID = '38420505624-boghq4foqi5anc9kc5c5tsq82ar9k4n0.apps.googleusercontent.com';

const gapiTemplate = {
  apiKey: 'AIzaSyAbNHe9B0Wo4MV8rm3qEdy8QzFeFWZERHs',
  clientId: CLIENT_ID,
};

const firebaseConfig =
    {
      apiKey: "AIzaSyBAQkh-kRrYitkPafxVLoZx3E5aYM-auXM",
      authDomain: "mapping-crisis.firebaseapp.com",
      databaseURL: "https://mapping-crisis.firebaseio.com",
      projectId: "mapping-crisis",
      storageBucket: "mapping-crisis.appspot.com",
      messagingSenderId: "38420505624",
      appId: "1:38420505624:web:79425020e2f86c82a78f6d"
    };

/**
 * Performs EarthEngine authentication and returns an access token usable for
 * other things like GCS or Firebase.
 */
class Authenticator {
  /**
   * @constructor
   * @param {Function} accessTokenCallback Will receive the access token coming
   *     from authentication
   * @param {Function} eeInitializeCallback Called after EarthEngine
   *     initialization is complete
   * @param {Function} errorCallback Called on any errors (defaults to
   *     console.error)
   * @param {Array<string>} additionalScopes OAuth2 scopes to request
   */
  constructor(
      accessTokenCallback, eeInitializeCallback, errorCallback = console.error,
      additionalScopes = []) {
    this.accessTokenCallback = accessTokenCallback;
    this.eeInitializeCallback = eeInitializeCallback;
    this.additionalScopes = additionalScopes;
    this.errorCallback = errorCallback;
    this.loginTasksToComplete = 2;
  }

  /** Kicks off all processes. */
  start() {
    ee.data.authenticateViaOauth(
        CLIENT_ID, () => this.initializeEE(),
        (err) => this.errorCallback('Error authenticating EarthEngine: ' + err),
        this.additionalScopes);
    const gapiSettings = Object.assign({}, gapiTemplate);
    gapiSettings.scope = this.additionalScopes.join(' ');
    gapi.load(
        'client:auth2',
        () => gapi.client.init(gapiSettings)
            .then(() => this.onLoginTaskCompleted()));
  }

  /** Initializes EarthEngine. */
  initializeEE() {
    this.onLoginTaskCompleted();
    ee.initialize(
        /* opt_baseurl=*/ null, /* opt_tileurl=*/ null,
        this.eeInitializeCallback,
        (err) => this.errorCallback('Error initializing EarthEngine: ' + err));
  }

  /**
   * Notes that a login task has completed, and if all have, calls the callback
   * with the access token.
   */
  onLoginTaskCompleted() {
    if (--this.loginTasksToComplete === 0) {
      const user = gapi.auth2.getAuthInstance().currentUser.get();
      this.accessTokenCallback(user.getAuthResponse().access_token);
    }
  }
}

// Roughly copied from https://firebase.google.com/docs/auth/web/google-signin.

function authenticateToFirebase(accessToken) {
  return new Promise((resolveFunction) => {
    const unsubscribe = firebase.auth().onAuthStateChanged((firebaseUser) => {
      unsubscribe();
      // TODO(janakr): sample code checks if already authenticated. I don't think
      // that ever succeeds for us, though.
      if (firebaseUser && firebaseUser.providerData && firebaseUser.providerData[0].uid) {
        console.warn('Already logged in on Firebase?? ', firebaseUser, firebaseUser.providerData);
      }
      // Build Firebase credential with the Google ID token.
      const credential = firebase.auth.GoogleAuthProvider.credential(accessToken);
      // Sign in with credential from the Google user.
      const signinPromise = firebase.auth().signInWithCredential(credential);
      signinPromise.then(resolveFunction);
      return signinPromise;
    });
  });
}
