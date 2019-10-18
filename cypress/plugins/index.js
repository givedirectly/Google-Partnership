// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

const firebaseAdmin = require('firebase-admin');

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
     * Uses Firebase service account credentials (stored in the json file
     * pointed to by the environment variable GOOGLE_APPLICATION_CREDENTIALS)
     * to generate a "custom token" that can be used by both the test and
     * production code to authenticate with Firebase. This token can only be
     * used in documents that look like 'usershapes-test/<blah>/suffix/doc', as
     * determined by the Firebase rules.
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
      return result.then((token) => {return token || throw Error('No token')});
    },
  });
};
