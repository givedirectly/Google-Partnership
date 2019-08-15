import drawTable from './draw_table.js';
import processJoinedData from './process_joined_data.js';
import {map, eeConstants} from './script.js';
import {
  initializePriorityLayer,
  priorityLayerName
} from './run.js';
import {removeLayer} from './layer_util.js';

export {update as default};

/**
 * Updates map/list based on new poverty threshold.
 *
 * Takes ~5 seconds to generate with 0.0 threshold.
 */
function update() {
  const t = document.getElementById('threshold').value;
  document.getElementById('current-threshold').innerHTML =
      'Current poverty threshold: ' + t;
  updatePriorityLayer(ee.Number.parse(t));
}

/**
 * Removes the current score overlay on the map (if there is one).
 * Reprocesses scores with new povertyThreshold, overlays new score layer
 * and redraws table.
 *
 * @param {number}povertyThreshold
 */
function updatePriorityLayer(povertyThreshold) {
  removeLayer(map, priorityLayerName);

  const processedData =
      processJoinedData(eeConstants.joinedSnap, eeConstants.scalingFactor,
          povertyThreshold);
  initializePriorityLayer(map, processedData);
  google.charts.setOnLoadCallback(
      () => drawTable(processedData, povertyThreshold));
}
