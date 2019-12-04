const earthEngine = require('@google/earthengine');
const firebaseAdmin = require('firebase-admin');
const firebase = require('firebase');

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
   * acceleration for Chromium and make sure developer console is open so errors
   * are visible.
   */
  on('before:browser:launch', (browser = {}, args) => {
    if (browser.name === 'chromium') {
      const newArgs = args.filter((arg) => arg !== '--disable-gpu');
      newArgs.push('--ignore-gpu-blacklist');
      newArgs.push('--start-maximized');
      newArgs.push('--auto-open-devtools-for-tabs');
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
     * Produces a Firebase token that can be used for our Firestore database.
     * Because the database belongs to a test-only user, this user is given free
     * reign to do whatever it likes. Also deletes all test data older than 24
     * hours, so there isn't indefinite build-up if tests are frequently aborted
     * before they clean up.
     *
     * See https://firebase.google.com/docs/auth/admin/create-custom-tokens.
     * @return {Promise<string>} The token to be used
     */
    initializeTestFirebase() {
      const currentApp = createTestFirebaseAdminApp();
      const deleteOldPromise = deleteAllOldTestData(currentApp);
      const result =
          currentApp.auth().createCustomToken('cypress-firestore-test-user');
      return Promise.all([result, deleteOldPromise]).then(async (list) => {
        // Firebase really doesn't like duplicate apps lying around, so clean up
        // immediately.
        await currentApp.delete();
        if (list[0]) {
          return list[0];
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
    /**
     * Recursively deletes all data under the test/currentTestRoot tree, and
     * creates necessary data for tests to consume, pulling that data from prod
     * Firebase. For use before a test case runs. We add a dummy field inside
     * test/currentTestRoot so that Firestore will deign to list this document
     * later
     * (https://stackoverflow.com/questions/47043651/this-document-does-not-exist-and-will-not-appear-in-queries-or-snapshots-but-id)
     * @param {string} currentTestRoot document name directly underneath test/
     * @return {Promise<null>} Promise that resolves when deletion and data
     * creation is complete
     */
    clearAndPopulateTestFirestoreData(currentTestRoot) {
      const testAdminApp = createTestFirebaseAdminApp();
      const prodApp = firebase.initializeApp(firebaseConfigProd, 'prodapp');
      // We use a test app, created using normal firebase, versus a test admin
      // app, because objects like GeoPoint are not compatible across the
      // libraries. By using the same library, we're able to copy the data from
      // prod to test with no modifications.
      const testApp = firebase.initializeApp(firebaseConfigTest, 'testapp');
      const signinPromise =
          testAdminApp.auth()
              .createCustomToken('cypress-firestore-test-user')
              .then((token) => testApp.auth().signInWithCustomToken(token));
      const deletePromise = deleteTestData(currentTestRoot, testAdminApp);
      const writePromises = [];
      for (const disaster
               of ['2017-harvey',
                   // TODO(janakr): add back so we have multiple disasters.
                   // '2018-michael',
      ]) {
        const documentPath = 'disaster-metadata/' + disaster;
        const prodDisasterDoc = prodApp.firestore().doc(documentPath);
        const testDisasterDocReference = testApp.firestore().doc(
            'test/' + currentTestRoot + '/' + documentPath);
        writePromises.push(
            Promise.all([prodDisasterDoc.get(), signinPromise, deletePromise])
                .then((result) => Promise.all([
                  testDisasterDocReference.set(result[0].data(), {merge: true}),
                  testDisasterDocReference.set({dummy: true}, {merge: true}),
                ])));
      }
      return Promise.all(writePromises)
          .then(
              () => Promise.all(
                  [testAdminApp.delete(), prodApp.delete(), testApp.delete()]))
          .then(() => null);
    },
    /**
     * Deletes all test data under the test/currentTestRoot tree. For use after
     * a test case is completed.
     * @param {string} currentTestRoot document name directly underneath test/
     * @return {Promise<null>} Promise that resolves when deletion is complete
     */
    deleteTestData(currentTestRoot) {
      const currentApp = createTestFirebaseAdminApp();
      const result = deleteTestData(currentTestRoot, currentApp);
      return result.then(() => currentApp.delete()).then(() => null);
    },
    /**
     * Debugging function that allows us to see output from Cypress in the
     * (Travis) console versus in the browser.
     * @param {string} str
     * @return {null}
     */
    logg(str) {
      console.log(str);
      return null;
    },
  });
};

/**
 * Creates a Firebase admin app for use in a test method. The app roughly
 * corresponds to a handle to Firebase, allowing us to do things like log in and
 * modify data. No more than one app with a given name can be active, so make
 * sure this app is deleted before the node process ends.
 * @return {admin.app.App}
 */
function createTestFirebaseAdminApp() {
  return firebaseAdmin.initializeApp(
      {
        credential: firebaseAdmin.credential.applicationDefault(),
        databaseURL: 'https://mapping-test-data.firebaseio.com',
      },
      'testAdminApp');
}

/**
 * Recursively deletes all test data, under the test/currentTestRoot root.
 * @param {string} currentTestRoot document name directly underneath test/
 * @param {admin.app.App} app
 * @return {Promise} Promise that resolves when all deletions are
 *     complete
 */
function deleteTestData(currentTestRoot, app) {
  return deleteDocRecursively(
      app.firestore().doc(testPrefix + currentTestRoot));
}

const millisecondsInADay = 60 * 60 * 24 * 1000;

/**
 * Recursively deletes all test data older than 24 hours, under the assumption
 * that no test runs for that long. This prevents old unfinished tests from
 * using too much quota. Note that documents must have a field set to show up in
 * a listing of the parent collection
 * (https://stackoverflow.com/questions/47043651/this-document-does-not-exist-and-will-not-appear-in-queries-or-snapshots-but-id).
 * That field is set in clearAndPopulateTestFirestoreData.
 * @param {admin.app.App} app
 * @return {Promise} Promise that completes when all deletions are finished
 */
function deleteAllOldTestData(app) {
  const currentDate = new Date();
  const querySnapshotPromise = app.firestore().collection(testPrefix).get();
  return querySnapshotPromise.then((queryResult) => {
    const promises = [];
    queryResult.forEach((doc) => {
      const ref = doc.ref;
      const testRunName = ref.id;
      const dateElement = testRunName.split('-')[0];
      const date = new Date(parseInt(dateElement, 10));
      if (currentDate - date > millisecondsInADay) {
        promises.push(deleteDocRecursively(ref));
      }
    });
    return Promise.all(promises);
  });
}

/**
 * Recursively deletes the given document and the documents under its
 * subcollections, etc.
 * @param {admin.firestore.DocumentReference} doc
 * @return {Promise} Promise that resolves when all deletions are complete
 */
function deleteDocRecursively(doc) {
  const promises = [];
  promises.push(doc.delete());
  promises.push(doc.listCollections().then((collections) => {
    const collectionPromises = [];
    for (const collection of collections) {
      collectionPromises.push(deleteCollectionRecursively(collection));
    }
    return Promise.all(collectionPromises);
  }));
  return Promise.all(promises);
}

/**
 * Recursively deletes all documents under a collection (and the documents under
 * their subcollections, etc.).
 * @param {admin.firestore.CollectionReference} collection
 * @return {Promise} Promise that resolves when all deletions are complete
 */
function deleteCollectionRecursively(collection) {
  return collection.get().then((queryResult) => {
    const promises = [];
    queryResult.forEach((doc) => promises.push(deleteDocRecursively(doc.ref)));
    return Promise.all(promises);
  });
}

const testPrefix = 'test/';

// TODO(janakr): Find a way to store this and authenticate's copy in one place.
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
