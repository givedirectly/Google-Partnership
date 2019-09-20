import {removeScoreLayer} from './layer_util.js';
import {createAndDisplayJoinedData} from './run.js';

export {
  createToggles,
  initialDamageThreshold,
  initialPovertyThreshold,
  initialPovertyWeight,
};
/* @VisibleForTesting */
export {toggles};

const initialPovertyThreshold = 0.3;
const initialDamageThreshold = 0.5;
// The initial damage weight is 1-this value.
const initialPovertyWeight = 0.5;

const toggles = new Map([
  ['poverty threshold', initialPovertyThreshold],
  ['damage threshold', initialDamageThreshold],
  ['poverty weight', initialPovertyWeight],
]);

const povertyWeightValueId = 'poverty weight value';
const damageWeightValueId = 'damage weight value';

/**
 * Updates the score layer and table based on current toggle values.
 * @param {google.map.Maps} map
 */
function update(map) {
  for (const toggle of toggles.keys()) {
    const newValue = Number(getValue(toggle));
    if (hasErrors(newValue, toggle)) {
      return;
    } else {
      toggles.set(toggle, newValue);
      setValue(toggle, newValue);
    }
  }

  removeScoreLayer();
  createAndDisplayJoinedData(
      map, toggles.get('poverty threshold'), toggles.get('damage threshold'),
      toggles.get('poverty weight'));
  // clear old listeners
  google.maps.event.clearListeners(map, 'click');
  google.maps.event.clearListeners(map.data, 'click');
}

/**
 * Creates the form for toggling the equation.
 * @param {google.map.Maps} map
 */
function createToggles(map) {
  const form = document.createElement('form');
  form.id = 'toggles';
  form.onsubmit = () => {
    return false;
  };
  const errorMessage = document.createElement('p');
  errorMessage.id = 'error';
  form.append(errorMessage);

  // threshold toggles
  for (const toggle of toggles.keys()) {
    if (!toggle.endsWith('threshold')) {
      continue;
    }
    const input = createBasicToggleInputElement(toggle);
    input.type = 'number';
    form.appendChild(input);

    const label = document.createElement('label');
    label.for = toggle;
    label.id = 'for ' + toggle;
    label.innerHTML = ' ' + toggle;
    form.appendChild(label);

    form.appendChild(document.createElement('br'));
  }

  // weight toggle
  const povertyWeight = document.createElement('label');
  povertyWeight.innerHTML = 'poverty weight: ';
  const povertyWeightValue = document.createElement('span');
  povertyWeightValue.id = povertyWeightValueId;
  povertyWeight.appendChild(povertyWeightValue);
  form.appendChild(povertyWeight);

  const weightInput = createBasicToggleInputElement('poverty weight');
  weightInput.type = 'range';
  weightInput.min = '0.00';
  weightInput.max = '1.00';
  weightInput.oninput = updateWeights;
  form.appendChild(weightInput);

  const damageWeight = document.createElement('label');
  damageWeight.innerHTML = 'damage weight: ';
  const damageWeightValue = document.createElement('span');
  damageWeightValue.id = damageWeightValueId;
  damageWeight.appendChild(damageWeightValue);
  form.appendChild(damageWeight);

  form.appendChild(document.createElement('br'));

  // buttons
  form.appendChild(createButton('update', () => {
    update(map);
  }));
  form.appendChild(createButton('current settings', reset));

  document.getElementById('form-div').appendChild(form);
  updateWeights();
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
  return submitButton;
}

/**
 * Resets the toggles to their current value as displayed in the map and list
 */
function reset() {
  for (const [toggle, value] of toggles) {
    setValue(toggle, value);
  }
  updateWeights();
}

/** Update the displayed weights based on a new poverty weight. */
function updateWeights() {
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
}

/**
 * Set the displayed text of an element
 * @param {string} id
 * @param {string} message
 */
function setInnerHtml(id, message) {
  document.getElementById(id).innerHTML = message;
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
