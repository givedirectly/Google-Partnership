import {eeLegacyPathPrefix, gdEePathPrefix} from '../ee_paths.js';
import {getFirestoreRoot} from '../firestore_document.js';

export {
  enableWhenReady,
};
// Visible for testing
export {
  addDisaster,
  createOptionFrom,
  createStateAssetPickers,
  disasters,
  emptyCallback,
  writeDisaster,
};

// Currently a map of disaster name to states. This pulls once on firebase
// authentication and then makes local updates afterwards so we don't need to
// wait on firebase writes to read new info.
const disasters = new Map();

const SENTINEL_OPTION_VALUE = '...';
const SENTINEL_NEW_DISASTER_VALUE = 'NEW DISASTER';

/**
 *
 * @return {Promise<firebase.firestore.QuerySnapshot>}
 */
function enableWhenReady() {
  // enable (currently hidden) add disaster button now that firestore is ready.
  const addDisasterButton = $('#add-disaster-button');
  addDisasterButton.prop('disabled', false);
  addDisasterButton.on('click', addDisaster);

  // populate disaster picker.
  const disasterPicker = $('#disaster');
  disasterPicker.append(createOptionFrom(SENTINEL_OPTION_VALUE));
  return getFirestoreRoot()
      .collection('disaster-metadata')
      .get()
      .then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          const name = doc.id;
          disasterPicker.append(createOptionFrom(name));
          disasters.set(name, doc.data().states);
        });
        disasterPicker.append(
            createOption('ADD NEW DISASTER', SENTINEL_NEW_DISASTER_VALUE));
        disasterPicker.on('change', () => toggleState($('#disaster').val()));
      });
}

/**
 * Utility method to switch between the page creating a new disaster and the
 * page editing a current disaster.
 * @param {String} disaster
 * @return {Promise<void>} completes when we've finished filling all state
 * pickers.
 */
function toggleState(disaster) {
  if (disaster === SENTINEL_NEW_DISASTER_VALUE) {
    $('#new-disaster').show();
    $('#selected-disaster').hide();
  } else {
    // TODO: display more disaster info including current layers etc.
    $('#new-disaster').hide();
    $('#selected-disaster').show();
    return createStateAssetPickers(disasters.get(disaster));
  }
}

/**
 * Writes the given details to a new disaster entry in firestore. Fails if
 * there is an existing disaster with the same details.
 * @param {string} disasterId of the form <year>-<name>
 * @param {Array<string>} states array of state (abbreviations)
 * @return {Promise<boolean>} returns true after successful write to firestore.
 */
function writeDisaster(disasterId, states) {
  if (disasters.has(disasterId)) {
    setStatus('Error: disaster with that name and year already exists.');
    return Promise.resolve(false);
  }

  disasters.set(disasterId, states);
  toggleState(disasterId);

  clearStatus();
  const disasterOptions = $('#disaster > option');
  // comment needed to quiet eslint on no-invalid-this rules
  disasterOptions.each(/* @this HTMLElement */ function() {
    if ($(this).val() > disasterId) {
      $(createOptionFrom(disasterId)).insertBefore($(this));
      return false;
    }
  });
  $('#disaster').val(disasterId);
  return getFirestoreRoot()
      .collection('disaster-metadata')
      .doc(disasterId)
      .set({states: states})
      .then(() => true);
}

/**
 * Onclick function for the new disaster form. Writes new disaster to firestore,
 * local disasters map and disaster picker. Doesn't allow name, year or states
 * to be empty fields.
 * @return {Promise<boolean>} resolves true if new disaster was successfully
 *     written.
 */
function addDisaster() {
  const year = $('#year').val();
  const name = $('#name').val();
  const states = $('#states').val();

  if (!year || !name || !states) {
    setStatus('Error: Disaster name, year, and states are required.');
    return Promise.resolve(false);
  }
  if (isNaN(year)) {
    setStatus('Error: Year must be a number.');
    return Promise.resolve(false);
  }
  const disasterId = year + '-' + name;
  return writeDisaster(disasterId, states);
}

// Needed for testing :/
const emptyCallback = () => {};

// TODO: add functionality for adding assets to disaster records from these
// pickers.
/**
 * Requests all assets in ee directories corresponding to given states and
 * displays them in pickers. Right now, selecting on those pickers doesn't
 * actually do anything.
 * @param {Array<string>} states e.g. ['WA']
 * @return {Promise<void>} completes when we've finished filling all state
 * pickers.
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
        const promises = [];
        for (const state of states) {
          const assetPicker = $(document.createElement('select')).attr({
            multiple: 'multiple',
            id: state + '-adder',
          });
          const dir = eeLegacyPathPrefix + 'states/' + state;
          if (!folders.has(state)) {
            promises.push(ee.data.createFolder(dir, false, emptyCallback));
          } else {
            promises.push(
                ee.data.listAssets(dir, {}, emptyCallback).then((result) => {
                  if (result.assets) {
                    for (const asset of result.assets) {
                      assetPicker.append(createOptionFrom(asset.id));
                    }
                  }
                }));
          }
          const assetPickerLabel = $(document.createElement('label')).attr({
            innerText: 'Add EE asset(s) for ' + state + ': ',
                for: state + '-adder',
          });
          assetPickerDiv.append(assetPickerLabel);
          assetPickerDiv.append(assetPicker);
          assetPickerDiv.append(document.createElement('br'));

          assetPicker.append(createOption(
              'Upload additional assets via the code editor',
              SENTINEL_OPTION_VALUE));
        }
        return Promise.all(promises);
      });
}

/**
 * Utility function for setting the status div.
 * @param {String} text
 */
function setStatus(text) {
  $('#status').html(text).show();
}

/** Utility function for clearing status div. */
function clearStatus() {
  $('#status').hide();
}

/**
 * Utility function for creating an option with the same val and innerText.
 * @param {String} innerTextAndValue
 * @return {JQuery<HTMLOptionElement>}
 */
function createOptionFrom(innerTextAndValue) {
  return createOption(innerTextAndValue, innerTextAndValue);
}

/**
 * Utility function for creating an option.
 * @param {String} innerText
 * @param {String} value
 * @return {JQuery<HTMLOptionElement>}
 */
function createOption(innerText, value) {
  return $(document.createElement('option')).html(innerText).val(value);
}
