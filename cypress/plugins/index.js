const earthEngine = require('@google/earthengine');
const firebaseAdmin = require('firebase-admin');

// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

/**
 * This function is called when a project is opened or re-opened (e.g. due to
 * the project's config changing).
 *
 * @param {Function} on
 * @param {Object} config
 */
module.exports = (on, config) => {
  /**
   * Sets code that runs before browser is launched. We use this to enable GPU
   * acceleration for Chromium.
   */
  on('before:browser:launch', (browser = {}, args) => {
    if (browser.name === 'chromium') {
      const newArgs = args.filter((arg) => arg !== '--disable-gpu');
      newArgs.push('--ignore-gpu-blacklist');
      return newArgs;
    }
  });
  /**
   * Defines "tasks" that can be run using cy.task(). The name of each task is
   * the function name. These tasks are invoked in cypress/support/index.js in a
   * "before" hook, but they can theoretically be called anywhere that cy.task()
   * is legal to invoke.
   */
  on('task', {
    /**
     * The following two functions use service account credentials (stored in
     * the json file pointed to by the environment variable
     * GOOGLE_APPLICATION_CREDENTIALS) to generate tokens that can be used by
     * production code to authenticate with Firebase/EarthEngine. These tokens
     * are different from the actual service account credentials, which cannot
     * be used by a client-side Javascript application.
     *
     * We do these initializations in this plugin because creating such a custom
     * token that's easy to pass around can best be done in libraries that are
     * only available on Node, which runs in a "server"-like environment, not
     * client-side Javascript (for Firebase, the Firebase Admin SDK is only
     * available in Node). Even Cypress tests, though they appear to run in
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
     * See https://firebase.google.com/docs/auth/admin/create-custom-tokens.
     * @return {Promise<string>} The token to be used
     */
    initializeTestFirebase() {
      const currentApp = firebaseAdmin.initializeApp(
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
    log(str) {
      console.log(str);
    }
  });
};
