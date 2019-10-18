const firebaseAdmin = require('firebase-admin');
const earthEngine = require('@google/earthengine');

// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

module.exports = (on, config) => {
  on('before:browser:launch', (browser = {}, args) => {
    if (browser.name === 'chromium') {
      const newArgs = args.filter((arg) => arg !== '--disable-gpu');
      newArgs.push('--ignore-gpu-blacklist');
      return newArgs;
    }
  });
  let currentApp = null;
  on('task', {
    /**
     * The following two functions use service account credentials (stored in
     * the json file pointed to by the environment variable
     * GOOGLE_APPLICATION_CREDENTIALS) to generate tokens that can be used by
     * production code to authenticate with Firebase/EarthEngine.
     *
     * We do these initializations in this plugin because creating such a custom
     * token that's easy to pass around can best be done in libraries that are
     * only available on Node, not client-side Javascript (for Firebase, the
     * Firebase Admin SDK). Even Cypress tests, though they appear to run in
     * Node, are actually browserified, and the above modules don't work there.
     * Thus, we use genuine Node modules, and then pass the created tokens back
     * out to the test, where it can use them (in the case of Firebase) and also
     * set cookies for the production code to use.
     */

    /**
     * Produces a Firebase token that can only be used in documents that look
     * like 'usershapes-test/<blah>/suffix/<doc>', as determined by the Firebase
     * rules.
     *
     * @return {Promise<string>} The token to be used
     */
    initializeTestFirebase() {
      currentApp = firebaseAdmin.initializeApp(
          {
            credential: firebaseAdmin.credential.applicationDefault(),
            databaseURL: 'https://mapping-crisis.firebaseio.com',
          },
          'testFirebaseApp');
      const result =
          currentApp.auth().createCustomToken('cypress-firestore-test-user');
      // Firebase really doesn't like duplicate apps lying around, so clean up
      // immediately.
      result.then(() => currentApp.delete());
      return result.then((token) => {
        if (token) {
          return token;
        }
        throw new Error('No token generated');
      });
    },
    /**
     * Produces an EarthEngine token that can be used by production code.
     *
     * @return {Promise<string>}
     */
    getEarthEngineToken() {
      const privateKey = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      return new Promise((resolve, reject) => {
        earthEngine.data.authenticateViaPrivateKey(
            privateKey,
            // TODO(janakr): no better way to do this?
            // Strip 'Bearer ' from beginning.
            () => resolve(earthEngine.data.getAuthToken().substring(7)),
            reject);
      });
    },
  });
};
