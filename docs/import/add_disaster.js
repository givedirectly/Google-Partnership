import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import TaskAccumulator from './task_accumulator.js';
import SettablePromise from '../settable_promise';

export {addDisaster, taskAccumulator};

function enableWhenReady() {

}

// Necessary for listAssets.
ee.data.setCloudApiEnabled(true);

// 2 tasks: EE authentication,
const taskAccumulator = new TaskAccumulator(2, enableWhenReady);
// TODO: do something with this promise, pass it somewhere - probably once tagging happens.
const firebaseAuthPromise = new SettablePromise();
const authenticator = new Authenticator(
    (token) => firebaseAuthPromise.setPromise(authenticateToFirebase(token)),
    () => taskAccumulator.taskCompleted());
authenticator.start();

/** TODO: this doc */
function addDisaster(

) {}