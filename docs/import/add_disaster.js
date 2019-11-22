import {writeWaiterId} from '../dom_constants.js';
import {eeStatePrefixLength, legacyStateDir} from '../ee_paths.js';
import {LayerType} from '../firebase_layers.js';
import {getFirestoreRoot} from '../firestore_document.js';
import {disasterCollectionReference, getDisasters} from '../firestore_document.js';
import {addLoadingElement, loadingElementFinished} from '../loading.js';
import {getDisaster} from '../resources.js';

export {enableWhenReady, toggleState, updateAfterSort};
// Visible for testing
export {
  addDisaster,
  createAssetPickers,
  createOptionFrom,
  createTd,
  deleteDisaster,
  disasterData,
  emptyCallback,
  getAssetsFromEe,
  getCurrentData,
  getCurrentLayers,
  onCheck,
  onInputBlur,
  onListBlur,
  stateAssets,
  updateLayersInFirestore,
  withCheckbox,
  withColor,
  withInput,
  withList,
  withType,
  writeNewDisaster,
};

// A map of disaster names to data. This pulls once on firebase
// authentication and then makes local updates afterwards so we don't need to
// wait on firebase writes to read new info.
const disasterData = new Map();

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
  deleteButton.on('click', deleteDisaster);

  // populate disaster picker.
  return getDisasters().then((querySnapshot) => {
    const disasterPicker = $('#disaster');
    querySnapshot.forEach((doc) => {
      const name = doc.id;
      disasterPicker.prepend(createOptionFrom(name));
      disasterData.set(name, doc.data());
    });

    disasterPicker.on('change', () => toggleDisaster(disasterPicker.val()));
    disasterPicker.val(getDisaster()).trigger('change');
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
  setCurrentDisaster(disaster);
  // display layer table
  populateLayersTable();
  // display state asset pickers
  return populateStateAssetPickers();
}

const STATE = {
  SAVED: 0,
  WRITING: 1,
  QUEUED_WRITE: 2,
};
Object.freeze(STATE);

let state = STATE.SAVED;
let pendingWriteCount = 0;

window.onbeforeunload = () => pendingWriteCount > 0 ? true : null;

/**
 * Write the current state of {@code disasterData} to firestore.
 * @return {?Promise<void>} Returns when finished writing or null if it just
 * queued a write and doesn't know when that will finish.
 */
function updateLayersInFirestore() {
  if (state !== STATE.SAVED) {
    state = STATE.QUEUED_WRITE;
    return null;
  }
  addLoadingElement(writeWaiterId);
  state = STATE.WRITING;
  pendingWriteCount++;
  return getFirestoreRoot()
      .collection('disaster-metadata')
      .doc(getDisaster())
      .set({layers: getCurrentLayers()}, {merge: true})
      .then(() => {
        pendingWriteCount--;
        const oldState = state;
        state = STATE.SAVED;
        switch (oldState) {
          case STATE.WRITING:
            loadingElementFinished(writeWaiterId);
            return null;
          case STATE.QUEUED_WRITE:
            loadingElementFinished(writeWaiterId);
            return updateLayersInFirestore();
          case STATE.SAVED:
            console.error('Unexpected layer write state');
            return null;
        }
      });
}

/**
 * Update the table and disasterData with new indices after a layer has been
 * reordered. Then write to firestore.
 * @param {Object} ui jquery object that contains details about this sort
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function updateAfterSort(ui) {
  const layers = getCurrentLayers();
  const numLayers = layers.length;
  const oldRealIndex = getRowIndex($(ui.item));
  const newRealIndex = numLayers - 1 - $(ui.item).index();

  // pull out moved row and shuffle everything else down
  const row = layers.splice(oldRealIndex, 1)[0];
  // insert at new index
  layers.splice(newRealIndex, 0, row);

  // Reindex all the layers.
  for (let i = Math.min(oldRealIndex, newRealIndex);
       i <= Math.max(oldRealIndex, newRealIndex); i++) {
    const tableIndex = numLayers - i;
    $('#tbody tr:nth-child(' + tableIndex + ') .index-td').text(i);
  }

  return updateLayersInFirestore();
}

/**
 * Look up the real (not table) index of the given row.
 * @param {JQuery<HTMLTableDataCellElement>} row 
 * @return {string}
 */
function getRowIndex(row) {
  return row.children('.index-td').text();
}

/**
 * Wrapper for creating table divs.
 * @return {JQuery<HTMLTableDataCellElement>}
 */
function createTd() {
  return $(document.createElement('td'));
}

/**
 * A common update method that writes to local data and firestore based on
 * a customizable version of the value of the input.
 * @param {Object} event
 * @param {string} property
 * @param {Function} fxn how to read/transform the raw value from the DOM.
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function onUpdate(event, property, fxn) {
  const input = $(event.target);
  const index = getRowIndex(input.parents('tr'));
  getCurrentLayers()[index][property] = fxn(input);
  return updateLayersInFirestore();
}

/**
 * Auto-saves on focus out from input cell.
 * @param {Object} event
 * @param {string} property
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function onInputBlur(event, property) {
  return onUpdate(event, property, (input) => input.val());
}

/**
 * Adds an input box to the given td.
 * @param {JQuery<HTMLTableDataCellElement>} td cell
 * @param {Object} layer
 * @param {string} property
 * @return {JQuery<HTMLTableDataCellElement>}
 */
function withInput(td, layer, property) {
  const input = $(document.createElement('input')).val(layer[property]);
  td.append(input);
  input.on('blur', (event) => onInputBlur(event, property));
  return td;
}

/**
 * Adds text to the given td.
 * @param {JQuery<HTMLTableDataCellElement>} td cell
 * @param {Object} layer
 * @param {string} property
 * @return {JQuery<HTMLTableDataCellElement>}
 */
function withText(td, layer, property) {
  return td.text(layer[property]);
}

/**
 * Auto-saves on focus out from textarea cell.
 * @param {Object} event
 * @param {string} property
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function onListBlur(event, property) {
  return onUpdate(event, property, (textarea) => textarea.val().split('\n'));
}

/**
 * Adds a sample of info from a list to the given td.
 * @param {JQuery<HTMLTableDataCellElement>} td cell
 * @param {Object} layer
 * @param {string} property
 * @return {JQuery<HTMLTableDataCellElement>}
 */
function withList(td, layer, property) {
  const textarea = $(document.createElement('textarea'))
                       .val(layer[property].join('\n'))
                       .prop('rows', 3);
  td.append(textarea);
  textarea.on('blur', (event) => onListBlur(event, property));
  return td;
}

const layerTypeStrings = new Map();
for (const t in LayerType) {
  if (LayerType.hasOwnProperty(t)) {
    layerTypeStrings.set(LayerType[t], t);
  }
}

/**
 * Adds layer type info to the given td.
 * @param {JQuery<HTMLTableDataCellElement>} td cell
 * @param {Object} layer
 * @param {string} property
 * @return {JQuery<HTMLTableDataCellElement>}
}
 */
function withType(td, layer, property) {
  return td.text(layerTypeStrings.get((layer[property])));
}

/**
 * Registers a checkbox change and propagates to disasterData and firestore.
 * @param {Object} event
 * @param {string} property
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function onCheck(event, property) {
  return onUpdate(event, property, (checkbox) => checkbox.is(':checked'));
}

/**
 * Adds checkbox capabilities to the given td.
 * @param {JQuery<HTMLTableDataCellElement>} td cell
 * @param {Object} layer
 * @param {string} property
 * @return {JQuery<HTMLElement> }
 */
function withCheckbox(td, layer, property) {
  const checkbox = $(document.createElement('input'))
                       .prop('type', 'checkbox')
                       .prop('checked', layer[property])
                       .on('change', (event) => onCheck(event, property));
  return td.append(checkbox);
}

/**
 * Creates an instance of the color boxes for the color col.
 * @param {string} color what color to make the box.
 * @return {JQuery<HTMLDivElement>}
 */
function createColorBox(color) {
  return $(document.createElement('div'))
      .addClass('box')
      .css('background-color', color);
}

/**
 * Adds color function info to the given td.
 * @param {JQuery<HTMLElement>} td
 * @param {Object} layer
 * @param {string} property
 * @param {number} index
 * @return {JQuery<HTMLElement>}
 */
function withColor(td, layer, property, index) {
  const colorFunction = layer[property];
  if (!colorFunction) {
    td.text('N/A').addClass('na');
  } else if (colorFunction['single-color']) {
    td.append(createColorBox(colorFunction['single-color']));
  } else if (colorFunction['base-color']) {
    td.append(createColorBox(colorFunction['base-color']));
  } else if (colorFunction['colors']) {
    const colorObject = colorFunction['colors'];
    const colorSet = new Set();
    Object.keys(colorObject).forEach((propertyValue) => {
      const color = colorObject[propertyValue];
      if (!colorSet.has(color)) {
        colorSet.add(color);
        td.append(createColorBox(colorObject[propertyValue]));
      }
    });
  } else {
    setStatus(ILLEGAL_STATE_ERR + 'unrecognized color function: ' + layer);
  }
  return td;
}

/** Populates the layers table with layers of current disaster. */
function populateLayersTable() {
  const layers = getCurrentLayers();
  const tableBody = $('#tbody');
  tableBody.empty();
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const row = $(document.createElement('tr'));
    // index
    row.append(createTd().text(i).addClass('index-td'));
    // display name
    // TODO: make this editable.
    row.append(withInput(createTd(), layer, 'display-name'));
    // asset path/url sample
    const assetOrUrl = createTd();
    if (layer['ee-name']) {
      withText(assetOrUrl, layer, 'ee-name');
    } else if (layer['urls']) {
      withList(assetOrUrl, layer, 'urls');
    } else {
      setStatus(ILLEGAL_STATE_ERR + 'unrecognized type: ' + layer);
    }
    row.append(assetOrUrl);
    // type
    row.append(withType(createTd(), layer, 'asset-type'));
    // display on load
    row.append(withCheckbox(createTd(), layer, 'display-on-load'));
    // color
    // TODO: make this editable.
    row.append(withColor(createTd(), layer, 'color-function', i));
    tableBody.append(row);
  }
}

/**
 * Populates the state asset pickers with all known earth engine assets for
 * those states.
 * @return {Promise<void>} returns when all asset pickers have been populated
 * after potentially retrieving states' assets from ee.
 */
function populateStateAssetPickers() {
  const states = getCurrentData()['states'];
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

  return disasterCollectionReference()
      .doc(disasterId)
      .set({states: states, layers: []})
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
                                 .text('Add EE asset(s) for ' + state + ': ');
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
    disasterData.delete(disasterId);
    disasterPicker.val(disasterPicker.children().eq(0).val()).trigger('change');
    $('#' + disasterId).remove();
    return disasterCollectionReference().doc(disasterId).delete();
  }
  return Promise.resolve();
}

/**
 * Utility function for setting the status div.
 * @param {String} text
 */
function setStatus(text) {
  $('#status').text(text).show();
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
      .text(innerTextAndValue)
      .val(innerTextAndValue)
      .prop('id', innerTextAndValue);
}

/**
 * Utility function for getting current data.
 * @return {Object}
 */
function getCurrentData() {
  return disasterData.get(getDisaster());
}

/**
 * Utility function for getting current layers.
 * @return {Array<Object>}
 */
function getCurrentLayers() {
  return getCurrentData()['layers'];
}

/**
 * Sets the current disaster so getCurrentData works for testing.
 * @param {string} disasterId
 */
function setCurrentDisaster(disasterId) {
  localStorage.setItem('disaster', disasterId);
}

const ILLEGAL_STATE_ERR =
    'Internal Error: contact developer with the following information: ';
