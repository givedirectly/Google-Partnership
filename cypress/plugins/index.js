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
      return currentApp.auth().createCustomToken('cypress-firestore-test-user');
    },
    tearDownTestFirebase() {
      // Cypress doesn't like when you return Promise<undefined>.
      return currentApp.delete().then((result) => result || null);
    }
  });
};
