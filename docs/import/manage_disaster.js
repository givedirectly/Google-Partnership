import {eeLegacyPathPrefix, legacyStateDir} from '../ee_paths.js';
import {LayerType} from '../firebase_layers.js';
import {disasterCollectionReference} from '../firestore_document.js';
import {convertEeObjectToPromise} from '../map_util.js';
import {getDisaster} from '../resources.js';
import {createDisasterData, incomeKey, snapKey, sviKey, totalKey} from './create_disaster_lib.js';
import {createScoreAsset, setStatus} from './create_score_asset.js';
import {cdcGeoidKey, censusBlockGroupKey, censusGeoidKey, tigerGeoidKey} from './import_data_keys.js';
import {getDisasterAssetsFromEe, getStatesAssetsFromEe} from './list_ee_assets.js';
import {clearStatus} from './manage_layers_lib.js';
import {updateDataInFirestore} from './update_firestore_disaster.js';

export {enableWhenReady, onSetDisaster, setUpScoreSelectorTable, toggleState};
/** @VisibleForTesting */
export {
  addDisaster,
  assetSelectionRowPrefix,
  createScoreAsset,
  deleteDisaster,
  disasterData,
  initializeDamageSelector,
  initializeScoreSelectors,
  scoreAssetTypes,
  stateAssets,
  updateColorAndHover,
  validateUserFields,
  writeNewDisaster,
};

/**
 * @type {Map<string, Object>} Disaster id to disaster data, corresponding to
 *     data in Firestore. Initialized when Firestore data is downloaded, but set
 *     to an empty map here for testing
 */
let disasterData = new Map();
/**
 * @type {Map<string, Promise<Array<string>>>} Disaster id to listing of
 *     assets in corresponding EE folder
 */
const disasterAssets = new Map();

// Map of state to list of known assets
const stateAssets = new Map();

/**
 * Checks that all fields that can be entered by the user have a non-empty
 * value. Does not check that assets actually exist, are of valid type, etc. If
 * all validation succeeds, enables kick-off button, otherwise disables and
 * changes button text to say what is missing.
 */
function validateUserFields() {
  const states = disasterData.get(getDisaster()).states;
  const missingItems = [];
  for (const scoreAssetType of scoreAssetTypes) {
    const missingForType = [];
    for (const state of states) {
      if (!$('#select-' + assetSelectionRowPrefix + scoreAssetType[0] + '-' +
             state)
               .val()) {
        missingForType.push(state);
      }
    }
    if (missingForType.length) {
      missingItems.push(
          scoreAssetType[2] +
          (states.length > 1 ? ' [' + missingForType.join(', ') + ']' : ''));
    }
  }
  const hasDamage = $('#damage-asset-select').val() ||
      ($('#map-bounds-sw').val() && $('#map-bounds-ne').val());
  let message = '';
  if (missingItems.length) {
    message = 'Missing asset(s): ' + missingItems.join(', ');
  }
  if (!hasDamage) {
    message += (message ? ', and m' : 'M') +
        'ust specify either damage asset or map bounds';
  }
  const processButton = $('#process-button');
  processButton.show();
  if (message) {
    processButton.text(message);
    processButton.attr('disabled', true);
  } else {
    processButton.text('Kick off Data Processing (will take a while!)');
    processButton.attr('disabled', false);
  }
}

/**
 * Enables page functionality.
 * @param {Promise<Map<string, Object>>} allDisastersData Promise with contents
 *     of Firestore for all disasters
 */
function enableWhenReady(allDisastersData) {
  // Eagerly kick off current disaster asset listing before Firestore finishes.
  const currentDisaster = getDisaster();
  if (currentDisaster) {
    maybeFetchDisasterAssets(currentDisaster);
  }
  allDisastersData.then(enableWhenFirestoreReady);
}

/**
 * Enables all Firestore-dependent functionality.
 * @param {Map<string, Object>} allDisastersData Contents of
 *     Firestore for all disasters, the current disaster's data is used when
 *     calculating
 */
function enableWhenFirestoreReady(allDisastersData) {
  disasterData = allDisastersData;
  onSetDisaster();
  // Kick off all EE asset fetches.
  for (const disaster of disasterData.keys()) {
    maybeFetchDisasterAssets(disaster);
  }
  // enable add disaster button.
  const addDisasterButton = $('#add-disaster-button');
  addDisasterButton.prop('disabled', false);
  addDisasterButton.on('click', addDisaster);

  // Enable delete button.
  const deleteButton = $('#delete');
  deleteButton.prop('disabled', false);
  deleteButton.on('click', deleteDisaster);

  const processButton = $('#process-button');
  processButton.prop('disabled', false);
  processButton.on('click', () => {
    // Disable button to avoid over-clicking. User can reload page if needed.
    processButton.prop('disabled', true);
    createScoreAsset(disasterData.get(getDisaster()));
  });
}

let processedCurrentDisasterStateAssets = false;
let processedCurrentDisasterSelfAssets = false;

/**
 * Function called when current disaster changes. Responsible for displaying the
 * score selectors and enabling/disabling the kick-off button.
 */
function onSetDisaster() {
  processedCurrentDisasterStateAssets = false;
  processedCurrentDisasterSelfAssets = false;
  const currentDisaster = getDisaster();
  if (currentDisaster) {
    const states = disasterData.get(currentDisaster).states;
    const neededStates = [];
    // TODO: eagerly fetch all states assets.
    for (const state of states) {
      if (!stateAssets.has(state)) {
        neededStates.push(state);
      }
    }
    let promise = Promise.resolve();
    if (neededStates) {
      promise = getStatesAssetsFromEe(neededStates).then((result) => {
        for (const stateItem of result) {
          const features = [];
          stateItem[1].forEach((val, key) => {
            if (val === LayerType.FEATURE_COLLECTION) {
              features.push(key);
            }
          });
          stateAssets.set(stateItem[0], features);
        }
      });
    }
    const scorePromise = promise.then(() => {
      if (getDisaster() === currentDisaster &&
          !processedCurrentDisasterStateAssets) {
        // Don't do anything unless this is still the right disaster.
        initializeScoreSelectors(states);
        processedCurrentDisasterStateAssets = true;
      }
    });
    const disasterLambda = (assets) => {
      if (getDisaster() === currentDisaster &&
          !processedCurrentDisasterSelfAssets) {
        // Don't do anything unless this is still the right disaster.
        initializeDamageSelector(assets);
        processedCurrentDisasterSelfAssets = true;
      }
    };
    // Handle errors in disaster asset retrieval by just emptying out.
    const damagePromise =
        disasterAssets.get(currentDisaster).then(disasterLambda, (err) => {
          if (err &&
              err !==
                  'Asset "' + eeLegacyPathPrefix + currentDisaster +
                      '" not found.') {
            setStatus(err);
          }
          disasterLambda([]);
        });
    Promise.all([scorePromise, damagePromise]).then(validateUserFields);
  }
}

/**
 * If disaster assets not known for disaster, kicks off fetch and stores promise
 * in disasterAssets map.
 * @param {string} disaster
 */
function maybeFetchDisasterAssets(disaster) {
  if (!disasterAssets.has(disaster)) {
    disasterAssets.set(
        disaster,
        getDisasterAssetsFromEe(disaster).then(
            (result) => Array.from(result.keys())));
  }
}

/**
 * Deletes a disaster from firestore. Confirms first. Returns when deletion is
 * complete (or instantly if deletion doesn't actually happen).
 *
 * TODO(janakr): If a slow write from {@link updateDataInFirestore} happens to
 *  lose to this delete, the doc will be recreated, which isn't great. Could
 *  maybe track all pending write promises and chain this one off of them, or
 *  disable delete button until all pending writes were done (might be good to
 *  give user an indication like that).
 * @return {Promise<void>}
 */
function deleteDisaster() {
  const disasterPicker = $('#disaster-dropdown');
  const disasterId = disasterPicker.val();
  if (confirm('Delete ' + disasterId + '? This action cannot be undone')) {
    disasterData.delete(disasterId);
    // Don't know how to get a select element's "options" field in jQuery.
    disasterPicker[0].remove(disasterPicker[0].selectedIndex);
    const newOption = disasterPicker.children().eq(0);
    disasterPicker.val(newOption.val()).trigger('change');
    return disasterCollectionReference().doc(disasterId).delete();
  }
  return Promise.resolve();
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
 * Writes the given details to a new disaster entry in firestore. Fails if
 * there is an existing disaster with the same details.
 *
 * TODO(janakr): If the user starts editing a disaster before the Firestore
 *  write completes, their edit could be overwritten by the initial Firestore
 *  write here. Probably solved similar to the delete disaster issue: don't
 *  actually show the disaster as editable until this write completes.
 * @param {string} disasterId of the form <year>-<name>
 * @param {Array<string>} states array of state (abbreviations)
 * @return {Promise<boolean>} returns true after successful write to firestore
 * and earth engine folder creations.
 */
function writeNewDisaster(disasterId, states) {
  if (disasterData.has(disasterId)) {
    setStatus('Error: disaster with that name and year already exists.');
    return Promise.resolve(false);
  }
  clearStatus();
  const currentData = createDisasterData(states);
  disasterData.set(disasterId, currentData);
  // We know there are no assets in folder yet.
  disasterAssets.set(disasterId, Promise.resolve([]));

  const folderCreationPromises = [];
  folderCreationPromises.push(
      getCreateFolderPromise(eeLegacyPathPrefix + disasterId));
  for (const state of states) {
    folderCreationPromises.push(
        getCreateFolderPromise(legacyStateDir + '/' + state));
  }

  const eePromisesResult = Promise.all(folderCreationPromises).then(() => {
    const disasterPicker = $('#disaster-dropdown');
    const disasterOptions = disasterPicker.children();
    let added = false;
    // We expect this recently created disaster to go near the top of the list,
    // so do a linear scan down. Note: let's hope this tool isn't being used in
    // the year 10000.
    // Comment needed to quiet eslint.
    disasterOptions.each(/* @this HTMLElement */ function() {
      if ($(this).val() < disasterId) {
        $(createOptionFrom(disasterId)).insertBefore($(this));
        added = true;
        return false;
      }
    });
    if (!added) disasterPicker.append(createOptionFrom(disasterId));
    toggleState(true);

    disasterPicker.val(disasterId).trigger('change');
  });

  return Promise
      .all([
        eePromisesResult,
        disasterCollectionReference().doc(disasterId).set(currentData),
      ])
      .then(() => true);
}

/**
 * Returns a promise that resolves on the creation of the given folder.
 *
 * This will print a console error for anyone other than the gd
 * account. Ee console seems to have the power to grant write access
 * to non-owners but it doesn't seem to work. Sent an email to
 * gestalt.
 * TODO: replace with setIamPolicy when that works.
 * TODO: add status bar for when this is finished.
 *
 * @param {string} dir asset path of folder to create
 * @return {Promise<void>} resolves when after the directory is created and
 * set to world readable.
 */
function getCreateFolderPromise(dir) {
  return new Promise(
      (resolve) => ee.data.createFolder(
          dir, false,
          () => ee.data.setAssetAcl(
              dir, {all_users_can_read: true}, () => resolve())));
}

/**
 * Returns true if the given string is *not* all lowercase letters.
 * @param {string} val
 * @return {boolean}
 */
function notAllLowercase(val) {
  return !/^[a-z]+$/.test(val);
}

/**
 * Changes page state between looking at a known disaster and adding a new one.
 * @param {boolean} known
 */
function toggleState(known) {
  if (known) {
    $('#new-disaster').hide();
    $('#current-disaster-interaction').show();
  } else {
    $('#new-disaster').show();
    $('#current-disaster-interaction').hide();
  }
}

const scoreAssetTypes = [
  [
    'poverty',
    ['snap_data', 'paths'],
    'Poverty',
    [censusGeoidKey, censusBlockGroupKey, snapKey, totalKey],
  ],
  ['income', ['income_asset_paths'], 'Income', [censusGeoidKey, incomeKey]],
  ['svi', ['svi_asset_paths'], 'SVI', [cdcGeoidKey, sviKey]],
  [
    'tiger',
    ['block_group_asset_paths'],
    'Census TIGER Shapefiles',
    [tigerGeoidKey],
  ],
  ['buildings', ['building_asset_paths'], 'Microsoft Building Shapefiles', []],
];
Object.freeze(scoreAssetTypes);

const assetSelectionRowPrefix = 'asset-selection-row-';

/**
 * Initializes score selector table based on {@link scoreAssetTypes} data. Done
 * as soon as page is ready.
 */
function setUpScoreSelectorTable() {
  const tbody = $('#asset-selection-table-body');
  for (const scoreAssetType of scoreAssetTypes) {
    const row = $(document.createElement('tr'));
    row.append(createTd().text(scoreAssetType[2]));
    row.prop('id', assetSelectionRowPrefix + scoreAssetType[0]);
    tbody.append(row);
  }
}

/**
 * Initializes the select interface for score assets.
 * @param {Array<string>} states array of state (abbreviations)
 */
function initializeScoreSelectors(states) {
  const headerRow = $('#score-asset-header-row');

  // Initialize headers.
  removeAllButFirstFromRow(headerRow);
  for (const state of states) {
    headerRow.append(createTd().text(state + ' Assets'));
  }

  // For each asset type, add select for all assets for each state.
  for (const scoreAssetType of scoreAssetTypes) {
    const type = scoreAssetType[0];
    const id = assetSelectionRowPrefix + type;
    const propertyPath = scoreAssetType[1];
    const expectedColumns = scoreAssetType[3];
    const row = $('#' + id);
    removeAllButFirstFromRow(row);
    for (const state of states) {
      if (stateAssets.get(state)) {
        const statePropertyPath = propertyPath.concat([state]);
        const select =
            createAssetDropdown(stateAssets.get(state), statePropertyPath)
                .prop('id', 'select-' + id + '-' + state)
                .on('change',
                    (event) => onNonDamageAssetSelect(
                        event, statePropertyPath, expectedColumns, type, state))
                .prop('style', 'border:2px solid');
        row.append(createTd().append(select));
        verifyAsset(select.val(), type, state, expectedColumns);
      }
    }
  }
}

const damagePropertyPath = Object.freeze(['damage_asset_path']);
const swPropertyPath = Object.freeze(['map_bounds_sw']);
const nePropertyPath = Object.freeze(['map_bounds_ne']);

/**
 * Initializes the damage selector, given the provided assets.
 * @param {Array<string>} assets List of assets in the disaster folder
 */
function initializeDamageSelector(assets) {
  const mapBoundsDiv = $('#map-bounds-div');
  const select = createAssetDropdown(
      assets, damagePropertyPath, $('#damage-asset-select').empty());
  select.on('change', (event) => {
    const val = $(event.target).val();
    val ? mapBoundsDiv.hide() : mapBoundsDiv.show();
    handleAssetDataChange(val, damagePropertyPath);
  });
  const swInput = $('#map-bounds-sw');
  swInput.val(getElementFromPath(swPropertyPath));
  addAssetDataChangeHandler(swInput, swPropertyPath);
  const neInput = $('#map-bounds-ne');
  neInput.val(getElementFromPath(nePropertyPath));
  addAssetDataChangeHandler(neInput, nePropertyPath);
  select.val() ? mapBoundsDiv.hide() : mapBoundsDiv.show();
}

/**
 * Retrieves the object inside the current disaster's asset_data, given by the
 * "path" of {@code propertyPath}
 * @param {Array<string>} propertyPath List of attributes to follow
 * @return {*}
 */
function getElementFromPath(propertyPath) {
  let element = disasterData.get(getDisaster()).asset_data;
  for (const property of propertyPath) {
    element = element[property];
  }
  return element;
}

/**
 * Wrapper for creating table divs.
 * @return {JQuery<HTMLTableDataCellElement>}
 */
function createTd() {
  return $(document.createElement('td'));
}

/**
 * Removes all but first td from a row.
 * @param {JQuery<HTMLTableRowElement>} row
 */
function removeAllButFirstFromRow(row) {
  while (row.children('td').length > 1) {
    row.find('td:last').remove();
  }
}

/**
 * Initializes a dropdown with assets and the appropriate change handler.
 * @param {Array<string>} assets List of assets to add to dropdown
 * @param {Array<string>} propertyPath List of attributes to follow to get
 *     value.
 * @param {jQuery<HTMLSelectElement>} select Select element, will be created if
 *     not given
 * @return {JQuery<HTMLSelectElement>}
 */
function createAssetDropdown(
    assets, propertyPath, select = $(document.createElement('select'))) {
  const noneOption = createOptionFrom('None');
  noneOption.val('');
  select.append(noneOption);

  const value = getElementFromPath(propertyPath);
  // Add assets to selector and return it.
  for (const asset of assets) {
    const assetOption = createOptionFrom(asset);
    if (asset === value) {
      assetOption.attr('selected', true);
    }
    select.append(assetOption);
  }

  return select;
}

/**
 * Sets off a column verification check and data write.
 * @param {Object} event selector change event
 * @param {Array<string>} propertyPath List of attributes to follow to get
 *     value.
 * @param {Array<string>} expectedColumns
 * @param {string} type
 * @param {string} state
 * @return {Promise<void>} see {@link verifyAsset}
 */
function onNonDamageAssetSelect(
    event, propertyPath, expectedColumns, type, state) {
  const newAsset = $(event.target).val();
  handleAssetDataChange(newAsset, propertyPath);
  return verifyAsset(newAsset, type, state, expectedColumns);
}

// Map of asset picker (represented by a string '<type>-<state>' e.g.
// 'poverty-WA') to the most recent value of the picker. This helps us ensure
// that we're only updating the status box for the most recently selected value.
const lastSelectedAsset = new Map();

/**
 * Verifies an asset exists and has the expected columns.
 * @param {string} asset
 * @param {string} type values from the first index of each entry in {@code
 *     scoreAssetTypes}
 * @param {string} state e.g. 'WA'
 * @param {Array<string>} expectedColumns
 * @return {Promise<void>} returns null if there was no asset to check.
 * Otherwise returns a promise that resolves when existence and column checking
 * are finished and select border color is updated.
 */
function verifyAsset(asset, type, state, expectedColumns) {
  // TODO: disable or discourage kick off until all green?
  const tdId = type + '-' + state;
  const select = $('#select-' + assetSelectionRowPrefix + type + '-' + state);
  lastSelectedAsset.set(tdId, asset);
  const assetMissingErrorFunction = (err) => {
    if (err.includes('\'' + asset + '\' not found.')) {
      updateColorAndHover(select, 'red', 'Error! asset could not be found.');
    } else {
      console.error(err);
      updateColorAndHover(select, 'red', 'Unknown error: ' + err);
    }
  };
  if (asset === '') {
    updateColorAndHover(select, 'white', '');
  } else if (expectedColumns.length === 0) {
    updateColorAndHover(select, 'yellow', 'Checking columns...');
    // TODO: is there a better way to evaluate feature collection existence?
    convertEeObjectToPromise(ee.FeatureCollection(asset).first())
        .then(() => updateColorAndHover(select, 'green', 'No expected columns'))
        .catch(assetMissingErrorFunction);
  } else {
    updateColorAndHover(select, 'yellow', 'Checking columns...');
    return convertEeObjectToPromise(getColumnsStatus(asset, expectedColumns))
        .then((error) => {
          if (lastSelectedAsset.get(tdId) === asset) {
            if (error) {
              updateColorAndHover(
                  select, 'red',
                  'Error! asset does not have all expected columns: ' +
                      expectedColumns);
            } else {
              updateColorAndHover(
                  select, 'green', 'Success! asset has all expected columns');
            }
          }
        })
        .catch(assetMissingErrorFunction);
  }
}

/**
 * Updates the border and hover text of the select.
 * @param {JQuery<HTMLSelectElement>} select
 * @param {string} color
 * @param {string} title
 */
function updateColorAndHover(select, color, title) {
  select.css('border-color', color).prop('title', title);
}

/**
 * Does the actual contains check and returns the appropriate status.
 * @param {string} asset
 * @param {Array<string>} expectedColumns
 * @return {ee.String} status from column check, 0 if contained all columns, 1
 * if there was an error.
 */
function getColumnsStatus(asset, expectedColumns) {
  return ee.Algorithms.If(
      ee.FeatureCollection(asset).first().propertyNames().containsAll(
          ee.List(expectedColumns)),
      ee.Number(0), ee.Number(1));
}

/**
 * Adds the default change handler, which updates our internal data (and
 * Firestore) when this element changes.
 * @param {JQuery<HTMLElement>} elt
 * @param {Array<string>} propertyPath The path to the value of this element
 * @return {JQuery<HTMLElement>} The passed-in element, for chaining
 */
function addAssetDataChangeHandler(elt, propertyPath) {
  return elt.on(
      'change',
      (event) => handleAssetDataChange($(event.target).val(), propertyPath));
}
/**
 * Handles the user entering a value into score-related input
 * @param {string} val Value of input. empty strings are treated like null (ugh)
 * @param {Array<string>} propertyPath path to property inside asset data. We
 *     set this value by setting the parent's attribute to the target's value
 */
function handleAssetDataChange(val, propertyPath) {
  // We want to change the value, which means we have to write an expression
  // like "parent[prop] = val". To obtain the parent object, we just follow the
  // same path as the child's, but stop one property short. That last property
  // is then the "prop" in the expression above.
  const parentProperty = getElementFromPath(propertyPath.slice(0, -1));
  parentProperty[propertyPath[propertyPath.length - 1]] =
      val !== '' ? val : null;
  validateUserFields();
  updateDataInFirestore(() => disasterData.get(getDisaster()));
}

/**
 * Simple utility to create an option for a select.
 * @param {string} text Displayed text/value of option
 * @return {JQuery<HTMLOptionElement>}
 */
function createOptionFrom(text) {
  return $(document.createElement('option')).text(text);
}
