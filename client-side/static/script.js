import {authenticateToFirebase, Authenticator, initializeEE, initializeFirebase} from './authenticate.js';
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
          runOnInitialize);
      authenticator.start();
    } else {
      // We're inside a test. The test setup should have tokens for us that will
      // directly authenticate with Firebase. We still need to be on corp for
      // EarthEngine (but see next PR).
      initializeFirebase();
      const token = getCookieValue('TEST_FIREBASE_TOKEN');
      if (!token) {
        console.error('Did not receive Firestore token in test');
        return;
      }
      firebaseAuthPromise.setPromise(
          firebase.auth().signInWithCustomToken(token));
      initializeEE(runOnInitialize);
    }
  });
}

/**
 * Class that provides a Promise that will be completed when the Promise passed
 * into setPromise is complete. Useful when the Promise you want to wait for
 * will not be created until later.
 *
 * Users can safely call getPromise() before setPromise() has been called: the
 * returned Promise will complete once setPromise() is called and the argument
 * of setPromise() has completed.
 */
class SettablePromise {
  /** @constructor */
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

  /**
   * Sets the Promise to get the value of. Can only be called once.
   * @param {Promise<any>} promise
   */
  setPromise(promise) {
    if (this.promiseSet) {
      console.error('Promise already set: ', this, promise);
      return;
    }
    this.promiseSet = true;
    promise.then(this.resolveFunction).catch(this.rejectFunction);
  }

  /**
   * Returns the Promise that will eventually resolve to the value of the
   * Promise passed into setPromise.
   *
   * @return {Promise<any>}
   */
  getPromise() {
    return this.promise;
  }
}

setup();
