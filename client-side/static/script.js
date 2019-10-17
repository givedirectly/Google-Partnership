import {authenticateToFirebase, Authenticator} from './authenticate.js';
import createMap from './create_map.js';
import {inProduction} from './in_test_util.js';
import run from './run.js';
import {initializeSidebar} from './sidebar.js';
import {getCookieValue} from './in_test_util.js';

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

    if (inProduction()) {
      const authenticator = new Authenticator((token) => firebaseAuthPromise.setPromise(authenticateToFirebase(token)), () => run(map, firebaseAuthPromise.getPromise()));
      authenticator.start();
    } else {
        firebaseAuthPromise.setPromise(firebase.auth().signInWithCustomToken(
            getCookieValue('TEST_FIRESTORE_TOKEN')));
      const authenticator = new Authenticator(null, () => run(map, firebaseAuthPromise.getPromise()));
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
