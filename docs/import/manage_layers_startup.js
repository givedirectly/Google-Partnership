import {trackEeAndFirebase} from '../authenticate.js';
import {getDisastersData} from '../firestore_document.js';
import {loadNavbarWithPicker} from '../navbar.js';
import {getDisaster} from '../resources.js';
import {TaskAccumulator} from '../task_accumulator.js';
import {populateColorFunctions} from './color_function_util.js';
import {enableWhenReady, onSetDisaster, setUpDisasterPicker, updateAfterSort} from './manage_layers.js';

// 2 tasks: EE authentication, page load. Firebase is taken care of by Promise,
// but enableWhenReady can do some work even before that.
const taskAccumulator =
    new TaskAccumulator(2, () => enableWhenReady(firebaseDataPromise));

const firebaseAuthPromise = trackEeAndFirebase(taskAccumulator, true);
const firebaseDataPromise = firebaseAuthPromise.then(getDisastersData);

$(() => {
  loadNavbarWithPicker({
    firebaseAuthPromise,
    title: 'Manage Layers',
    changeDisasterHandler: onSetDisaster,
    firebaseDataPromise,
    privilegedUserPromise: Promise.resolve(),
  });
  taskAccumulator.taskCompleted();
});

$(populateColorFunctions);
$(() => setUpDisasterPicker(getDisaster()));

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
