import {getFirestoreRoot} from '../firestore_document.js';

// Visible for testing
export {
  createStateAssetPickers,
  setDisasterMetadata,
  enableWhenReady,
  createOptionFrom,
    setStatus,
    clearStatus,
  gdEePathPrefix,
  eeLegacyPathPrefix,
  emptyCallback,
    toggleState,
    writeDisaster
};

let disasterMetadata;

// Currently a map of disaster name to states. This pulls once on firebase
// authentication and then makes local updates afterwards.
const disasters = new Map();

const SENTINEL_OPTION_VALUE = '...';
const SENTINEL_NEW_DISASTER_VALUE = 'NEW DISASTER';

/**
 * Populates disaster picker with disasters from firebase + enables the ability
 * to add a new disaster and store to firebase.
 * */
function enableWhenReady() {
  setDisasterMetadata();
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

function setDisasterMetadata() {
  disasterMetadata = getFirestoreRoot().collection('disaster-metadata');
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
    // TODO: display more disaster info including current layers etc.
    $('#new-disaster').hide();
    $('#selected-disaster').show();
    createStateAssetPickers(disasters.get(disaster));
  }
}

/**
 *
 * @param disasterId
 * @param states
 * @return {Promise<void>}
 */
function writeDisaster(disasterId, states) {
  const docRef = disasterMetadata.doc(disasterId);
  return docRef.get().then((doc) => {
    if (!doc.exists) {
      setStatus('Error: disaster with that name and year already exists.');
    } else {
      console.log(doc.id, " => ", doc.data());
      clearStatus();
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
      return docRef.set({states: states});
    }
  });
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
  disasters.set(disasterId, states);
  writeDisaster(disasterId, states);
  toggleState(disasterId);
}

const gdEePathPrefix = 'users/gd/';
const eeLegacyPathPrefix =
    'projects/earthengine-legacy/assets/' + gdEePathPrefix;

// Needed for testing :/
const emptyCallback = () => {};

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
  return ee.data.listAssets(eeLegacyPathPrefix + 'states', {}, emptyCallback)
      .then((result) => {
        const folders = new Set();
        for (const folder of result.assets) {
          folders.add(folder.id.substring((gdEePathPrefix + 'states/').length));
        }
        console.log(states);
        for (const state of states) {
          const assetPicker = document.createElement('select');
          assetPicker.multiple = 'multiple';
          assetPicker.id = state + '-adder';
          const assetPickerLabel = document.createElement('label');
          assetPickerLabel.for = state + '-adder';
          assetPickerLabel.innerHTML = 'Add EE asset(s) for ' + state + ': ';
          assetPicker.appendChild(createOption(
              '<Upload additional assets via the code editor>',
              SENTINEL_OPTION_VALUE));

          const dir = eeLegacyPathPrefix + 'states/' + state;
          if (!folders.has(state)) {
            ee.data.createFolder(dir, false, emptyCallback);
          } else {
            ee.data.listAssets(dir, {}, emptyCallback).then((result) => {
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

/** Utility function for clearing status div. */
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


/**
 * Utility function to remove all children of a given div.
 * @param {Element} div
 */
function removeAllChildren(div) {
  while (div.firstChild) {
    div.firstChild.remove();
  }
}

// setup();