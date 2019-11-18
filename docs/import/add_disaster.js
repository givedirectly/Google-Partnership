import {eeStatePrefixLength, legacyStateDir} from '../ee_paths.js';
import {getFirestoreRoot} from '../firestore_document.js';
import {loadNavbar} from '../navbar.js';

export {enableWhenReady, toggleState};
// Visible for testing
export {
  addDisaster,
  createAssetPickers,
  createOptionFrom,
  deleteDisaster,
  disasters,
  emptyCallback,
  getAssetsFromEe,
  stateAssets,
  writeNewDisaster,
};

// Currently a map of disaster name to states. This pulls once on firebase
// authentication and then makes local updates afterwards so we don't need to
// wait on firebase writes to read new info.
const disasters = new Map();

// Map of state to list of known assets
const stateAssets = new Map();

// TODO: general reminder to add loading indicators for things like creating
// new state asset folders, etc.

/**
 * Populates the disaster picker with disasters from firestore, and enables
 * the ability to add a new disaster.
 * @return {Promise<firebase.firestore.QuerySnapshot>}
 */
function enableWhenReady() {
  // enable (currently hidden) add disaster button now that firestore is ready.
  const addDisasterButton = $('#add-disaster-button');
  addDisasterButton.prop('disabled', false);
  addDisasterButton.on('click', addDisaster);

  const deleteButton = $('#delete');
  deleteButton.prop('disabled', false);
  deleteButton.on('click', () => deleteDisaster(window));

  // populate disaster picker.
  return getFirestoreRoot()
      .collection('disaster-metadata')
      .get()
      .then((querySnapshot) => {
        const disasterPicker = $('#disaster');
        querySnapshot.forEach((doc) => {
          const name = doc.id;
          disasterPicker.prepend(createOptionFrom(name));
          disasters.set(name, doc.data().states);
        });

        disasterPicker.on('change', () => toggleDisaster(disasterPicker.val()));
        const mostRecent = querySnapshot.docs[querySnapshot.size - 1].id;
        disasterPicker.val(mostRecent).trigger('change');
        toggleState(true);
      });
}

/**
 * On change method for disaster picker.
 * @param {String} disaster
 * @return {Promise<void>} completes when we've finished filling all state
 * pickers and pulled from firebase.
 */
function toggleDisaster(disaster) {
  const states = disasters.get(disaster);
  const statesToFetch = [];
  for (const state of states) {
    if (!stateAssets.has(state)) statesToFetch.push(state);
  }
  // TODO: add functionality to re-pull all cached states from ee without
  // reloading the page.
  let assetPickersDone = Promise.resolve();
  if (statesToFetch.length === 0) {
    createAssetPickers(states);
  } else {
    // We are already doing this inside createAssetPickers but not until
    // after the first promise completes so also do it here so lingering
    // pickers from previous disasters don't hang around.
    $('#asset-pickers').empty();
    assetPickersDone = getAssetsFromEe(statesToFetch).then((assets) => {
      for (const asset of assets) {
        stateAssets.set(asset[0], asset[1]);
      }
      createAssetPickers(states);
    });
  }

  // TODO: display more disaster info including current layers etc.
  return assetPickersDone;
}

/**
 * Writes the given details to a new disaster entry in firestore. Fails if
 * there is an existing disaster with the same details.
 * @param {string} disasterId of the form <year>-<name>
 * @param {Array<string>} states array of state (abbreviations)
 * @return {Promise<boolean>} returns true after successful write to firestore.
 */
function writeNewDisaster(disasterId, states) {
  if (disasters.has(disasterId)) {
    setStatus('Error: disaster with that name and year already exists.');
    return Promise.resolve(false);
  }
  disasters.set(disasterId, states);
  clearStatus();

  const disasterPicker = $('#disaster');
  const disasterOptions = disasterPicker.children();
  let added = false;
  // note: let's hope this tool isn't being used in the year 10000.
  // comment needed to quiet eslint on no-invalid-this rules
  disasterOptions.each(/* @this HTMLElement */ function() {
    if ($(this).val() < disasterId) {
      $(createOptionFrom(disasterId)).insertBefore($(this));
      added = true;
      return false;
    }
  });
  if (!added) disasterPicker.append(createOptionFrom(disasterId));

  disasterPicker.val(disasterId).trigger('change');
  toggleState(true);

  return getFirestoreRoot()
      .collection('disaster-metadata')
      .doc(disasterId)
      .set({states: states})
      .then(() => true);
}

/**
 * Changes page state between looking at a known disaster and adding a new one.
 * @param {boolean} known
 */
function toggleState(known) {
  if (known) {
    $('#disaster').show();
    $('#selected-disaster').show();
    $('#pending-disaster').hide();
    $('#new-disaster').hide();
  } else {
    $('#disaster').hide();
    $('#selected-disaster').hide();
    $('#pending-disaster').show();
    $('#new-disaster').show();
  }
}

/**
 * Onclick function for submitting the new disaster form. Writes new disaster
 * to firestore, local disasters map and disaster picker. Doesn't allow name,
 * year or states to be empty fields.
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
  if (notAllLowercase(name)) {
    setStatus(
        'Error: disaster name must be comprised of only lowercase letters');
    return Promise.resolve(false);
  }
  const disasterId = year + '-' + name;
  return writeNewDisaster(disasterId, states);
}

/**
 * Returns true if the given string is *not* all lowercase letters.
 * @param {string} val
 * @return {boolean}
 */
function notAllLowercase(val) {
  return !/^[a-z]+$/.test(val);
}

// Needed for testing :/
const emptyCallback = () => {};

// TODO: add functionality for adding assets to disaster records from these
// pickers.
/**
 * Requests all assets in ee directories corresponding to given states.
 * @param {Array<string>} states e.g. ['WA']
 * @return {Promise<Array<Array<string | Array<string>>>>} 2-d array of all
 *     retrieved
 * assets in the form [['WA', ['asset/path']], ...]
 */
function getAssetsFromEe(states) {
  return ee.data.listAssets(legacyStateDir, {}, emptyCallback)
      .then((result) => {
        const folders = new Set();
        for (const folder of result.assets) {
          folders.add(folder.id.substring(eeStatePrefixLength));
        }
        const promises = [];
        for (const state of states) {
          const dir = legacyStateDir + '/' + state;
          if (!folders.has(state)) {
            // This will print a console error for anyone other than the gd
            // account. Ee console seems to have the power to grant write access
            // to non-owners but it doesn't seem to work. Sent an email to
            // gestalt.
            // TODO: replace with setIamPolicy when that works.
            ee.data.createFolder(dir, false, () => {
              // TODO: add status bar for when this is finished.
              ee.data.setAssetAcl(dir, {all_users_can_read: true});
            });
            promises.push(Promise.resolve([state, []]));
          } else {
            promises.push(
                ee.data.listAssets(dir, {}, emptyCallback).then((result) => {
                  const assets = [];
                  if (result.assets) {
                    for (const asset of result.assets) {
                      if (checkSupportedAssetType(asset)) {
                        assets.push(asset.id);
                      }
                    }
                  }
                  return [state, assets];
                }));
          }
        }
        return Promise.all(promises);
      });
}

// TODO: surface a warning if unsupported asset types are found?
/**
 * Check that the type of the given asset is one we support (Unsupported:
 * ALGORITHM, FOLDER, UNKNOWN).
 * @param {Object} asset
 * @return {boolean}
 */
function checkSupportedAssetType(asset) {
  const type = asset.type;
  return type === 'IMAGE' || type === 'IMAGE_COLLECTION' || type === 'TABLE';
}

/**
 * Given states, displays their assets in pickers. Right now, selecting on
 * those pickers doesn't actually do anything.
 * @param {Array<string>} states e.g. ['WA']
 */
function createAssetPickers(states) {
  const assetPickerDiv = $('#asset-pickers');
  assetPickerDiv.empty();
  for (const state of states) {
    const assetPicker = $(document.createElement('select'))
                            .attr({
                              multiple: 'multiple',
                              id: state + '-adder',
                            })
                            .width(200);
    if (stateAssets.get(state)) {
      for (const asset of stateAssets.get(state)) {
        assetPicker.append(createOptionFrom(asset));
      }
    }
    const assetPickerLabel = $(document.createElement('label'))
                                 .html('Add EE asset(s) for ' + state + ': ');
    assetPickerLabel.append(assetPicker);
    assetPickerDiv.append(assetPickerLabel);
    assetPickerDiv.append(document.createElement('br'));
  }
}

/**
 * Deletes a disaster from firestore. Confirms first. Returns when deletion is
 * complete (or instantly if deletion doesn't actually happen).
 * @param {Window} globalWindow DOM Window (for test injection)
 * @return {Promise<void>}
 */
function deleteDisaster(globalWindow) {
  const disasterPicker = $('#disaster');
  const disasterId = disasterPicker.val();
  if (globalWindow.confirm(
          'Delete ' + disasterId + '? This action cannot be undone')) {
    disasters.delete(disasterId);
    disasterPicker.val(disasterPicker.children().eq(0).val()).trigger('change');
    $('#' + disasterId).remove();
    return getFirestoreRoot()
        .collection('disaster-metadata')
        .doc(disasterId)
        .delete();
  }
  return Promise.resolve();
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
  return $(document.createElement('option'))
      .html(innerTextAndValue)
      .val(innerTextAndValue)
      .prop('id', innerTextAndValue);
}

loadNavbar(() => $('#nav-header').html('Add Disaster'));
