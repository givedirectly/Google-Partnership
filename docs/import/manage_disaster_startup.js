// 3 tasks: EE authentication, page load, firebase data retrieved..
import {trackEeAndFirebase} from '../authenticate.js';
import {getDisastersData} from '../firestore_document.js';
import {loadNavbarWithPicker} from '../navbar.js';
import {TaskAccumulator} from '../task_accumulator.js';

import {enableWhenReady, onSetDisaster} from './manage_disaster.js';
import {toggleState} from './manage_disaster_add_delete.js';
import {setUpScoreBoundsMap, showDisabledKickoffButton} from './manage_disaster_base.js';
import {setUpFlexibleOnPageLoad} from './manage_disaster_flexible.js';
import {setUpStateBasedOnPageLoad} from './manage_disaster_state_based.js';

// Two tasks: EE and page load. Firebase is taken care of in the promise.
const taskAccumulator =
    new TaskAccumulator(2, () => enableWhenReady(firebaseDataPromise));

const firebaseAuthPromise = trackEeAndFirebase(taskAccumulator, true);
const firebaseDataPromise = firebaseAuthPromise.then(getDisastersData);

$(() => {
  loadNavbarWithPicker({
    firebaseAuthPromise,
    title: 'Manage Disaster',
    changeDisasterHandler: onSetDisaster,
    firebaseDataPromise,
    privilegedUserPromise: Promise.resolve(),
  });
  $('#create-new-disaster').on('click', () => toggleState(false));
  $('#cancel-new-disaster').on('click', () => toggleState(true));
  setUpStateBasedOnPageLoad();
  setUpFlexibleOnPageLoad();
  showDisabledKickoffButton('Initializing...');
  setUpScoreBoundsMap(document.getElementById('score-bounds-map'));
  taskAccumulator.taskCompleted();
});
