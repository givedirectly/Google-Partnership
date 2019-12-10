// 3 tasks: EE authentication, page load, firebase data retrieved..
import {Authenticator} from '../authenticate.js';
import {getDisastersData} from '../firestore_document.js';
import {loadNavbarWithPicker} from '../navbar.js';
import TaskAccumulator from '../task_accumulator.js';

import {enableWhenReady, onSetDisaster, setUpScoreSelectorTable, toggleState} from './manage_disaster.js';
import {
  createBasicMap,
} from '../basic_map.js';
import {createPopup, isMarker} from '../popup.js';
import {userRegionData} from '../user_region_data.js';
import {StoredShapeData} from '../polygon_draw.js';

// Two tasks: EE and page load. Firebase is taken care of in the promise.
const taskAccumulator =
    new TaskAccumulator(2, () => enableWhenReady(firebaseDataPromise));

const firebaseAuthPromise = Authenticator.trackEeAndFirebase(taskAccumulator);
const firebaseDataPromise = firebaseAuthPromise.then(getDisastersData);

$(() => {
  loadNavbarWithPicker(
      firebaseAuthPromise, 'Manage Disaster', onSetDisaster,
      firebaseDataPromise);
  $('#create-new-disaster').on('click', () => toggleState(false));
  $('#cancel-new-disaster').on('click', () => toggleState(true));
  setUpScoreSelectorTable();
  taskAccumulator.taskCompleted();
  initializeMap();
});

function initializeMap() {
  const {map} = createBasicMap(document.getElementById('map-bounds-map'), {streetViewControl: false});
  const drawingManager = new google.maps.drawing.DrawingManager({
    drawingControl: true,
    drawingControlOptions: {drawingModes: ['polygon']},
    polygonOptions: {editable: true, draggable: true},
  });

  drawingManager.addListener('overlaycomplete', (event) => {
    const feature = event.overlay;
    drawingManager.setMap(null);
  });

  drawingManager.setMap(map);
  return drawingManager;
}
