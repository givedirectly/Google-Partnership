import {showError} from './error.js';
import {removeScoreLayer} from './layer_util.js';
import {createAndDisplayJoinedData} from './run.js';

export {
  createToggles,
  damageThresholdKey,
  povertyThresholdKey,
  povertyWeightKey,
  setUpScoreParameters,
  toggles,
};

const povertyThresholdKey = 'poverty threshold';
const damageThresholdKey = 'damage threshold';
const povertyWeightKey = 'poverty weight';

/** @type {Map<string, number>} */
const toggles = new Map([
  [povertyThresholdKey, 0.3],
  [damageThresholdKey, 0.0],
  [povertyWeightKey, 1.0],
]);

const povertyWeightValueId = 'poverty-weight-value';
const damageWeightValueId = 'damage-weight-value';

/**
 * Updates the score layer and table based on current toggle values.
 * @param {google.maps.Map} map
 */
function update(map) {
  setInnerHtml('error', '');
  if (!getUpdatedValue(povertyThresholdKey)) {
    return;
  }
  if (!!scoreAssetCreationParameters.damageAssetPath) {
    if (!getUpdatedValue(damageThresholdKey) ||
        !getUpdatedValue(povertyWeightKey)) {
      return;
    }
  }

  removeScoreLayer();
  createAndDisplayJoinedData(
      map, Promise.resolve(getScoreComputationParameters()));
  // clear old listeners
  google.maps.event.clearListeners(map, 'click');
  google.maps.event.clearListeners(map.data, 'click');
}

/**
 * Pulls value from input box and validates it.
 * @param {string} toggle
 * @return {boolean} True if successful, false if there was an error
 */
function getUpdatedValue(toggle) {
  const newValue = Number(getValue(toggle));
  if (validate(newValue, toggle)) {
    toggles.set(toggle, newValue);
    return true;
  }
  return false;
}

/**
 * Set in setUpInitialToggleValues.
 * @type {ScoreParameters}
 */
let scoreAssetCreationParameters;

/**
 * Initializes damage-related toggle values based on whether or not we have
 * a damage asset.
 * @param {Promise<DisasterDocument>} disasterMetadataPromise
 * @param {google.maps.Map} map
 * @return {Promise<Object>} returns all the toggle initial values.
 */
async function setUpScoreParameters(disasterMetadataPromise, map) {
  ({scoreAssetCreationParameters} = await disasterMetadataPromise);
  if (!!scoreAssetCreationParameters.damageAssetPath) {
    toggles.set(damageThresholdKey, 0.5);
    toggles.set(povertyWeightKey, 0.5);
  }
  createToggles(map);
  return getScoreComputationParameters();
}

/**
 * Contains a {@link ScoreParameters} together with toggles values. These are
 * the values needed to compute a score for a {@link GeoJsonFeature}.
 * @typedef {Object} ScoreComputationParameters
 * @property {number} povertyThreshold
 * @property {number} damageThreshold 0 if
 *     `scoreAssetCreationParameters.damageAssetPath` is missing
 * @property {number} povertyWeight 1 if
 *     `scoreAssetCreationParameters.damageAssetPath` is missing
 * @property {ScoreParameters} scoreAssetCreationParameters
 */

/**
 * Gets all the parameters needed for score computation, as an object.
 * @return {ScoreComputationParameters}
 */
function getScoreComputationParameters() {
  return {
    povertyThreshold: toggles.get(povertyThresholdKey),
    damageThreshold: toggles.get(damageThresholdKey),
    povertyWeight: toggles.get(povertyWeightKey),
    scoreAssetCreationParameters,
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
  form.onsubmit = () => false;
  const errorMessage = document.createElement('p');
  errorMessage.id = 'error';
  errorMessage.className = 'error';
  form.append(errorMessage);

  // threshold toggles
  const thresholdTitle = document.createElement('div');
  thresholdTitle.className = 'content-title';
  thresholdTitle.innerText = 'thresholds';
  form.appendChild(thresholdTitle);
  form.appendChild(createInput(povertyThresholdKey));

  if (!!scoreAssetCreationParameters.damageAssetPath) {
    form.appendChild(createInput(damageThresholdKey));

    // weight toggle
    const weightInputDiv = document.createElement('div');
    weightInputDiv.className = 'input-container';
    const weightTitle = document.createElement('div');
    weightTitle.className = 'content-title';
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
 * Creates a basic input element with the given id for the key name in {@code
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
 * Creates a generic button.
 *
 * @param {string} id
 * @param {Function} onclick
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

/** Updates the displayed weights based on a new poverty weight. */
function updateWeights() {
  if (!scoreAssetCreationParameters.damageAssetPath) return;
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
 * @return {boolean} true if there are no errors parsing the new threshold.
 */
function validate(threshold, toggle) {
  if (Number.isNaN(threshold) || threshold < 0.0 || threshold > 1.0) {
    setErrorMessage(toggle + ' must be between 0.00 and 1.00');
    return false;
  }
  return true;
}

/**
 * Sets the error message
 * @param {string} message
 */
function setErrorMessage(message) {
  setInnerHtml('error', 'ERROR: ' + message);
  showError(message);
}

/**
 * Sets the displayed text of an element
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
