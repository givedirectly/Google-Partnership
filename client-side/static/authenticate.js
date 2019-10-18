export {Authenticator};

// The client ID from the Google Developers Console.
// TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s' +
    '.apps.googleusercontent.com';

const gapiTemplate = {
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  apiKey: 'AIzaSyAbNHe9B0Wo4MV8rm3qEdy8QzFeFWZERHs',
  clientId: CLIENT_ID,
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
