import {removePriorityLayer} from './layer_util.js';
import {createAndDisplayJoinedData} from './run.js';
import {map} from './script.js';

export {createToggles};

const toggles = {
  'poverty threshold': 0.3,
  'damage threshold': 0.5,
  'poverty weight': 0.5,
  'damage weight': 0.5
};

function update() {
  console.log('hello?');
  const rawPovertyWeight = getValue('poverty weight');
  const rawDamageWeight = getValue('damage weight');

  // console.log(rawPovertyWeight !== '');

  if (rawPovertyWeight !== '' && rawDamageWeight !== '' &&
      Number(rawPovertyWeight) + Number(rawDamageWeight) !== 1.0) {
    setErrorMessage('poverty weight and damage weight must add up to 1.0');
    return;
  }

  const newToggleValues = {};

  for (var toggle in toggles) {
    if (!toggles.hasOwnProperty(toggle)) {
      continue;
    }
    const rawValue = getValue(toggle);
    if (rawValue !== '') {
      const newValue = Number(rawValue);
      if (hasErrors(newValue, toggle)) {
        return;
      } else {
        newToggleValues[toggle] = newValue;
      }
      setValue(toggle, '');
    }
  }

  if (newToggleValues.hasOwnProperty('poverty weight') &&
      !newToggleValues.hasOwnProperty('damage weight')) {
    newToggleValues['damage weight'] = 1 - newToggleValues['poverty weight'];
  } else if (
      newToggleValues.hasOwnProperty('damage weight') &&
      !newToggleValues.hasOwnProperty('poverty weight')) {
    newToggleValues['poverty weight'] = 1 - newToggleValues['damage weight'];
  }

  for (var toggle in newToggleValues) {
    if (!newToggleValues.hasOwnProperty(toggle)) {
      continue;
    }
    toggles[toggle] = newToggleValues[toggle];
    setInnerHtml(
        'current ' + toggle,
        'current ' + toggle + ': ' + newToggleValues[toggle]);
  }

  removePriorityLayer(map);
  createAndDisplayJoinedData(
      map, toggles['poverty threshold'], toggles['damage threshold'],
      toggles['poverty weight'], toggles['damage weight']);
}

function createToggles() {
  const form = document.createElement('form');
  form.id = 'toggles';
  form.onsubmit = () => {
    return false
  };
  const errorMessage = document.createElement('p');
  errorMessage.id = 'error';
  form.append(errorMessage);
  for (var toggle in toggles) {
    if (!toggles.hasOwnProperty(toggle)) {
      continue;
    }
    const currentValueMessage = document.createElement('p');
    currentValueMessage.id = 'current ' + toggle;
    currentValueMessage.innerHTML =
        currentValueMessage.id + ': ' + toggles[toggle];
    form.appendChild(currentValueMessage);

    const label = document.createElement('label');
    label.for = toggle;
    label.id = 'for ' + toggle;
    label.innerHTML = toggle;
    form.appendChild(label);

    const input = document.createElement('input');
    input.type = 'number';
    input.id = toggle;
    input.step = '0.01';
    form.appendChild(input);
  }
  form.appendChild(document.createElement('br'));
  const submitButton = document.createElement('input');
  submitButton.type = 'button';
  submitButton.value = 'update';
  submitButton.id = 'update';
  submitButton.onclick = update;
  form.appendChild(submitButton);
  document.getElementsByClassName('form').item(0).appendChild(form);
}

/**
 *
 * @param {Number} threshold
 * @param {string} toggle
 * @return {boolean} true if there are any errors parsing the new threshold.
 */
// TODO: implement ability to show multiple errors at once?
function hasErrors(threshold, toggle) {
  if (Number.isNaN(threshold) || threshold < 0.0 || threshold > 1.0) {
    setErrorMessage(toggle + ' must be between 0.00 and 1.00');
    return true;
  }
  return false;
}

/**
 *
 * @param message
 */
function setErrorMessage(message) {
  setInnerHtml('error', 'ERROR: ' + message);
}

/**
 *
 * @param id
 * @param message
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
