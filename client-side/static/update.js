import run from './script.js';

export {update as default};

function update() {
  const t = document.getElementById('threshold').value;
  document.getElementById("current-threshold").innerHTML = "Current poverty threshold: " + t; 
  run(ee.Number.parse(t));
}
