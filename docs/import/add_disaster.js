import {authenticateToFirebase, Authenticator} from '../authenticate.js';
import SettablePromise from '../settable_promise.js';
import TaskAccumulator from './task_accumulator.js';

export {taskAccumulator};

let disasterMetadata;

const SENTINEL_NEW_DISASTER_VALUE = "NEW DISASTER";
const SENTINEL_PICK_VALUE = "...";

function enableWhenReady() {
  // popuplate disaster picker.
  const disasterPicker = document.getElementById('disaster');
  disasterMetadata = firebase.firestore().collection('disaster-metadata').get();

  const option = document.createElement('option');
  option.innerText = SENTINEL_PICK_VALUE;
  option.value = SENTINEL_PICK_VALUE;
  disasterPicker.appendChild(option);
  disasterMetadata.then((querySnapshot) => {
    querySnapshot.forEach((snapshot) => {
      const option = document.createElement('option');
      option.innerText = snapshot.id;
      option.value = snapshot.id;
      disasterPicker.appendChild(option);
    });
    const option = document.createElement('option');
    option.innerText = 'ADD NEW DISASTER';
    option.value = SENTINEL_NEW_DISASTER_VALUE;
    disasterPicker.appendChild(option);

    disasterPicker.addEventListener(
        'change',
        () => {toggleNewOld($('#disaster').val() === 'NEW DISASTER')});
  });

  // enable add disaster button.
  const addDisasterButton = document.getElementById('add-disaster-button');
  addDisasterButton.disabled = false;
  addDisasterButton.onclick = addDisaster;
}

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

function toggleNewOld(newDisaster, states = undefined) {
  document.getElementById('selected-disaster').hidden = newDisaster;
  document.getElementById('new-disaster').hidden = !newDisaster;

  //TODO: working here
  if (!newDisaster) {
    if (!states) {
      firebase.firestore().collection('disaster-metadata').get()
    } else {
      createStateAssetPickers(states);
    }
  }
}

function addDisaster() {
  const newDisasterPick = document.createElement('option');
  newDisasterPick.innerText = disasterId;
  newDisasterPick.value = disasterId;
  newDisasterPick.selected = true;
  const disasterPicker = document.getElementById('disaster');
  const pickableDisasters = disasterPicker.childNodes;
  for (let i = 1; i < pickableDisasters.length - 1; i++) {
    if (i === pickableDisasters.length-1 || pickableDisasters[i].value > disasterId) {
      disasterPicker.insertBefore(newDisasterPick, pickableDisasters[i]);
      break;
    }
  }

  const disasterId = $('#year').val() + '-' + $('#name').val();
  const states = $('#states').val();
  firebase.firestore().collection('disaster-metadata').doc(disasterId).set({
    states: states
  });

  toggleNewOld(false, states);
}

/**
 *
 * @param {Array<String>} states
 */
function createStateAssetPickers(states) {
  // TODO: should read from firestore or element
  const selectedDisasterDiv = document.getElementById('selected-disaster');
  ee.data
      .listAssets(
          'projects/earthengine-legacy/assets/users/gd/states', {}, () => {})
      .then((result) => {
        let folders = new Set();
        for (const folder of result.assets) {
          folders.add(folder.id.substring('users/gd/states/'.length));
        }
        for (const state of states) {
          const assetPicker = document.createElement('select');
          assetPicker.multiple = 'multiple';
          assetPicker.id = state + 'adder';
          const assetPickerLabel = document.createElement('label');
          assetPickerLabel.for = state + 'adder';
          assetPickerLabel.innerHTML = 'Add EE asset(s) for ' + state + ': ';
          const dir =
              'projects/earthengine-legacy/assets/users/gd/states/' + state;
          if (!folders.has(state)) {
            ee.data.createFolder(dir, false, () => {});
          } else {
            ee.data.listAssets(dir, {}, () => {}).then((result) => {
              console.log(state);
              for (const asset of result.assets) {
                const assetPath = asset.id;
                const option = document.createElement('option');
                option.innerText = assetPath;
                option.val = assetPath;
                assetPicker.appendChild(option);
              }
            });
          }
          assetPicker.appendChild(createDefaultOption());
          selectedDisasterDiv.appendChild(assetPickerLabel);
          selectedDisasterDiv.appendChild(assetPicker);
          selectedDisasterDiv.appendChild(document.createElement('br'))
        }
      });
}

function createDefaultOption() {
  const defaultOption = document.createElement('option');
  defaultOption.innerText = '<Upload additional assets via the code editor>';
  defaultOption.value = SENTINEL_PICK_VALUE;
  return defaultOption;
}

function getDisasterInfo() {}