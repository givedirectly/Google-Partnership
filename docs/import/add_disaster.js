import {eeStatePrefixLength, legacyStateDir} from '../ee_paths.js';
import {LayerType} from '../firebase_layers.js';
import {getFirestoreRoot} from '../firestore_document.js';

export {enableWhenReady, toggleState, updateAfterSort};
// Visible for testing
export {
  addDisaster,
  createAssetPickers,
  createOptionFrom,
  deleteDisaster,
  disasterData,
  emptyCallback,
  getAssetsFromEe,
  stateAssets,
  writeNewDisaster,
};

// A map of disaster names to data. This pulls once on firebase
// authentication and then makes local updates afterwards so we don't need to
// wait on firebase writes to read new info.
const disasterData = new Map();

// Map of state to list of known assets
const stateAssets = new Map();

let currentDisaster;

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
  deleteButton.on('click', deleteDisaster);

  // populate disaster picker.
  return getFirestoreRoot()
      .collection('disaster-metadata')
      .get()
      .then((querySnapshot) => {
        const disasterPicker = $('#disaster');
        querySnapshot.forEach((doc) => {
          const name = doc.id;
          disasterPicker.prepend(createOptionFrom(name));
          disasterData.set(name, doc.data());
        });

        disasterPicker.on('change', () => toggleDisaster(disasterPicker.val()));
        const mostRecent = querySnapshot.docs[querySnapshot.size - 1].id;
        disasterPicker.val('2017-harvey').trigger('change');
        toggleState(true);
      });
}

const layerTypeStrings = new Map();
for (let t in LayerType) {
  layerTypeStrings.set(LayerType[t], t);
}

function writeDataToFirestore() {
  return getFirestoreRoot()
      .collection('disaster-metadata')
      .doc(currentDisaster)
      .set(
          {layers: disasterData.get(currentDisaster)['layers']}, {merge: true});
}

/**
 *
 * @param ui
 * @return {Promise<void>}
 */
function updateAfterSort(ui) {
  const numLayers = $('#tbody > tr').length;
  const oldRealIndex = $(ui.item).children('.index-td').html();
  const newRealIndex = numLayers - 1 - $(ui.item).index();

  const layerArray = disasterData.get(currentDisaster)['layers'];
  // pull out moved row and shuffle everything else down
  const row = layerArray.splice(oldRealIndex, 1)[0];
  // insert at new index
  layerArray.splice(newRealIndex, 0, row);

  // dumbly renumber all the layers. note: nth-child starts at 1, .index()
  // starts at 0
  for (let i = 1; i <= numLayers; i++) {
    $('#tbody tr:nth-child(' + i + ') .index-td').html(numLayers - i);
  }

  writeDataToFirestore();
}

/**
 * Utility method for creating table divs with a given inner text
 * @param {string} html inner text
 * @return {JQuery<HTMLTableDataCellElement>}
 */
function createTd(html) {
  return $(document.createElement('td')).html(html);
}

/**
 * On change method for disaster picker.
 * @param {String} disaster
 * @return {Promise<void>} completes when we've finished filling all state
 * pickers and pulled from firebase.
 */
function toggleDisaster(disaster) {
  currentDisaster = disaster;

  const data = disasterData.get(disaster);
  const layers = data['layers'];
  const tableBody = $('#tbody');
  tableBody.empty();
  for (let i = layers.length - 1; i >= 0; i--) {
    const row = $(document.createElement('tr'));
    const layer = layers[i];
    row.append(createTd(i).addClass('index-td'));
    row.append(createTd(layer['display-name']));
    row.append(createTd(layer['ee-name']));
    row.append(createTd(layerTypeStrings.get((layer['asset-type']))));

    const displayCheckbox =
        $(document.createElement('input'))
            .prop('type', 'checkbox')
            .prop('checked', layer['display-on-load'])
            .on('change', () => {
              const index = $('#tbody > tr').length - $('tr').index(row);
              layers[index]['display-on-load'] =
                  displayOnLoadCheckbox.is(':checked');
              writeDataToFirestore();
            });
    row.append(createTd().append(displayCheckbox));

    const colorTd = createTd();
    const colorFunction = layer['color-function'];
    if (!colorFunction) {
      colorTd.html('N/A').addClass('na');
    } else if (colorFunction['single-color']) {
      const color = colorFunction['single-color'];
      colorTd.append($(document.createElement('div'))
                         .addClass('box')
                         .css('background-color', color));
    } else if (colorFunction['base-color']) {
      const color = colorFunction['base-color'];
      colorTd.append($(document.createElement('div'))
                         .addClass('box')
                         .css('background-color', color));
    } else if (colorFunction['colors']) {
      const colorObject = colorFunction['colors'];
      const colorSet = new Set();
      Object.keys(colorObject).forEach((propertyValue) => {
        const color = colorObject[propertyValue];
        if (!colorSet.has(color)) {
          colorSet.add(color);
          colorTd.append(
              $(document.createElement('div'))
                  .addClass('box')
                  .css('background-color', colorObject[propertyValue]));
        }
      });
    }
    row.append(colorTd);
    tableBody.append(row);
  }

  const states = data['states'];
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
  if (disasterData.has(disasterId)) {
    setStatus('Error: disaster with that name and year already exists.');
    return Promise.resolve(false);
  }
  disasterData.set(disasterId, {states: states});
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
 * @return {Promise<void>}
 */
function deleteDisaster() {
  const disasterPicker = $('#disaster');
  const disasterId = disasterPicker.val();
  if (confirm('Delete ' + disasterId + '? This action cannot be undone')) {
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
