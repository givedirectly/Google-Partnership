import {authenticateToFirebase, Authenticator, CLIENT_ID, initializeEE, initializeFirebase} from './authenticate.js';
import createMap from './create_map.js';
import {initializeDisasterPicker} from './disaster_picker.js';
import {readDisasterDocument} from './firestore_document.js';
import {earthEngineTestTokenCookieName, firebaseTestTokenCookieName, getCookieValue, inProduction} from './in_test_util.js';
import {loadNavbar} from './navbar.js';
import run from './run.js';
import SettablePromise from './settable_promise.js';
import {initializeSidebar} from './sidebar.js';
import TaskAccumulator from './task_accumulator.js';

// The base Google Map, Initialized lazily to ensure doc is ready
let map = null;
const firebaseAuthPromiseWrapper = new SettablePromise();
const firebaseAuthPromise = firebaseAuthPromiseWrapper.getPromise();
const disasterMetadataPromise = firebaseAuthPromise.then(readDisasterDocument);

// Two tasks: EE authentication and page load.
const taskAccumulator = new TaskAccumulator(
    2, () => run(map, firebaseAuthPromise, disasterMetadataPromise));

if (inProduction()) {
  const authenticator = new Authenticator(
      (token) =>
          firebaseAuthPromiseWrapper.setPromise(authenticateToFirebase(token)),
      () => taskAccumulator.taskCompleted());
  authenticator.start();
} else {
  // We're inside a test. The test setup should have tokens for us that will
  // directly authenticate with Firebase and EarthEngine.
  initializeFirebase();
  const firebaseToken = getCookieValue(firebaseTestTokenCookieName);
  if (!firebaseToken) {
    throw new Error('Did not receive Firebase token in test');
  }
  const eeToken = getCookieValue(earthEngineTestTokenCookieName);
  if (!eeToken) {
    throw new Error('Did not receive EarthEngine token in test');
  }

  firebaseAuthPromiseWrapper.setPromise(
      firebase.auth().signInWithCustomToken(firebaseToken));
  ee.data.setAuthToken(
      CLIENT_ID, 'Bearer', eeToken,
      // Expires in 3600 is a lie, but no need to tell the truth.
      /* expiresIn */ 3600, /* extraScopes */[],
      /* callback */ () => initializeEE(() => taskAccumulator.taskCompleted()),
      /* updateAuthLibrary */ false);
  taskAccumulator.taskCompleted();
}

google.charts.load('current', {packages: ['table', 'controls']});

// Load when document ready.
$(() => {
  initializeSidebar();
  map = createMap(disasterMetadataPromise);
  loadNavbar(
      () => $('#nav-left')
                .load(
                    '/disaster_picker.html',
                    () => initializeDisasterPicker(firebaseAuthPromise)));
  taskAccumulator.taskCompleted();
});
