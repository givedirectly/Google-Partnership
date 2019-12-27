import {trackEeAndFirebase} from './authenticate.js';
import createMap from './create_map.js';
import {readDisasterDocument} from './firestore_document.js';
import {loadNavbarWithPicker} from './navbar.js';
import {run} from './run.js';
import {initializeSidebar} from './sidebar.js';
import {TaskAccumulator} from './task_accumulator.js';

// The base Google Map, Initialized lazily to ensure doc is ready
let map = null;

// Two tasks: EE authentication and page load.
const taskAccumulator = new TaskAccumulator(
    2, () => run(map, firebaseAuthPromise, disasterMetadataPromise));

const firebaseAuthPromise = trackEeAndFirebase(taskAccumulator);
const disasterMetadataPromise = firebaseAuthPromise.then(readDisasterDocument);

google.charts.load('current', {packages: ['table', 'controls']});

// Load when document ready.
$(() => {
  initializeSidebar();
  map = createMap(disasterMetadataPromise);
  loadNavbarWithPicker(firebaseAuthPromise, 'Delphi Map');
  taskAccumulator.taskCompleted();
});
