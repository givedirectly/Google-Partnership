import {LayerType} from '../firebase_layers.js';
import {getDisastersData} from '../firestore_document.js';
import {getDisaster} from '../resources.js';

import {processNewEeLayer} from './add_layer.js';
import {withColor} from './color_function_util.js';
import {getDisasterAssetsFromEe, getStatesAssetsFromEe} from './list_ee_assets.js';
import {disasterData, getCurrentData, getCurrentLayers, getRowIndex, ILLEGAL_STATE_ERR, onUpdate, setCurrentDisaster, setDisasterData, setStatus, updateLayersInFirestore} from './manage_layers_lib.js';

export {enableWhenReady, updateAfterSort};
// Visible for testing
export {
  createAssetPickers,
  createLayerRow,
  createOptionFrom,
  createStateAssetPickers,
  createTd,
  onCheck,
  onDelete,
  onInputBlur,
  onListBlur,
  stateAssets,
  withCheckbox,
  withInput,
  withList,
  withType,
};

// A map of maps of the form:
// {'WA' => {'asset/path': LayerType}}
const stateAssets = new Map();

// A map of maps of the form:
// {'disaster-2017' => {'asset/path': LayerType}}
const disasterAssets = new Map();

// TODO: general reminder to add loading indicators for things like creating
// new state asset folders, etc.

/**
 * Populates the disaster picker with disasters from firestore.
 * @return {Promise<firebase.firestore.QuerySnapshot>}
 */
function enableWhenReady() {
  // populate disaster picker.
  return getDisastersData().then((returnedData) => {
    setDisasterData(returnedData);
    const disasterPicker = $('#disaster');
    for (const name of disasterData.keys()) {
      disasterPicker.prepend(createOptionFrom(name));
    }

    disasterPicker.on('change', () => toggleDisaster(disasterPicker.val()));
    disasterPicker.val(getDisaster()).trigger('change');
    $('#pending-disaster').hide();
    $('#disaster').show();

    $('#add-non-eelayer').on('click', () => addNonEELayer());
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
  return populateStateAndDisasterAssetPickers(disaster);
}

/**
 * Reindex table rows in between bounds (inclusive).
 * @param {number} from
 * @param {number} to
 * @param {number} numLayers
 */
function reindex(from, to, numLayers) {
  for (let i = from; i <= to; i++) {
    const tableIndex = numLayers - i;
    $('#tbody tr:nth-child(' + tableIndex + ') .index-td').text(i);
  }
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

  // reindex layers.
  reindex(
      Math.min(oldRealIndex, newRealIndex),
      Math.max(oldRealIndex, newRealIndex), numLayers);

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

/**
 * Deletes layer on confirmation.
 * @param {JQuery<HTMLTableRowElement>} row
 * @return {?Promise<void>} See updateLayersInFirestore doc
 */
function onDelete(row) {
  if (window.confirm('Delete layer?')) {
    const index = row.children('.index-td').text();
    const layers = getCurrentLayers();
    layers.splice(index, 1);
    const numLayers = layers.length;
    row.remove();
    reindex(index, numLayers - 1, numLayers);
    return updateLayersInFirestore();
  }
}

/**
 * Adds a delete row function to the given td.
 * @param {JQuery<HTMLTableDataCellElement>} td cell
 * @return {JQuery<HTMLElement>}
 */
function withDeleteButton(td) {
  const button = $(document.createElement('button')).prop('type', 'button');
  button.append($(document.createElement('i')).addClass('fas fa-trash-alt'));
  button.on('click', () => onDelete(td.parent('tr')));
  return td.append(button);
}

/** Populates the layers table with layers of current disaster. */
function populateLayersTable() {
  const layers = getCurrentLayers();
  const tableBody = $('#tbody');
  tableBody.empty();
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    tableBody.append(createLayerRow(layer, i));
  }
}

/**
 * Creates a new row in the layers table.
 *
 * @param {Object} layer
 * @param {number} index
 * @return {JQuery<HTMLTableRowElement>}
 */
function createLayerRow(layer, index) {
  const row = $(document.createElement('tr'));
  // index
  row.append(createTd().text(index).addClass('index-td'));
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
  row.append(withColor(createTd(), layer, 'color-function'));
  row.append(withDeleteButton(createTd()));
  return row;
}

/**
 * Populates the state and disaster asset pickers with all known earth engine
 * assets for this disaster and relevant states.
 * @param {string} disaster disaster id in the form name-year
 * @return {Promise<void>} returns when all asset pickers have been populated
 * after potentially retrieving assets from ee.
 */
function populateStateAndDisasterAssetPickers(disaster) {
  const assetPickerDiv = $('.asset-pickers');
  assetPickerDiv.empty();

  const promises = [];
  if (disasterAssets.has(disaster)) {
    createDisasterAssetPicker(disaster);
  } else {
    const disasterDone = getDisasterAssetsFromEe(disaster).then((assets) => {
      disasterAssets.set(disaster, assets);
      createDisasterAssetPicker(disaster);
    });
    promises.push(disasterDone);
  }

  const states = getCurrentData()['states'];
  const statesToFetch = [];
  for (const state of states) {
    if (!stateAssets.has(state)) statesToFetch.push(state);
  }
  // TODO: add functionality to re-pull all cached states from ee without
  // reloading the page.
  if (statesToFetch.length === 0) {
    createStateAssetPickers(states);
  } else {
    const statesDone = getStatesAssetsFromEe(statesToFetch).then((assets) => {
      for (const asset of assets) {
        stateAssets.set(asset[0], asset[1]);
      }
      createStateAssetPickers(states);
    });
    promises.push(statesDone);
  }

  return Promise.all(promises);
}

/**
 * Create asset pickers for the given states.
 * @param {Array<string>} states of the form ['WA', ...]
 */
function createStateAssetPickers(states) {
  createAssetPickers(states, stateAssets, $('#state-asset-pickers'));
}

/**
 * Create an asset picker for the given disaster.
 * @param {string} disaster
 */
function createDisasterAssetPicker(disaster) {
  createAssetPickers([disaster], disasterAssets, $('#disaster-asset-picker'));
}
/**
 * Given either states or disasters, displays their assets in pickers.
 * @param {Array<string>} pickers e.g. ['WA',...] or ['harvey-2017']
 * @param {Map<string, Array<string>>} assetMap
 * @param {JQuery<HTMLElement>} div where to attach new pickers
 */
function createAssetPickers(pickers, assetMap, div) {
  for (const folder of pickers) {
    const assetPicker = $(document.createElement('select'))
                            .attr({
                              id: folder + '-adder',
                            })
                            .width(200);
    if (assetMap.get(folder)) {
      for (const asset of assetMap.get(folder)) {
        const type = layerTypeStrings.get(asset[1]);
        assetPicker.append(
            createOptionFrom(asset[0]).text(asset[0] + '-' + type));
      }
    }
    const assetPickerLabel = $(document.createElement('label'))
                                 .text('Add layer from ' + folder + ': ');
    const addButton =
        $(document.createElement('button')).prop('type', 'button').text('add');
    addButton.on('click', () => {
      const asset = assetPicker.val();
      const type = assetMap.get(folder).get(asset);
      processNewEeLayer(asset, type);
    });
    div.append(assetPickerLabel);
    assetPickerLabel.append(assetPicker);
    assetPickerLabel.append(addButton);
    div.append(document.createElement('br'));
  }
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
 * Adds a non-ee layer to the map. 
 */
function addNonEELayer() {
  const newLayer = {};
  newLayer['asset-type'] = parseInt($('#non-eelayer-type').val());
  newLayer['display-name'] = $('#non-eelayer-name').val();
  newLayer['display-on-load'] = false;
  newLayer['urls'] = $('#non-eelayer-urls').val().split('\n');

  // Clear values
  $('#non-eelayer-name').val('');
  $('#non-eelayer-urls').val('');

  const layers = getCurrentLayers();
  layers.push(newLayer);
  updateLayersInFirestore();
}
