import {LayerType} from '../firebase_layers.js';
import {
  disasterCollectionReference,
  getDisastersData
} from '../firestore_document.js';
import {getDisaster} from '../resources.js';
import {withColor} from './color_function_util.js';
import {createDisasterData} from "./create_disaster_lib.js";
import {getStateEeAssets} from "./list_ee_assets.js";
import {
  clearStatus,
  disasterData,
  getCurrentData,
  getCurrentLayers,
  getRowIndex,
  ILLEGAL_STATE_ERR,
  onUpdate,
  setCurrentDisaster,
  setStatus,
  updateLayersInFirestore
} from './manage_layers_lib.js';

export {enableWhenReady, toggleState, updateAfterSort};
// Visible for testing
export {
  createAssetPickers,
  createOptionFrom,
  createTd,
  onCheck,
  onInputBlur,
  onListBlur,
  stateAssets,
  withCheckbox,
  withInput,
  withList,
  withType,
  writeNewDisaster,
};

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
  // populate disaster picker.
  return getDisastersData().then((returnedData) => {
    disasterData = returnedData;
    const disasterPicker = $('#disaster');
    for (const name of disasterData.keys())  {
      disasterPicker.prepend(createOptionFrom(name));
    }

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
 * Wrapper for creating table divs.
 * @return {JQuery<HTMLTableDataCellElement>}
 */
function createTd() {
  return $(document.createElement('td'));
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
    createAssetPickers(states, 'asset-pickers');
  } else {
    // We are already doing this inside createAssetPickers but not until
    // after the first promise completes so also do it here so lingering
    // pickers from previous disasters don't hang around.
    $('#asset-pickers').empty();
    assetPickersDone = getStateEeAssets(statesToFetch).then((assets) => {
      assets.forEach((key, val) => stateAssets.set(key, val));
      createAssetPickers(states, 'asset-pickers');
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
      .set(createDisasterData(states))
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

// TODO: add functionality for adding assets to disaster records from these
// pickers.

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
