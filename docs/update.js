import {showError} from './error.js';
import {removeScoreLayer} from './layer_util.js';
import {createAndDisplayJoinedData} from './run.js';

export {
  createToggles,
  damageThresholdKey,
  povertyThresholdKey,
  povertyWeightKey,
  setUpToggles,
  toggles,
};

const povertyThresholdKey = 'poverty threshold';
const damageThresholdKey = 'damage threshold';
const povertyWeightKey = 'poverty weight';

const toggles = new Map([
  [povertyThresholdKey, 0.3],
  [damageThresholdKey, 0.0],
  [povertyWeightKey, 1.0],
]);

const povertyWeightValueId = 'poverty-weight-value';
const damageWeightValueId = 'damage-weight-value';

/**
 * Updates the score layer and table based on current toggle values.
 * @param {google.map.Maps} map
 */
function update(map) {
  getUpdatedValue(povertyThresholdKey);
  if (hasDamageAsset) {
    getUpdatedValue(damageThresholdKey);
    getUpdatedValue(povertyWeightKey);
  }

  removeScoreLayer();
  createAndDisplayJoinedData(map, Promise.resolve(getToggleValues()));
  // clear old listeners
  google.maps.event.clearListeners(map, 'click');
  google.maps.event.clearListeners(map.data, 'click');
}

/**
 * Pulls value from input box and
 * @param {string} toggle
 */
function getUpdatedValue(toggle) {
  const newValue = Number(getValue(toggle));
  if (!hasErrors(newValue, toggle)) {
    toggles.set(toggle, newValue);
  }
}

// Set in setUpInitialToggleValues.
let hasDamageAsset = null;

/**
 * Initializes damage-related toggle values based on whether or not we have
 * a damage asset.
 * @param {Promise<Object>} disasterMetadataPromise
 * @param {google.map.Maps} map
 * @return {Promise<Object>} returns all the toggle initial values.
 */
function setUpToggles(disasterMetadataPromise, map) {
  return disasterMetadataPromise.then((doc) => {
    hasDamageAsset = doc.data()['asset_data']['damage_asset_path'];
    if (hasDamageAsset) {
      toggles.set(damageThresholdKey, 0.5);
      toggles.set(povertyWeightKey, 0.5);
    }
    createToggles(map);
    return getToggleValues();
  });
}

/**
 * Gets all the toggle values as an object.
 * @return {{povertyThreshold: number, damageThreshold: number, povertyWeight:
 *     number}}
 */
function getToggleValues() {
  return {
    povertyThreshold: toggles.get(povertyThresholdKey),
    damageThreshold: toggles.get(damageThresholdKey),
    povertyWeight: toggles.get(povertyWeightKey),
  };
}

/**
 * Creates the form for toggling the equation. Expects to know at this point
 * if the damage asset exists or not.
 * @param {google.maps.Map} map
 */
function createToggles(map) {
  const form = document.createElement('form');
  form.id = 'toggles';
  form.onsubmit = () => {
    return false;
  };
  const errorMessage = document.createElement('p');
  errorMessage.id = 'error';
  errorMessage.className = 'error';
  form.append(errorMessage);

  // threshold toggles
  const thresholdTitle = document.createElement('div');
  thresholdTitle.className = 'form-title';
  thresholdTitle.innerText = 'thresholds';
  form.appendChild(thresholdTitle);
  form.appendChild(createInput(povertyThresholdKey));

  if (hasDamageAsset) {
    form.appendChild(createInput(damageThresholdKey));

    // weight toggle
    const weightInputDiv = document.createElement('div');
    weightInputDiv.className = 'input-container';
    const weightTitle = document.createElement('div');
    weightTitle.className = 'form-title';
    weightTitle.innerText = 'weights';
    weightInputDiv.appendChild(weightTitle);

    const povertyWeight = document.createElement('label');
    povertyWeight.innerText = 'poverty weight: ';
    const povertyWeightValue = document.createElement('span');
    povertyWeightValue.id = povertyWeightValueId;
    povertyWeight.appendChild(povertyWeightValue);
    weightInputDiv.appendChild(povertyWeight);

    weightInputDiv.appendChild(document.createElement('br'));

    const weightInput = createBasicToggleInputElement('poverty weight');
    weightInput.type = 'range';
    weightInput.min = '0.00';
    weightInput.max = '1.00';
    weightInput.oninput = updateWeights;
    weightInputDiv.appendChild(weightInput);

    weightInputDiv.appendChild(document.createElement('br'));

    const damageWeight = document.createElement('label');
    damageWeight.innerText = 'damage weight: ';
    const damageWeightValue = document.createElement('span');
    damageWeightValue.id = damageWeightValueId;
    damageWeight.appendChild(damageWeightValue);
    weightInputDiv.appendChild(damageWeight);

    form.appendChild(weightInputDiv);
  }

  // buttons
  form.appendChild(createButton('update', () => update(map)));

  document.getElementById('form-div').appendChild(form);
  updateWeights();
}

/**
 * Creates a div including input and label for the given toggle.
 * @param {string} toggle
 * @return {HTMLDivElement}
 */
function createInput(toggle) {
  const thresholdInputDiv = document.createElement('div');
  thresholdInputDiv.className = 'input-container';

  const label = document.createElement('label');
  label.for = toggle;
  label.innerText = toggle;
  thresholdInputDiv.appendChild(label);

  thresholdInputDiv.appendChild(document.createElement('br'));

  const input = createBasicToggleInputElement(toggle);
  input.type = 'number';
  thresholdInputDiv.appendChild(input);
  return thresholdInputDiv;
}

/**
 * Create a basic input element with the given id for the key name in {@code
 * toggles}
 *
 * @param {string} id
 * @return {HTMLInputElement}
 */
function createBasicToggleInputElement(id) {
  const input = document.createElement('input');
  input.id = id;
  input.step = '0.01';
  input.value = toggles.get(id);
  return input;
}

/**
 * Create a generic button.
 *
 * @param {string} id
 * @param {function} onclick
 * @return {HTMLInputElement}
 */
function createButton(id, onclick) {
  const submitButton = document.createElement('input');
  submitButton.type = 'button';
  submitButton.value = id;
  submitButton.id = id;
  submitButton.onclick = onclick;
  submitButton.classList.add('form-button');
  return submitButton;
}

/** Update the displayed weights based on a new poverty weight. */
function updateWeights() {
  if (!hasDamageAsset) return;
  const newPovertyWeight =
      Number(document.getElementById('poverty weight').value);
  setInnerHtml(povertyWeightValueId, newPovertyWeight.toFixed(2));
  setInnerHtml(damageWeightValueId, (1 - newPovertyWeight).toFixed(2));
}

/**
 * Checks if a number is a valid toggle value.
 * TODO: implement ability to show multiple errors at once?
 * @param {Number} threshold
 * @param {string} toggle
 * @return {boolean} true if there are any errors parsing the new threshold.
 */
function hasErrors(threshold, toggle) {
  if (Number.isNaN(threshold) || threshold < 0.0 || threshold > 1.0) {
    setErrorMessage(toggle + ' must be between 0.00 and 1.00');
    return true;
  }
  return false;
}

/**
 * Set the error message
 * @param {string} message
 */
function setErrorMessage(message) {
  setInnerHtml('error', 'ERROR: ' + message);
  showError(message);
}

/**
 * Set the displayed text of an element
 * @param {string} id
 * @param {string} message
 */
function setInnerHtml(id, message) {
  document.getElementById(id).innerText = message;
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
