import {removePriorityLayer} from './layer_util.js';
import {createAndDisplayJoinedData} from './run.js';
import {map} from './script.js';

export {
  updateDamageThreshold,
  updateDamageWeight,
  updatePovertyThreshold,
  updatePovertyWeight,
};
/** @VisibleForTesting */
export {
  currentDamageWeight,
  currentPovertyWeight,
};

let currentPovertyThreshold = 0.3;

let currentDamageThreshold = 0.5;
let currentPovertyWeight = 0.5;
let currentDamageWeight = 0.5;

/**
 * Given a new damage weight, updates the current damage and poverty weights,
 * redraws priority layer and table.
 */
function updateDamageWeight() {
  const dw = Number(getValue('d-weight'));
  if (hasErrors(dw, 'dw-error-message')) {
    return;
  }

  currentDamageWeight = dw;
  currentPovertyWeight = 1.0 - dw;

  setValue('d-weight', '');
  updateWeights();
}

/**
 * Given a new poverty weight, updates the current poverty and damage weights,
 * redraws priority layer and table.
 */
function updatePovertyWeight() {
  const pw = Number(getValue('p-weight'));
  if (hasErrors(pw, 'pw-error-message')) {
    return;
  }

  currentPovertyWeight = pw;
  currentDamageWeight = 1.0 - pw;

  setValue('p-weight', '');
  updateWeights();
}

/**
 * Clears error messages, updates current weight messages, redraws priority
 * layer and list.
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
  const pt = Number(getValue('p-threshold'));

  if (hasErrors(pt, 'pt-error-message')) {
    return;
  }

  currentPovertyThreshold = pt;

  setInnerHtml('pt-error-message', '');
  setInnerHtml(
      'current-pt', 'Current poverty threshold: ' + currentPovertyThreshold);
  setValue('p-threshold', '');
  removePriorityLayer(map);
  createAndDisplayJoinedData(
      map, currentPovertyThreshold, currentDamageThreshold,
      currentPovertyWeight, currentDamageWeight);
}

/**
 * Removes the current score overlay on the map (if there is one).
 * Reprocesses scores with new damageThreshold, overlays new score layer
 * and redraws table.
 */
function updateDamageThreshold() {
  const dt = Number(getValue('d-threshold'));

  if (hasErrors(dt, 'dt-error-message')) {
    return;
  }

  currentDamageThreshold = dt;

  setInnerHtml('dt-error-message', '');
  setInnerHtml(
      'current-dt', 'Current damage threshold: ' + currentDamageThreshold);
  setValue('d-threshold', '');
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
    setInnerHtml(errorId, 'Threshold must be between 0.00 and 1.00');
    return true;
  }
  return false;
}

/**
 * Sets the innerHTML of the element with the given id.
 * @param {string} id
 * @param {string} value
 */
function setInnerHtml(id, value) {
  document.getElementById(id).innerHTML = value;
}

/**
 * Gets the value of the element with the given id.
 * @param {string} id
 * @return {string}
 */
function getValue(id) {
  return document.getElementById(id).value;
}

/**
 * Sets the value of the element with the given id.
 * @param {string} id
 * @param {string} value
 */
function setValue(id, value) {
  document.getElementById(id).value = value;
}
