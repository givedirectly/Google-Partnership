import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import SettablePromise from '../settable_promise.js';
import {enableWhenReady, SENTINEL_NEW_DISASTER_VALUE, toggleState} from './add_disaster.js';
import TaskAccumulator from './task_accumulator.js';

export {taskAccumulator};

// 2 tasks: EE authentication, page load, firebase is ready.
const taskAccumulator = new TaskAccumulator(3, enableWhenReady);

// TODO: do something with this promise, pass it somewhere - probably once
// tagging happens.
const firebaseAuthPromise = new SettablePromise();
firebaseAuthPromise.getPromise().then(() => taskAccumulator.taskCompleted());
const authenticator = new Authenticator(
    (token) => firebaseAuthPromise.setPromise(authenticateToFirebase(token)),
    () => {
      // Necessary for listAssets.
      ee.data.setCloudApiEnabled(true);
      taskAccumulator.taskCompleted();
    });
authenticator.start();

$('#create-new-disaster')
    .on('click', () => toggleState(SENTINEL_NEW_DISASTER_VALUE));
