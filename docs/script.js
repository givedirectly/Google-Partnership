import {Authenticator} from './authenticate.js';
import createMap from './create_map.js';
import {readDisasterDocument} from './firestore_document.js';
import {loadNavbarWithPicker} from './navbar.js';
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

firebaseAuthPromiseWrapper.setPromise(
    Authenticator.trackEeAndFirebase(taskAccumulator));

google.charts.load('current', {packages: ['table', 'controls']});

// Load when document ready.
$(() => {
  initializeSidebar();
  map = createMap(disasterMetadataPromise);
  loadNavbarWithPicker(firebaseAuthPromise);
  taskAccumulator.taskCompleted();
});
