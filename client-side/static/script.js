import {authenticateToFirebase, Authenticator} from './authenticate.js';
import {initializeFirebase} from './authenticate.js';
import createMap from './create_map.js';
import {inProduction} from './in_test_util.js';
import {getCookieValue} from './in_test_util.js';
import run from './run.js';
import {initializeSidebar} from './sidebar.js';

export {map};

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
    const firebaseAuthPromise = new SettablePromise();

    map = createMap(firebaseAuthPromise.getPromise());

    const runOnInitialize = () => run(map, firebaseAuthPromise.getPromise());
    if (inProduction()) {
      const authenticator = new Authenticator(
          (token) =>
              firebaseAuthPromise.setPromise(authenticateToFirebase(token)),
          runOnInitialize, ['https://www.googleapis.com/auth/datastore']);
      authenticator.start();
    } else {
      initializeFirebase();
      firebaseAuthPromise.setPromise(firebase.auth().signInWithCustomToken(
          getCookieValue('TEST_FIRESTORE_TOKEN')));
      const authenticator = new Authenticator(null, runOnInitialize);
      authenticator.initializeEE();
    }
  });
}

class SettablePromise {
  constructor() {
    let resolveFunction = null;
    let rejectFunction = null;
    this.promise = new Promise((resolve, reject) => {
      resolveFunction = resolve;
      rejectFunction = reject;
    });
    this.resolveFunction = resolveFunction;
    this.rejectFunction = rejectFunction;
    this.promiseSet = false;
  }

  setPromise(promise) {
    if (this.promiseSet) {
      console.error('Promise already set: ', this, promise);
      return;
    }
    this.promiseSet = true;
    promise.then(this.resolveFunction).catch(this.rejectFunction);
  }

  getPromise() {
    return this.promise;
  }
}

setup();
