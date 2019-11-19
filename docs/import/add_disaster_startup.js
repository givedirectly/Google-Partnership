import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import {loadNavbar} from '../navbar.js';
import SettablePromise from '../settable_promise.js';
import {enableWhenReady, toggleState, updateAfterSort} from './add_disaster.js';
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

$('#create-new-disaster').on('click', () => toggleState(false));
$('#cancel-new-disaster').on('click', () => toggleState(true));

$('#tbody').sortable({
  revert: true,
  update: (event, ui) => updateAfterSort(ui),
  helper: function(e, tr) {
    const originals = tr.children();
    const helper = tr.clone();
    helper.children().each(/* @this HTMLElement */ function(index) {
      // Set helper cell sizes to match the original sizes
      $(this).width(originals.eq(index).width());
    });
    return helper;
  },
});

loadNavbar('Add disaster');
