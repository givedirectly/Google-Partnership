import run from './script.js';

export {rerun as default};

function rerun() {
  const t = document.getElementById('threshold').value;
  document.getElementById("current-threshold").innerHTML = "Current poverty threshold: " + t; 
  run(ee.Number.parse(t));
}