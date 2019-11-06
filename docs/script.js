import {authenticateToFirebase, Authenticator, CLIENT_ID, initializeEE, initializeFirebase} from './authenticate.js';
import createMap from './create_map.js';
import {earthEngineTestTokenCookieName, firebaseTestTokenCookieName, getCookieValue, inProduction} from './in_test_util.js';
import run from './run.js';
import SettablePromise from './settable_promise.js';
import {initializeSidebar} from './sidebar.js';
import {getDisaster, getResources} from './resources.js';

// The base Google Map, Initialized lazily to ensure doc is ready
let map = null;

/**
 * Runs immediately (before document may have fully loaded). Adds a hook so that
 * when the document is loaded, Google Map is initialized, and on successful
 * login, EE data is overlayed.
 */
function setup() {
  google.charts.load('current', {packages: ['table', 'controls']});

  $(document).ready(function() {
    initializeSidebar();
    const firebaseAuthPromiseWrapper = new SettablePromise();

    // TODO: Have this return a map promise so that we can kick off other
    // processes (esp ee ones) without waiting on firebase.
    const firebaseAuthPromise = firebaseAuthPromiseWrapper.getPromise();
    const disasterMetadataPromise =
        firebaseAuthPromise.then(getDisasterDocument);
    map = createMap(disasterMetadataPromise);

    const runOnInitialize = () =>
        run(map, firebaseAuthPromise, disasterMetadataPromise);
    if (inProduction()) {
      const authenticator = new Authenticator(
          (token) => firebaseAuthPromiseWrapper.setPromise(
              authenticateToFirebase(token)),
          runOnInitialize);
      authenticator.start();
    } else {
      // We're inside a test. The test setup should have tokens for us that will
      // directly authenticate with Firebase and EarthEngine.
      initializeFirebase();
      const firebaseToken = getCookieValue(firebaseTestTokenCookieName);
      if (!firebaseToken) {
        console.error('Did not receive Firebase token in test');
        return;
      }
      const eeToken = getCookieValue(earthEngineTestTokenCookieName);
      if (!eeToken) {
        console.error('Did not receive EarthEngine token in test');
        return;
      }

      firebaseAuthPromiseWrapper.setPromise(
          firebase.auth().signInWithCustomToken(firebaseToken));
      ee.data.setAuthToken(
          CLIENT_ID, 'Bearer', eeToken,
          // Expires in 3600 is a lie, but no need to tell the truth.
          /* expiresIn */ 3600, /* extraScopes */[],
          /* callback */ () => initializeEE(runOnInitialize),
          /* updateAuthLibrary */ false);
    }
  });
}

/**
 * Fetches the document with all metadata for the current disaster. Should only
 * be called once to avoid excessive fetches.
 * @return {Promise<firebase.firestore.DocumentSnapshot>}
 */
function getDisasterDocument() {
  return firebase.firestore()
      .doc('disaster-metadata/' + getResources().year + '-' + getDisaster())
      .get();
}

setup();
