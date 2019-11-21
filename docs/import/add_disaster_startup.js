import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import {loadNavbarWithTitle} from '../navbar.js';
import TaskAccumulator from '../task_accumulator.js';

import {enableWhenReady, toggleState} from './add_disaster.js';

// 2 tasks: EE authentication, page load, firebase is logged in.
const taskAccumulator = new TaskAccumulator(3, enableWhenReady);

// TODO: EarthEngine processing can start even before Firebase authentication
//  happens, based on the locally stored current disaster. The only processing
//  we could do would be to list all assets in the disaster folder, but that
//  seems useful. When we start doing that, we can kick that off in
//  enableWhenReady and condition remaining work on the Firebase promise
//  completing.
Authenticator.withFirebasePromiseCloudApiAndTaskAccumulator(taskAccumulator).then(() => taskAccumulator.taskCompleted());

$(() => taskAccumulator.taskCompleted());

$('#create-new-disaster').on('click', () => toggleState(false));
$('#cancel-new-disaster').on('click', () => toggleState(true));

loadNavbarWithTitle('Add disaster');
