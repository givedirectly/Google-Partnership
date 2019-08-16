import {removePriorityLayer} from './layer_util.js';
import {createAndDisplayJoinedData} from './run.js';
import {map} from './script.js';

export {update as default};

/**
 * Removes the current score overlay on the map (if there is one).
 * Reprocesses scores with new povertyThreshold, overlays new score layer
 * and redraws table.
 */
function update() {
  const t = document.getElementById('threshold').value;
  document.getElementById('current-threshold').innerHTML =
      'Current poverty threshold: ' + t;
  removePriorityLayer(map);
  createAndDisplayJoinedData(povertyThreshold);
}
