import updatePriorityLayer from './script.js';

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
