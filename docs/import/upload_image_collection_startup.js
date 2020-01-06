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

$(() => {
  loadNavbarWithPicker(firebaseAuthPromise, 'Upload Image Collection');
  taskAccumulator.taskCompleted();
});
