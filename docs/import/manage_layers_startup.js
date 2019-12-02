import {Authenticator} from '../authenticate.js';
import {loadNavbarWithTitle} from '../navbar.js';
import TaskAccumulator from '../task_accumulator.js';

import {populateColorFunctions} from './color_function_util.js';
import {enableWhenReady, updateAfterSort} from './manage_layers.js';

// 3 tasks: EE authentication, page load, firebase is logged in.
const taskAccumulator = new TaskAccumulator(3, enableWhenReady);

// TODO: EarthEngine processing can start even before Firebase authentication
//  happens, based on the locally stored current disaster. The only processing
//  we could do would be to list all assets in the disaster folder, but that
//  seems useful. When we start doing that, we can kick that off in
//  enableWhenReady and condition remaining work on the Firebase promise
//  completing.
Authenticator.trackEeAndFirebase(taskAccumulator)
    .then(() => taskAccumulator.taskCompleted());

$(() => taskAccumulator.taskCompleted());

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
