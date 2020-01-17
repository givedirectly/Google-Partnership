import {trackEeAndFirebase} from '../authenticate.js';
import {loadNavbarWithPicker} from '../navbar.js';
import {TaskAccumulator} from '../task_accumulator.js';
import {setUpAllHeaders} from './upload_image_collection.js';

const storageScope = 'https://www.googleapis.com/auth/devstorage.read_write';

// 2 tasks: EE authentication, page load. Firebase is taken care of by Promise.
const taskAccumulator =
    new TaskAccumulator(2, () => firebaseAuthPromise.then(setUpAllHeaders));

const firebaseAuthPromise =
    trackEeAndFirebase(taskAccumulator, true, [storageScope]);

let nameLength = 0;
let filesLength = 0;

$(() => {
  // Enable the file button when appropriate.
  document.getElementById('collectionName').oninput = (event) => {
    nameLength = event.target.value.length;
    if (nameLength > 0 && filesLength > 0) {
      document.getElementById('fileButton').disabled = false;
    } else {
      document.getElementById('fileButton').disabled = true;
    }
  };
  document.getElementById('files').onchange = (event) => {
    console.log(event.target.files.length);
    filesLength = event.target.files.length;
    if (nameLength > 0 && filesLength > 0) {
      document.getElementById('fileButton').disabled = false;
    } else {
      document.getElementById('fileButton').disabled = true;
    }
  };

  loadNavbarWithPicker({
    firebaseAuthPromise,
    title: 'Upload Image Collection',
    privilegedUserPromise: Promise.resolve(),
  });

  taskAccumulator.taskCompleted();
});
