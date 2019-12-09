import {Authenticator} from '../authenticate.js';
import {loadNavbarWithPicker, loadNavbarWithTitle} from '../navbar.js';
import TaskAccumulator from '../task_accumulator.js';
import {populateColorFunctions} from './color_function_util.js';
import {enableWhenReady, onSetDisaster, updateAfterSort} from './manage_layers.js';
import {getDisastersData} from '../firestore_document.js';

// 2 tasks: EE authentication, page load. Firebase is taken care of by Promise,
// but enableWhenReady can do some work even before that.
const taskAccumulator = new TaskAccumulator(3, () => enableWhenReady(firebaseDataPromise));

// TODO: EarthEngine processing can start even before Firebase authentication
//  happens, based on the locally stored current disaster. The only processing
//  we could do would be to list all assets in the disaster folder, but that
//  seems useful. When we start doing that, we can kick that off in
//  enableWhenReady and condition remaining work on the Firebase promise
//  completing.
const firebaseAuthPromise = Authenticator.trackEeAndFirebase(taskAccumulator)
    .then(() => taskAccumulator.taskCompleted());
const firebaseDataPromise = firebaseAuthPromise.then(getDisastersData);

$(() => {
  loadNavbarWithPicker(firebaseAuthPromise, onSetDisaster, firebaseDataPromise);
  taskAccumulator.taskCompleted()
});

$(populateColorFunctions);

$('#tbody').sortable({
  revert: true,
  update: (event, ui) => updateAfterSort(ui),
  helper: (e, tr) => {
    const originals = tr.children();
    const helper = tr.clone();
    // Set helper cell sizes to match the original sizes so when being dragged
    // entire row maintains original width.
    helper.children().each(/* @this HTMLElement */ function(index) {
      $(this).width(originals.eq(index).width());
    });
    return helper;
  },
});
loadNavbarWithTitle('Manage layers');
