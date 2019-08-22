import {removePriorityLayer} from './layer_util.js';
import {createAndDisplayJoinedData} from './run.js';
import {map} from './script.js';

export {
  updateDamageThreshold,
  updateDamageWeight,
  updatePovertyThreshold,
  updatePovertyWeight,
};

let currentPovertyThreshold = 0.3;
let currentDamageThreshold = 0.5;
let currentPovertyWeight = 0.5;
let currentDamageWeight = 0.5;

/**
 *
 */
function updateDamageWeight() {
  const dw = Number(document.getElementById('d-weight').value);
  if (hasErrors(dw, 'dw-error-message')) {
    return;
  }

  currentDamageWeight = dw;
  currentPovertyWeight = 1.0 - dw;

  document.getElementById('d-weight').value = '';
  updateWeights();
}

/**
 *
 */
function updatePovertyWeight() {
  const pw = Number(document.getElementById('p-weight').value);
  if (hasErrors(pw, 'dw-error-message')) {
    return;
  }

  currentPovertyWeight = pw;
  currentDamageWeight = 1.0 - pw;

  document.getElementById('p-weight').value = '';
  updateWeights();
}

/**
 *
 */
function updateWeights() {
  setInnerHtml('pw-error-message', '');
  setInnerHtml('dw-error-message', '');

  setInnerHtml('current-pw', 'Current poverty weight: ' + currentPovertyWeight);
  setInnerHtml('current-dw', 'Current damage weight: ' + currentDamageWeight);

  removePriorityLayer(map);
  createAndDisplayJoinedData(
      map, currentPovertyThreshold, currentDamageThreshold,
      currentPovertyWeight, currentDamageWeight);
}

/**
 * Removes the current score overlay on the map (if there is one).
 * Reprocesses scores with new povertyThreshold, overlays new score layer
 * and redraws table.
 */
function updatePovertyThreshold() {
  const pt = Number(document.getElementById('p-threshold').value);

  if (hasErrors(pt, 'pt-error-message')) {
    return;
  }

  currentPovertyThreshold = pt;

  setInnerHtml('pt-error-message', '');
  setInnerHtml(
      'current-pt', 'Current poverty threshold: ' + currentPovertyThreshold);
  document.getElementById('p-threshold').value = '';
  removePriorityLayer(map);
  createAndDisplayJoinedData(
      map, currentPovertyThreshold, currentDamageThreshold,
      currentPovertyWeight, currentDamageWeight);
}

/**
 *
 */
function updateDamageThreshold() {
  const dt = Number(document.getElementById('d-threshold').value);

  if (hasErrors(dt, 'dt-error-message')) {
    return;
  }

  currentDamageThreshold = dt;

  setInnerHtml('dt-error-message', '');
  setInnerHtml(
      'current-dt', 'Current damage threshold: ' + currentDamageThreshold);
  document.getElementById('d-threshold').value = '';
  removePriorityLayer(map);
  createAndDisplayJoinedData(
      map, currentPovertyThreshold, currentDamageThreshold,
      currentPovertyWeight, currentDamageWeight);
}

/**
 *
 * @param {Number} threshold
 * @param {String} errorId
 * @return {boolean} true if there are any errors parsing the new threshold.
 */
function hasErrors(threshold, errorId) {
  if (Number.isNaN(threshold) || threshold < 0.0 || threshold > 1.0) {
    setInnerHtml(errorId, 'threshold must be between 0.00 and 1.00');
    return true;
  }
  return false;
}

/**
 *
 * @param {string} id
 * @param {string} value
 */
function setInnerHtml(id, value) {
  document.getElementById(id).innerHTML = value;
}
