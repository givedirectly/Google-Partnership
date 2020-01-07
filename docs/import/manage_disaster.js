import {eeLegacyPathPrefix, legacyStateDir} from '../ee_paths.js';
import {convertEeObjectToPromise} from '../ee_promise_cache.js';
import {showError} from '../error.js';
import {disasterCollectionReference} from '../firestore_document.js';
import {latLngToGeoPoint, transformGeoPointArrayToLatLng} from '../map_util.js';
import {getDisaster} from '../resources.js';
import {createDisasterData, incomeKey, snapKey, sviKey, totalKey} from './create_disaster_lib.js';
import {createScoreAssetForStateBasedDisaster, setStatus} from './create_score_asset.js';
import {cdcGeoidKey, censusBlockGroupKey, censusGeoidKey, tigerGeoidKey} from './import_data_keys.js';
import {getDisasterAssetsFromEe, getStateAssetsFromEe} from './list_ee_assets.js';
import {clearStatus} from './manage_layers_lib.js';
import {ScoreBoundsMap} from './score_bounds_map.js';
import {updateDataInFirestore} from './update_firestore_disaster.js';
import {LayerType} from '../firebase_layers.js';
import {isUserProperty} from '../property_names.js';

export {
  enableWhenReady,
  onSetDisaster,
  setUpScoreBoundsMap,
  setUpStateBasedScoreSelectorTable,
  toggleState,
};
/** @VisibleForTesting */
export {
  addDisaster,
  assetSelectionPrefix,
  createScoreAssetForStateBasedDisaster,
  deleteDisaster,
  disasterData,
  enableWhenFirestoreReady,
  stateBasedScoreAssetTypes,
  scoreBoundsMap,
  updateColorAndHover,
  validateUserFields,
  writeNewDisaster,
};

// TODO(juliexxia): consolidate asset picker logic and storage structure between
// manage_layers.js and manage_disaster.js
// TODO: refactor to avoid as much jumpiness as possible.

/**
 * @type {Map<string, Object>} Disaster id to disaster data, corresponding to
 *     data in Firestore. Initialized when Firestore data is downloaded, but set
 *     to an empty map here for testing
 */
let disasterData = new Map();

/**
 * Effectively constant {@link ScoreBoundsMap} initialized in {@link
 * enableWhenReady}.
 * @type {ScoreBoundsMap}
 */
let scoreBoundsMap;

const scoreCoordinatesPath = Object.freeze(['scoreBoundsCoordinates']);

const kickOffText = 'Kick off Data Processing (will take a while!)';
const optionalWarningPrefix = '; warning: created asset will be missing ';

/**
 * Checks that all mandatory fields that can be entered by the user have
 * non-empty values. Does not check that assets actually exist, are of valid
 * type, etc. If all validation succeeds, enables kick-off button, otherwise
 * disables and changes button text to say what is missing.
 *
 * Some fields (Income, SVI) are optional. If they are missing, a separate
 * message is displayed on the button, but it can still be enabled. If it is
 * enabled, it is yellowed a bit to indicate the missing optional assets.
 * The buildings asset is optional if the damage asset is not present, but is
 * required if the damage asset is present.
 * TODO(janakr): We could allow buildings asset to be absent even when
 *  damage is present and calculate damage percentage based on household
 *  count. But does GD want that? We'd have to warn here so users knew they were
 *  getting a less accurate damage percentage count.
 */
function validateUserFields() {
  const {states} = disasterData.get(getDisaster()).assetData.stateBasedData;
  /**
   * Holds missing assets, as arrays. Each array has the display name of the
   * asset type, and, if this is a multistate disaster, a string indicating
   * which states are missing for this type.
   */
  const missingItems = [];
  const multistate = states.length > 1;
  const damageAssetPresent = !!$('#damage-asset-select').val();

  for (const {idStem, displayName} of stateBasedScoreAssetTypes) {
    const missingForType = [];
    for (const state of states) {
      if (!$('#select-' + assetSelectionPrefix + idStem + '-' + state)
               .val()) {
        missingForType.push(state);
      }
    }
    if (missingForType.length) {
      const missingItem = [displayName];
      if (multistate) {
        missingItem.push('[' + missingForType.join(', ') + ']');
      }
      missingItems.push(missingItem);
    }
  }
  const hasDamage =
      damageAssetPresent || getElementFromPath(scoreCoordinatesPath);
  let message = '';
  let optionalMessage = '';
  if (missingItems.length) {
    for (const missingItem of missingItems) {
      const isBuildings = missingItem[0] === 'Microsoft Building Shapefiles';
      // Buildings is optional if damage asset not present, mandatory otherwise.
      const buildingsOptional = isBuildings && !damageAssetPresent;
      const optional = missingItem[0] === 'Income' ||
          missingItem[0] === 'SVI' || buildingsOptional;
      // Construct string to append to message: display name + missing states,
      // if any. Optional buildings is special because we don't actually display
      // "Microsoft Building Shapefiles" on the map, only building counts, so we
      // tell the user that's what they'll be missing.
      const itemString = buildingsOptional ?
          ('Building counts' +
           (missingItem.length > 1 ? ' ' + missingItem[1] : '')) :
          missingItem.join(' ');
      if (optional) {
        optionalMessage += (optionalMessage ? ', ' : '') + itemString;
      } else {
        message += (message ? ', ' : '') + itemString;
      }
    }
  }
  if (message) {
    message = 'Missing asset(s): ' + message;
  }
  if (!hasDamage) {
    message += (message ? ', and m' : 'M') +
        'ust specify either damage asset or map bounds';
  }
  if (message && optionalMessage) {
    message += optionalWarningPrefix + optionalMessage;
  }
  const processButton = $('#process-button');
  processButton.show();
  if (message) {
    processButton.text(message);
    processButton.attr('disabled', true);
    processButton.css('background-color', '');
  } else {
    processButton.text(
        kickOffText +
        (optionalMessage ? optionalWarningPrefix + optionalMessage : ''));
    processButton.attr('disabled', false);
    processButton.css(
        'background-color', optionalMessage ? 'rgb(150, 150, 0)' : '');
  }
}

/** @param {HTMLDivElement} div Div to attach score bounds map to */
function setUpScoreBoundsMap(div) {
  scoreBoundsMap = new ScoreBoundsMap(
      div,
      (polygonPath) => handleAssetDataChange(
          polygonPath ? polygonPath.map(latLngToGeoPoint) : null,
          scoreCoordinatesPath));
}
/**
 * Enables page functionality.
 * @param {Promise<Map<string, Object>>} allDisastersData Promise with contents
 *     of Firestore for all disasters
 * @return {Promise<void>} See {@link enableWhenFirestoreReady}
 */
function enableWhenReady(allDisastersData) {
  // Eagerly kick off current disaster asset listing before Firestore finishes.
  const currentDisaster = getDisaster();
  if (currentDisaster) {
    getDisasterAssetsFromEe(currentDisaster);
  }
  return allDisastersData.then(enableWhenFirestoreReady);
}

/**
 * Enables all Firestore-dependent functionality.
 * @param {Map<string, Object>} allDisastersData Contents of
 *     Firestore for all disasters, the current disaster's data is used when
 *     calculating
 * @return {Promise<void>} See {@link onSetDisaster}
 */
function enableWhenFirestoreReady(allDisastersData) {
  disasterData = allDisastersData;
  // Kick off all EE asset fetches.
  for (const disaster of disasterData.keys()) {
    getDisasterAssetsFromEe(disaster);
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
    createScoreAssetForStateBasedDisaster(disasterData.get(getDisaster()));
  });
  return onSetDisaster();
}

/**
 * We track whether or not we've already completed the EE asset-fetching
 * promises for the current disaster. This ensures we don't re-initialize if the
 * user switches back and forth to this disaster while still loading: the second
 * set of promises to complete will do nothing.
 *
 * We don't just use a generation counter (cf. snackbar/toast.js) because when
 * switching from disaster A to B back to A, the first set of promises for A is
 * still valid if they return after we switch back to A.
 */
let processedCurrentDisasterPovertySelectors = false;
let processedCurrentDisasterDamageSelector = false;

/**
 * Function called when current disaster changes. Responsible for displaying the
 * score selectors and enabling/disabling the kick-off button.
 * @return {Promise<void>} Promise that completes when all score parameter
 *     display is done (user can interact with page)
 */
async function onSetDisaster() {
  const currentDisaster = getDisaster();
  if (!currentDisaster) {
    // We don't expect this to happen, because a disaster should always be
    // returned by getDisaster(), but tolerate.
    return Promise.resolve();
  }
  processedCurrentDisasterPovertySelectors = false;
  processedCurrentDisasterDamageSelector = false;
  const {assetData} = disasterData.get(currentDisaster);
  // Kick off score asset processing.
  const scorePromise = assetData.flexibleData ? onSetFlexibleDisaster(assetData) : onSetStateBasedDisaster(assetData);
  let disasterAssets;
  try {
    disasterAssets = await getDisasterAssetsFromEe(currentDisaster);
  } catch (err) {
    if (getDisaster() !== currentDisaster || processedCurrentDisasterDamageSelector) {
      // Don't display errors to user if no longer current disaster.
      return;
    }
    if (err &&
        err !==
        'Asset "' + eeLegacyPathPrefix + currentDisaster +
        '" not found.') {
      setStatus(err);
    }
    disasterAssets = new Map();
  }
  if (getDisaster() !== currentDisaster ||
      processedCurrentDisasterDamageSelector) {
    // Don't do anything unless this is still the right disaster.
    return;
  }
  initializeDamageSelector(disasterAssets);
  processedCurrentDisasterDamageSelector = true;
  await scorePromise;
  // validateUserFields();
}

async function onSetStateBasedDisaster(assetData) {
  const currentDisaster = getDisaster();
  $('#state-based-disaster-asset-selection-table').show();
  $('flexible-poverty-data').hide();
  const {states} = assetData.stateBasedData;
  initializeScoreBoundsMapFromAssetData(assetData, states);

  // Clear out old data on disaster switch.
  const headerRow = $('#score-asset-header-row');
  // Initialize headers.
  removeAllButFirstFromRow(headerRow);
  for (const state of states) {
    headerRow.append(createTd().text(state + ' Assets'));
  }
  for (const {idStem} of stateBasedScoreAssetTypes) {
    const id = assetSelectionPrefix + idStem;
    const row = $('#' + id);
    removeAllButFirstFromRow(row);
  }

  // getStateAssetsFromEe does internal caching.
  const stateAssets = await Promise.all(states.map(getStateAssetsFromEe));
  if (getDisaster() !== currentDisaster ||
      processedCurrentDisasterPovertySelectors) {
    // Don't do anything unless this is still the right disaster.
    return;
  }
  initializeStateBasedScoreSelectors(states, stateAssets);
  processedCurrentDisasterPovertySelectors = true;
}

async function onSetFlexibleDisaster(assetData) {
  const currentDisaster = getDisaster();
  $('#state-based-disaster-asset-selection-table').hide();
  const flexiblePovertyDiv = $('#flexible-poverty-data');
  flexiblePovertyDiv.empty().show();
  initializeScoreBoundsMapFromAssetData(assetData);
  // Same promise as waited on above in onSetDisaster, so actually both will
  // complete before user switches disasters or neither will, but we can still
  // check in each independently.
  const disasterAssets = await getDisasterAssetsFromEe(currentDisaster);
  if (getDisaster() !== currentDisaster ||
      processedCurrentDisasterPovertySelectors) {
    // Don't do anything unless this is still the right disaster.
    return;
  }
  // Don't disable any feature collections.
  for (const attributes of disasterAssets.values()) {
    attributes.disabled = attributes.type !== LayerType.FEATURE_COLLECTION;
  }
  flexiblePovertyDiv.append($(document.createElement('span')).text('Poverty asset path'));
  const povertyId = 'select-flexible-poverty';
  const povertySelect = createAssetDropdownWithNone(disasterAssets, ['flexibleData', 'povertyPath'])
      .prop('id', povertyId)
      .on('change', () => {
        verifyAsset(povertyId, null);
        const assetName = povertySelect.val();
        const attributes = disasterAssets.get(assetName);
        convertEeObjectToPromise(ee.FeatureCollection(assetName).first().propertyNames()).then((properties) => {
          if (!povertySelect.val() !== assetName) {
            // If we've switched assets, do nothing.
            return;
          }
          properties = properties.filter(isUserProperty);

          const geoidSelect = createDropdown(properties.map((p) => [p, {disabled: false}]), ['flexibleData', 'povertyGeoid'])
              .on('change', )
        });
        if (!attributes.hasGeometry) {

        }
      });
  flexiblePovertyDiv.append(povertySelect);
}

function poverty
function initializeScoreBoundsMapFromAssetData(assetData, states = []) {
  const {scoreBoundsCoordinates} = assetData;
  const scoreBoundsAsLatLng = scoreBoundsCoordinates ? transformGeoPointArrayToLatLng(scoreBoundsCoordinates) : null;
  scoreBoundsMap.initialize(scoreBoundsAsLatLng, states);
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
  let states = $('#states').val();

  if (!year || !name) {
    setStatus('Error: Disaster name and year are required.');
    return Promise.resolve(false);
  }
  if ($('#disaster-type-flexible').is(':checked')) {
    states = null;
  } else if (!states) {
    setStatus('Error: states are required for Census-based disaster.');
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
 * there is an existing disaster with the same details or there are errors
 * writing to EarthEngine or Firestore. Tells the user in all failure cases.
 *
 * @param {string} disasterId of the form <year>-<name>
 * @param {?Array<string>} states array of states (abbreviations) or null if
 *     this is not a state-based disaster
 * @return {Promise<boolean>} Returns true if EarthEngine folders created
 *     successfully and Firestore write was successful
 */
async function writeNewDisaster(disasterId, states) {
  if (disasterData.has(disasterId)) {
    setStatus('Error: disaster with that name and year already exists.');
    return false;
  }
  clearStatus();
  const eeFolderPromises =
      [getCreateFolderPromise(eeLegacyPathPrefix + disasterId)];
  if (states) {
    states.forEach(
        (state) => eeFolderPromises.push(
            getCreateFolderPromise(legacyStateDir + '/' + state)));
  }

  const tailError = '" You can try refreshing the page';
  // Wait on EE folder creation to do the Firestore write, since if folder
  // creation fails we don't want to have to undo the write.
  try {
    await Promise.all(eeFolderPromises);
  } catch (err) {
    showError('Error creating EarthEngine folders: "' + err + tailError);
    return false;
  }

  const currentData = createDisasterData(states);
  try {
    await disasterCollectionReference().doc(disasterId).set(currentData);
  } catch (err) {
    const message = err.message ? err.message : err;
    showError('Error writing to Firestore: "' + message + tailError);
    return false;
  }

  disasterData.set(disasterId, currentData);

  const disasterPicker = $('#disaster-dropdown');
  let added = false;
  // We expect this recently created disaster to go near the top of the list, so
  // do a linear scan down.
  // Note: let's hope this tool isn't being used in the year 10000.
  // Comment needed to quiet eslint.
  disasterPicker.children().each(/* @this HTMLElement */ function() {
    if ($(this).val() < disasterId) {
      $(createOptionFrom(disasterId)).insertBefore($(this));
      added = true;
      return false;
    }
  });
  if (!added) disasterPicker.append(createOptionFrom(disasterId));
  toggleState(true);

  disasterPicker.val(disasterId).trigger('change');
  return true;
}

/**
 * Returns a promise that resolves on the creation of the given folder.
 * TODO: add status bar for when this is finished.
 *
 * @param {string} dir asset path of folder to create
 * @return {Promise<void>} resolves when after the directory is created and
 * set to world readable.
 */
function getCreateFolderPromise(dir) {
  return new Promise(
      (resolve, reject) =>
          ee.data.createFolder(dir, false, (result, failure) => {
            if (failure && !failure.startsWith('Cannot overwrite asset ')) {
              reject(failure);
              return;
            }
            ee.data.setAssetAcl(
                dir, {all_users_can_read: true}, (result, failure) => {
                  if (failure) {
                    reject(failure);
                    return;
                  }
                  resolve(result);
                });
          }));
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

const stateBasedScoreAssetTypes = Object.freeze([
  {
    idStem: 'poverty',
    propertyPath: ['stateBasedData', 'snapData', 'paths'],
    displayName: 'Poverty',
    expectedColumns: [censusGeoidKey, censusBlockGroupKey, snapKey, totalKey],
  },
  {
    idStem: 'income',
    propertyPath: ['stateBasedData', 'incomeAssetPaths'],
    displayName: 'Income',
    expectedColumns: [censusGeoidKey, incomeKey],
  },
  {
    idStem: 'svi',
    propertyPath: ['stateBasedData', 'sviAssetPaths'],
    displayName: 'SVI',
    expectedColumns: [cdcGeoidKey, sviKey],
  },
  {
    idStem: 'tiger',
    propertyPath: ['stateBasedData', 'blockGroupAssetPaths'],
    displayName: 'Census TIGER Shapefiles',
    expectedColumns: [tigerGeoidKey],
    geometryExpected: true,
  },
  {
    idStem: 'buildings',
    propertyPath: ['stateBasedData', 'buildingAssetPaths'],
    displayName: 'Microsoft Building Shapefiles',
    expectedColumns: [],
    geometryExpected: true,
  },
]);

const assetSelectionPrefix = 'asset-selection-';

/**
 * Initializes state-based score selector table based on {@link stateBasedScoreAssetTypes}
 * data. Done as soon as page is ready.
 */
function setUpStateBasedScoreSelectorTable() {
  const tbody = $('#asset-selection-table-body');
  for (const {idStem, displayName} of stateBasedScoreAssetTypes) {
    const row = $(document.createElement('tr'));
    row.append(createTd().text(displayName));
    row.prop('id', assetSelectionPrefix + idStem);
    tbody.append(row);
  }
}

/**
 * Initializes the select interface for score assets for a state-based disaster.
 * @param {Array<string>} states array of state (abbreviations)
 * @param {Array<StateList>} stateAssets matching array to the {@code states}
 *     array that holds a map of asset info for each state.
 */
function initializeStateBasedScoreSelectors(states, stateAssets) {
  const headerRow = $('#score-asset-header-row');

  // Initialize headers.
  removeAllButFirstFromRow(headerRow);
  for (const state of states) {
    headerRow.append(createTd().text(state + ' Assets'));
  }

  // For each asset type, add select for all assets for each state.
  for (const {
         idStem,
         propertyPath,
         expectedColumns,
         geometryExpected,
       } of stateBasedScoreAssetTypes) {
    const id = assetSelectionPrefix + idStem;
    const row = $('#' + id);
    removeAllButFirstFromRow(row);
    for (const [i, state] of states.entries()) {
      // Disable FeatureCollections without geometries if desired. Be careful
      // not to modify stateAssets[i]!
      const assets = geometryExpected ?
          new Map(Array.from(
              stateAssets[i],
              ([k, v]) => [k, {disabled: v.disabled || !v.hasGeometry}])) :
          stateAssets[i];
      const statePropertyPath = propertyPath.concat([state]);
      const selectId = 'select-' + id + '-' + state;
      const select =
          createAssetDropdownWithNone(assets, statePropertyPath)
              .prop('id', selectId)
              .on('change',
                  () => onNonDamageAssetSelect(statePropertyPath,
                      expectedColumns, selectId))
              .addClass('with-status-border');
      row.append(createTd().append(select));
      verifyAsset(selectId, expectedColumns);
    }
  }
}

const damagePropertyPath = Object.freeze(['damageAssetPath']);
const DAMAGE_ID = 'damage-asset-select';

/**
 * Initializes the damage selector, given the provided assets.
 * @param {DisasterList} assets List of assets in the disaster folder
 */
function initializeDamageSelector(assets) {
  const select = createAssetDropdownWithNone(
      assets, damagePropertyPath, $('#' + DAMAGE_ID).empty());
  select.on('change', () => {
    const val = select.val();
    damageConsequences(val);
    handleAssetDataChange(val, damagePropertyPath);
  });
  damageConsequences(select.val());
}

function damageConsequences(val) {
  setMapBoundsDiv(!!val);
  verifyAsset(DAMAGE_ID, null);
}

/**
 * Puts the map bounds div in the desired state.
 * @param {boolean} hide If true, hide the div
 */
function setMapBoundsDiv(hide) {
  const mapBoundsDiv = $('#map-bounds-div');
  if (hide) {
    mapBoundsDiv.hide();
  } else {
    mapBoundsDiv.show();
    scoreBoundsMap.onShow();
  }
}

/**
 * Retrieves the object inside the current disaster's assetData, given by the
 * "path" of {@code propertyPath}
 * @param {Array<string>} propertyPath List of attributes to follow
 * @return {*}
 */
function getElementFromPath(propertyPath) {
  let element = disasterData.get(getDisaster()).assetData;
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
 * @param {Map<string, {disabled: boolean}>} assets map of assets to add to
 *     dropdown
 * @param {Array<string>} propertyPath List of attributes to follow to get
 *     value.
 * @param {jQuery<HTMLSelectElement>} select Select element, will be created if
 *     not given
 * @return {JQuery<HTMLSelectElement>}
 */
function createAssetDropdownWithNone(
    assets, propertyPath, select = $(document.createElement('select'))) {
  const noneOption = createOptionFrom('None');
  noneOption.val('');
  select.append(noneOption);
  return createDropdown(assets, propertyPath, select);
}

function createDropdown(assets, propertyPath, select = $(document.createElement('select'))) {
  const value = getElementFromPath(propertyPath);
  // Add assets to selector and return it.
  for (const [asset, assetInfo] of assets) {
    const assetOption =
        createOptionFrom(asset).attr('disabled', assetInfo.disabled);
    if (asset === value) {
      assetOption.attr('selected', true);
    }
    select.append(assetOption);
  }

  return select;
}

/**
 * Sets off a column verification check and data write.
 * @param {Array<string>} propertyPath List of attributes to follow to get
 *     value.
 * @param {Array<string>} expectedColumns
 * @return {Promise<void>} see {@link verifyAsset}
 */
function onNonDamageAssetSelect(
    propertyPath, expectedColumns, selectId) {
  handleAssetDataChange(newAsset, propertyPath);
  return verifyAsset(selectId, expectedColumns);
}

// Map of asset picker (represented by a string '<type>-<state>' e.g.
// 'poverty-WA') to the most recent value of the picker. This helps us ensure
// that we're only updating the status box for the most recently selected value.
const lastSelectedAsset = new Map();

/**
 * Verifies an asset exists and has the expected columns.
 * @param {?Array<string>} expectedColumns Expected column names. If null, does
 *     no column checking
 * @return {Promise<void>} returns null if there was no asset to check.
 *     Otherwise returns a promise that resolves when existence and column
 *     checking are finished and select border color is updated.
 */
function verifyAsset(selectId, expectedColumns) {
  // TODO: disable or discourage kick off until all green?
  const select = $('#' + selectId);
  const asset = select.val();
  lastSelectedAsset.set(selectId, asset);
  const assetMissingErrorFunction = (err) => {
    const message = err.message || err;
    if (message.includes('\'' + asset + '\' not found.')) {
      updateColorAndHover(select, 'red', 'Error! asset could not be found.');
    } else {
      console.error(err);
      updateColorAndHover(select, 'red', 'Unknown error: ' + message);
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
  } else if (expectedColumns) {
    updateColorAndHover(select, 'yellow', 'Checking columns...');
    return convertEeObjectToPromise(getColumnsStatus(asset, expectedColumns))
        .then((error) => {
          if (lastSelectedAsset.get(selectId) === asset) {
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
  } else {
    updateColorAndHover(select, 'green');
  }
}

/**
 * Updates the border and hover text of the select.
 * @param {JQuery<HTMLSelectElement>} select
 * @param {string} color
 * @param {?string} title
 */
function updateColorAndHover(select, color, title = null) {
  select.css('border-color', color);
  if (title) {
    select.prop('title', title);
  }
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
 * Handles the user entering a value into score-related input
 * @param {?*} val Value of input. empty strings are treated like null (ugh)
 * @param {Array<string>} propertyPath path to property inside asset data. We
 *     set this value by setting the parent's attribute to the target's value
 * @return {Promise<void>} Promise that completes when Firestore writes are done
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
  return updateDataInFirestore(() => disasterData.get(getDisaster()));
}

/**
 * Simple utility to create an option for a select.
 * @param {string} text Displayed text/value of option
 * @return {JQuery<HTMLOptionElement>}
 */
function createOptionFrom(text) {
  return $(document.createElement('option')).text(text);
}
