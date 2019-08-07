import run from './script.js';

export {update as default};

//TODO(juliexxia): figure out why pressing enter reloads the page but doesn't actually run
// this update function.
// Takes ~5 seconds to generate with 0.0 threshold.
function update() {
  // console.time('update');
  const t = document.getElementById('threshold').value;
  document.getElementById("current-threshold").innerHTML = "Current poverty threshold: " + t; 
  run(ee.Number.parse(t));
}
