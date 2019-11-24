// 3 tasks: EE authentication, page load, firebase data retrieved..
import TaskAccumulator from "../task_accumulator.js";
import {Authenticator} from "../authenticate.js";
import {readDisasterDocument} from "../firestore_document.js";
import {enableWhenReady} from "./import_data.js";
import {loadNavbarWithPicker} from "../navbar.js";

// Two tasks: EE and page load. Firebase is taken care of in the promise.
const taskAccumulator = new TaskAccumulator(2, () => firebaseDataPromise.then(enableWhenReady));

const firebaseAuthPromise = Authenticator.withFirebasePromiseCloudApiAndTaskAccumulator(taskAccumulator);
const firebaseDataPromise = firebaseAuthPromise.then(readDisasterDocument);

$(() => {
  loadNavbarWithPicker(firebaseAuthPromise);
  taskAccumulator.taskCompleted()
});
