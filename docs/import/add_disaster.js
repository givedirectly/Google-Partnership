import {getFirestoreRoot} from '../authenticate.js';
import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import SettablePromise from '../settable_promise.js';
import TaskAccumulator from './task_accumulator.js';

export {taskAccumulator};

let disasterMetadata;

// Currently a map of disaster name to states. This pulls once on firebase
// authentication and then makes local updates afterwards.
const disasters = new Map();

const SENTINEL_OPTION_VALUE = '...';
const SENTINEL_NEW_DISASTER_VALUE = 'NEW DISASTER';

// Necessary for listAssets.
ee.data.setCloudApiEnabled(true);

// 2 tasks: EE authentication, page load
const taskAccumulator = new TaskAccumulator(2, enableWhenReady);
// TODO: do something with this promise, pass it somewhere - probably once
// tagging happens.
const firebaseAuthPromise = new SettablePromise();
const authenticator = new Authenticator(
    (token) => firebaseAuthPromise.setPromise(authenticateToFirebase(token)),
    () => taskAccumulator.taskCompleted());
authenticator.start();

/**
 * Populates disaster picker with disasters from firebase + enables the ability
 * to add a new disaster and store to firebase.
 * */
function enableWhenReady() {
  disasterMetadata = getFirestoreRoot().collection('disaster-metadata');

  // populate disaster picker.
  const disasterPicker = $('#disaster');
  disasterPicker.append(createOptionFrom(SENTINEL_OPTION_VALUE));
  disasterMetadata.get().then((querySnapshot) => {
    querySnapshot.forEach((doc) => {
      const name = doc.id;
      disasterPicker.append(createOptionFrom(name));
      disasters.set(name, doc.data().states);
    });
    disasterPicker.append(
        createOption('ADD NEW DISASTER', SENTINEL_NEW_DISASTER_VALUE));

    disasterPicker.on('change', () => toggleState($('#disaster').val()));
  });

  // enable add disaster button now that firestore is ready.
  const addDisasterButton = $('#add-disaster-button');
  addDisasterButton.prop('disabled', false);
  addDisasterButton.on('click', addDisaster);
}

/**
 * Utility method to switch between the page creating a new disaster and the
 * page editing a current disaster.
 * @param {String} disaster
 */
function toggleState(disaster) {
  if (disaster === SENTINEL_NEW_DISASTER_VALUE) {
    $('#new-disaster').show();
    $('#selected-disaster').hide();
  } else {
    console.log(disaster);
    // TODO: display more disaster info including current layers etc.
    $('#new-disaster').hide();
    $('#selected-disaster').show();
    createStateAssetPickers(disasters.get(disaster));
  }
}

/**
 * Onclick function for the new disaster form. Writes new disaster to firestore,
 * local disasters map and disaster picker. Doesn't allow name, year or states
 * to be empty fields.
 */
function addDisaster() {
  const year = $('#year').val();
  const name = $('#name').val();
  const states = $('#states').val();

  if (!year || !name || !states) {
    setStatus('Error: Disaster name, year, and states are required.');
    return;
  }
  if (isNaN(year)) {
    setStatus('Error: Year must be a number.');
    return;
  }
  const disasterId = year + '-' + name;
  disasterMetadata.doc(disasterId).get().then((doc) => {
    if (doc.exists) {
      setStatus('Error: disaster with that name and year already exists.')
    } else {
      clearStatus();
      disasterMetadata.doc(disasterId).set({
        states: states,
      });
      disasters.set(disasterId, states);

      const newDisasterPick = createOptionFrom(disasterId);
      newDisasterPick.selected = true;
      const disasterPicker = document.getElementById('disaster');
      const pickableDisasters = disasterPicker.childNodes;
      for (let i = 1; i < pickableDisasters.length; i++) {
        // This is a little wonky, but done to ensure the ADD NEW DISASTER
        // choice is always at the end.
        if (i === pickableDisasters.length - 1 ||
            pickableDisasters[i].value > disasterId) {
          disasterPicker.insertBefore(newDisasterPick, pickableDisasters[i]);
          break;
        }
      }

      toggleState(disasterId);
    }
  });
}

const gdEePathPrefix = 'users/gd/';
const eeLegacyPathPrefix =
    'projects/earthengine-legacy/assets/' + gdEePathPrefix;

// TODO: add functionality for adding assets to disaster records from these
// pickers.
/**
 * Requests all assets in ee directories corresponding to given states and
 * displays them in pickers. Right now, selecting on those pickers doesn't
 * actually do anything.
 * @param {Array<String>} states
 */
function createStateAssetPickers(states) {
  const assetPickerDiv = $('#asset-pickers');
  assetPickerDiv.empty();
  ee.data.listAssets(eeLegacyPathPrefix + 'states', {}, () => {})
      .then((result) => {
        const folders = new Set();
        for (const folder of result.assets) {
          folders.add(folder.id.substring((gdEePathPrefix + 'states/').length));
        }
        for (const state of states) {
          const assetPicker = document.createElement('select');
          assetPicker.multiple = 'multiple';
          assetPicker.id = state + '-adder';
          const assetPickerLabel = document.createElement('label');
          assetPickerLabel.for = state + 'adder';
          assetPickerLabel.innerHTML = 'Add EE asset(s) for ' + state + ': ';
          assetPicker.appendChild(createOption(
              '<Upload additional assets via the code editor>',
              SENTINEL_OPTION_VALUE));

          const dir = eeLegacyPathPrefix + 'states/' + state;
          if (!folders.has(state)) {
            ee.data.createFolder(dir, false, () => {});
          } else {
            ee.data.listAssets(dir, {}, () => {}).then((result) => {
              if (result.assets) {
                for (const asset of result.assets) {
                  assetPicker.appendChild(createOptionFrom(asset.id));
                }
              }
            });
          }
          assetPickerDiv.append(assetPickerLabel);
          assetPickerDiv.append(assetPicker);
          assetPickerDiv.append(document.createElement('br'));
        }
      });
}

/**
 * Utility function for setting the status div.
 * @param {String} text
 */
function setStatus(text) {
  $('#status').prop('innerHTML', text).show();
}

function clearStatus() {
  $('#status').empty().hide();
}

/**
 * Utility function for creating an option with the same val and innerText.
 * @param {String} innerTextAndValue
 * @return {HTMLOptionElement}
 */
function createOptionFrom(innerTextAndValue) {
  return createOption(innerTextAndValue, innerTextAndValue);
}

/**
 * Utility function for creating an option.
 * @param {String} innerText
 * @param {String} value
 * @return {HTMLOptionElement}
 */
function createOption(innerText, value) {
  const defaultOption = document.createElement('option');
  defaultOption.innerText = innerText;
  defaultOption.value = value;
  return defaultOption;
}
