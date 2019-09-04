import {removeScoreLayer} from './layer_util.js';
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
  ee.Number.parse(t).evaluate((number, failure) => {
    if (typeof failure !== 'undefined' || number < 0.0 || number > 1.0) {
      const errorMessage = document.getElementById('threshold-error-message');
      errorMessage.innerHTML = 'Threshold must be between 0.00 and 1.00';
    } else {
      const errorMessage = document.getElementById('threshold-error-message');
      errorMessage.innerHTML = '';

      document.getElementById('current-threshold').innerHTML =
          'Current poverty threshold: ' + t;
      removeScoreLayer(map);
      createAndDisplayJoinedData(map, number);
    }
  });
}
