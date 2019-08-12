import updatePovertyThreshold from './script.js';

export {update as default};

// Takes ~5 seconds to generate with 0.0 threshold.
function update() {
  const t = document.getElementById('threshold').value;
  document.getElementById('current-threshold').innerHTML =
      'Current poverty threshold: ' + t;
  updatePovertyThreshold(ee.Number.parse(t));
}
