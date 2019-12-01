import {eeLegacyPathPrefix, eeStatePrefixLength, legacyStateDir} from '../ee_paths.js';
import {LayerType} from '../firebase_layers.js';
import {disasterCollectionReference, getDisasters} from '../firestore_document.js';
import {getDisaster} from '../resources.js';

import {clearStatus, disasterData, getCurrentData, getCurrentLayers, getRowIndex, ILLEGAL_STATE_ERR, onUpdate, setCurrentDisaster, setStatus, updateLayersInFirestore} from './add_disaster_util.js';
import {processNewEeLayer} from './add_layer.js';
import {withColor} from './color_function_util.js';

export {enableWhenReady, toggleState, updateAfterSort};
// Visible for testing
export {
  addDisaster,
  createAssetPickers,
  createLayerRow,
  createOptionFrom,
  createStateAssetPickers,
  createTd,
  deleteDisaster,
  emptyCallback,
  getStatesAssetsFromEe,
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
// A map of maps of the form:
// {'disaster-2017' => {'asset/path': 'TYPE'}}
const disasterAssets = new Map();
const scoreAssetTypes = ['Poverty', 'Income', 'SVI'];

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
  return populateStateAndDisasterAssetPickers(disaster);
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
  row.append(withColor(createTd(), layer, 'color-function', index));
  return row;
}

/**
 * Populates the state asset pickers with all known earth engine assets for
 * those states.
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
    initializeScoreSelectors(states);
  } else {
    const statesDone = getStatesAssetsFromEe(statesToFetch).then((assets) => {
      for (const asset of assets) {
        stateAssets.set(asset[0], asset[1]);
      }
      createStateAssetPickers(states);
      initializeScoreSelectors(states);
    });
    promises.push(statesDone);
  }

  return Promise.all(promises);
}

/**
 * Initializes the select interface for score assets.
 * @param {Array<string>} states array of state (abbreviations)
 */
function initializeScoreSelectors(states) {
  const headerRow = $('#score-asset-header-row');
  const tableBody = $('#asset-selection-table-body');
  tableBody.empty();
  headerRow.empty();

  // Initialize headers.
  headerRow.append(createTd().html('Score Assets'));
  for (const state of states) {
    headerRow.append(createTd().html(state + ' Assets'));
  }

  // For each asset type, add select for all assets for each state.
  for (let i = 0; i < scoreAssetTypes.length; i++) {
    const scoreAssetType = scoreAssetTypes[i];
    const row =
        $(document.createElement('tr')).prop('id', scoreAssetType + '-row');
    row.append(createTd().append(
        $(document.createElement('div')).html(scoreAssetType)));
    for (const state of states) {
      if (stateAssets.get(state)) {
        row.append(createTd().append(createAssetDropdown(
            stateAssets.get(state), scoreAssetType, state)));
      }
    }
    tableBody.append(row);
    row.on('change', () => handleScoreAssetSelection(scoreAssetType));
  }
}

/**
 * Initializes a dropdown with assets.
 * @param {Array<string>} assets array of assets for add to dropdown
 * @param {string} row The asset type/row to put the dropdown in.
 * @param {string} state The state the assets are in.
 * @return {JQuery<HTMLSelectElement>}
 */
function createAssetDropdown(assets, row, state) {
  // Create the asset selector and add a 'None' option.
  const select =
      $(document.createElement('select')).prop('id', row + '-' + state);
  select.append(createOptionFrom('None'));

  // Add assets to selector and return it.
  for (let i = 0; i < assets.length; i++) {
    select.append(createOptionFrom(assets[i]));
  }
  return select;
}

/**
 * Handles the user selecting an asset for one of the possible score types.
 * @param {String} assetType The type of asset (poverty, income, etc)
 */
function handleScoreAssetSelection(assetType) {
  // TODO: Write the asset name and type to firebase here.
  return;
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

/**
 * Gets all assets for the given disaster.
 * @param {string} disaster disaster in the form name-year
 * @return {Promise<Map<string, string>>} Returns a promise containing the map
 * of asset path to type for the given disaster.
 */
function getDisasterAssetsFromEe(disaster) {
  return ee.data.listAssets(eeLegacyPathPrefix + disaster, {}, emptyCallback)
      .then(getIds);
}

// TODO: add functionality for adding assets to disaster records from these
// pickers.
/**
 * Requests all assets in ee directories corresponding to given states.
 * @param {Array<string>} states e.g. ['WA']
 * @return {Promise<Array<Array<string | Array<string>>>>} 2-d array of all
 *     retrieved
 * assets in the form [['WA', {'asset/path': type,...}], ...]
 */
function getStatesAssetsFromEe(states) {
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
            promises.push(Promise.resolve([state, new Map()]));
          } else {
            promises.push(ee.data.listAssets(dir, {}, emptyCallback)
                              .then((result) => [state, getIds(result)]));
          }
        }
        return Promise.all(promises);
      });
}

/**
 * Turns a listAssets call result into a map of asset -> type.
 * @param {Object} listAssetsResult result of call to ee.data.listAssets
 * @return {Map<string, string>}
 */
function getIds(listAssetsResult) {
  const assets = new Map();
  if (listAssetsResult.assets) {
    for (const asset of listAssetsResult.assets) {
      if (checkSupportedAssetType(asset)) {
        assets.set(asset.id, asset.type);
      }
    }
  }
  return assets;
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
 * Given either states or disasters, displays their assets in pickers. Right
 * now, selecting on those pickers doesn't actually do anything.
 * @param {Array<string>} pickers e.g. ['WA',...] or ['harvey-2017']
 * @param {Map<string, Array<string>>} assetMap
 * @param {JQuery<HTMLElement>} div where to attach new pickers
 */
function createAssetPickers(pickers, assetMap, div) {
  console.log(assetMap);
  for (const folder of pickers) {
    const assetPicker = $(document.createElement('select'))
                            .attr({
                              id: folder + '-adder',
                            })
                            .width(200);
    if (assetMap.get(folder)) {
      for (const asset of assetMap.get(folder)) {
        assetPicker.append(createOptionFrom(asset));
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
