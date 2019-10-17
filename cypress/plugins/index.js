// You can read more here:
// https://on.cypress.io/plugins-guide
// ***********************************************************

// This function is called when a project is opened or re-opened (e.g. due to
// the project's config changing)

const firebaseAdmin = require('firebase-admin');

process.env.GOOGLE_APPLICATION_CREDENTIALS = '/usr/local/google/home/janakr/Downloads/mapping-crisis-firebase-adminsdk-pw40g-e2e1f3a2b2.json';

module.exports = (on, config) => {
  on('before:browser:launch', (browser = {}, args) => {
    if (browser.name === 'chromium') {
      const newArgs = args.filter(arg => arg !== '--disable-gpu');
      newArgs.push('--ignore-gpu-blacklist');
      return newArgs;
    }
  });
  let currentApp = null;
  on('task', {
    initializeTestFirebase() {
      currentApp = firebaseAdmin.initializeApp({credential: firebaseAdmin.credential.applicationDefault(),
    databaseURL: 'https://mapping-crisis.firebaseio.com'}, 'testFirebaseApp');
      const result = currentApp.auth().createCustomToken('cypress-firestore-test-user');
      // Firebase really doesn't like duplicate apps lying around, so clean up
      // immediately.
      result.then(() => currentApp.delete());
      return result;
    },
  });
};
