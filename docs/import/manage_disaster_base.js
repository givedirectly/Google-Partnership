import {convertEeObjectToPromise} from '../ee_promise_cache.js';
import {latLngToGeoPoint, transformGeoPointArrayToLatLng} from '../map_util.js';
import {isUserProperty} from '../property_names.js';
import {getDisaster} from '../resources.js';

import {ScoreBoundsMap} from './score_bounds_map.js';
import {updateDataInFirestore} from './update_firestore_disaster.js';
import {
  createPendingSelect,
  getDisasterAssetsFromEe
} from './list_ee_assets.js';
import {eeLegacyPathPrefix} from '../ee_paths.js';
import {setStatus} from './create_score_asset.js';

export {
  addPending, pendingDone, allFinished,
  capitalizeFirstLetter,
    continueMessage,
  createAssetDropdownWithNone,
  createColumnDropdown,
  createDropdown,
  createEnabledProperties,
  createSelectFromColumnInfo,
  DAMAGE_COLUMN_INFO,
  DAMAGE_VALUE_INFO,
  damageAssetPresent,
    initializeDamageSelector,
  disasterData,
  getElementFromPath,
  handleAssetDataChange,
  initializeScoreBoundsMapFromAssetData,
    makeIdFromPath,
  onAssetSelect,
  removeAndCreateUl,
  SameDisasterChecker,
  SameSelectChecker,
  showProcessButtonWithDamage,
    showProcessButton,
  setUpScoreBoundsMap,
  setValidateFunction,
  validateColumnArray,
  validateColumnSelect,
  verifyAsset,
  writeSelectAndGetPropertyNames,
};

class SameStateChecker {
  constructor(valueSupplier) {
    this.valueSupplier = valueSupplier;
  }

  reset() {
    this.done = false;
    this.knownValue = this.valueSupplier();
  }

  markDoneIfStillValid() {
    if (!this.done && this.knownValue === this.valueSupplier()) {
      this.done = true;
      return true;
    }
    return false;
  }
}

class SameDisasterChecker extends SameStateChecker {
  constructor() {
    super(getDisaster);
  }
}

class SameSelectChecker extends SameStateChecker {
  constructor(selectElement) {
    super(() => selectElement.val());
    this.reset();
  }

  val() {
    return this.knownValue;
  }
}

// For testing.
export {scoreBoundsMap};

/**
 * @type {Map<string, Object>} Disaster id to disaster data, corresponding to
 *     data in Firestore. Initialized when Firestore data is downloaded.
 */
const disasterData = new Map();

/**
 * Effectively constant {@link ScoreBoundsMap} initialized in {@link
 * enableWhenReady}.
 * @type {ScoreBoundsMap}
 */
let scoreBoundsMap;

const scoreCoordinatesPath = Object.freeze(['scoreBoundsCoordinates']);

/**
 * Either {@link validateStateBasedUserFields} or
 * {@link validateFlexibleUserFields}, depending on the type of disaster. We
 * don't depend explicitly on those functions to avoid having this file depend
 * on disaster-type-specific code.
 * @type {Function}
 */
let validateFunction;

let pendingOperations = 0;

function setValidateFunction(newValidateFunction) {
  validateFunction = newValidateFunction;
}

/** @param {HTMLDivElement} div Div to attach score bounds map to */
function setUpScoreBoundsMap(div) {
  scoreBoundsMap = new ScoreBoundsMap(
      div,
      (polygonPath) => handleAssetDataChange(
          polygonPath ? polygonPath.map(latLngToGeoPoint) : null,
          scoreCoordinatesPath));
}

function initializeScoreBoundsMapFromAssetData(assetData, states = []) {
  const {scoreBoundsCoordinates} = assetData;
  const scoreBoundsAsLatLng = scoreBoundsCoordinates ?
      transformGeoPointArrayToLatLng(scoreBoundsCoordinates) :
      null;
  scoreBoundsMap.initialize(scoreBoundsAsLatLng, states);
}

const damagePropertyPath = Object.freeze(['damageAssetPath']);
const DAMAGE_ID = 'damage-asset-select';

async function initializeDamageSelector() {
  const pendingSelect = createPendingSelect();
  $('#damage-asset-div').append(pendingSelect);
  if (getElementFromPath(damagePropertyPath)) {
    createDamageItems(null);
  } else {
    setMapBoundsDiv(false);
  }
  const currentDisaster = getDisaster();
  let disasterAssets;
  try {
    disasterAssets = await getDisasterAssetsFromEe(currentDisaster);
  } catch (err) {
    if (currentDisaster !== getDisaster()) {
      // Don't display errors to user if no longer current disaster.
      return;
    }
    if (err &&
        err !==
        'Asset "' + eeLegacyPathPrefix + currentDisaster + '" not found.') {
      setStatus(err);
    }
    disasterAssets = new Map();
  } finally {
    pendingSelect.remove();
  }
  if (currentDisaster !== getDisaster()) {
    // Don't do anything unless this is still the right disaster.
    return;
  }
  const select = createAssetDropdownWithNone(
      disasterAssets, damagePropertyPath).prop('id', DAMAGE_ID)
  .on('change', async () => {
    if (select.val()) {
      createDamageItems(null);
    } else {
      removeAndCreateUl('damage');
    }
    const propertyNames =
        await writeSelectAndGetPropertyNames(select, DAMAGE_ID, damagePropertyPath);
    damageConsequences(propertyNames, select.val());
  });

  $('#damage-asset-div').append(select);
  if (select.val()) {
    createDamageItems(null);
  } else {
    removeAndCreateUl('damage');
  }
  return damageConsequences(await verifyAsset(DAMAGE_ID, null), select.val());
}

const DAMAGE_COLUMN_INFO = {
  label: 'column that can distinguish between damaged and undamaged buildings',
  path: ['noDamageKey']
};
const DAMAGE_VALUE_INFO = {
  label: 'value in column that identifies undamaged buildings',
  path: ['noDamageValue']
};

async function damageConsequences(propertyNames, val) {
  setMapBoundsDiv(!!val);
  if (!propertyNames) {
    return;
  }
  createDamageItems(propertyNames);
}

function createDamageItems(propertyNames) {
  const noDamageValueInput =
      $(document.createElement('input'))
          .prop('id', makeIdFromPath(DAMAGE_VALUE_INFO.path))
          .on('blur',
              () => handleAssetDataChange(
                  noDamageValueInput.val(), ['noDamageValue']));
  noDamageValueInput.val(getElementFromPath(['noDamageValue']));
  $('#damage-asset-div')
      .append(
          removeAndCreateUl('damage')
              .append(createSelectFromColumnInfo(
                  DAMAGE_COLUMN_INFO, createEnabledProperties(propertyNames)))
              .append(createListItem(DAMAGE_VALUE_INFO)
              .append(noDamageValueInput)));
}

async function writeSelectAndGetPropertyNames(select, id, path) {
  const sameSelectChecker = new SameSelectChecker(select);
  const propertyNames =
      await onAssetSelect(path, null, id);
  if (!propertyNames || !sameSelectChecker.markDoneIfStillValid()) {
    return null;
  }
  return propertyNames;
}

function createEnabledProperties(properties) {
  if (!properties) {
    return properties;
  }
  properties = properties.filter(isUserProperty);

  // TODO(janakdr): Do async add_layer-style processing so we can warn if
  //  column not ok for whatever user wants it for?
  return properties.map((p) => [p, {disabled: false}]);
}

function createColumnDropdown(properties, path) {
  if (!properties) {
    return createPendingSelect();
  }
  const select = createAssetDropdownWithNone(properties, path);
  return select.on('change', () => handleAssetDataChange(select.val(), path))
      .prop('id', makeIdFromPath(path));
}

function createListItem(columnInfo) {
  return $(document.createElement('li')).append(createLabel(columnInfo) + ': ');
}

function createLabel(columnInfo) {
  return capitalizeFirstLetter(columnInfo.label) +
      (columnInfo.explanation ? ' (' + columnInfo.explanation + ')' : '');
}

function capitalizeFirstLetter(str) {
  return str[0].toUpperCase() + str.slice(1);
}

function createSelectFromColumnInfo(columnInfo, properties) {
  return createListItem(columnInfo).append(createColumnDropdown(properties, columnInfo.path));
}

function validateColumnSelect(columnInfo) {
  return $('#' + makeIdFromPath(columnInfo.path)).val() ? null : columnInfo.label;
}

function validateColumnArray(array) {
  return array.map(validateColumnSelect).filter((c) => c).join(', ');
}

function makeIdFromPath(path) {
  return 'id-from-path-' + path.join('-');
}

function removeAndCreateUl(id) {
  id += '-attrs-ul-id';
  $('#' + id).remove();
  return $(document.createElement('ul')).prop('id', id);
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
    removeAndCreateUl('damage');
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

function createDropdown(
    assets, propertyPath, select = $(document.createElement('select'))) {
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
function onAssetSelect(propertyPath, expectedColumns, selectId) {
  handleAssetDataChange($('#' + selectId).val(), propertyPath);
  return verifyAsset(selectId, expectedColumns);
}

/**
 * Verifies an asset exists and has the expected columns.
 * @param {?Array<string>} expectedColumns Expected column names. If null, does
 *     no column checking
 * @return {Promise<?Array<string>>} returns a promise that resolves when
 *     existence and column checking are finished and select border color is
 *     updated, and contains the feature's properties if
 */
async function verifyAsset(selectId, expectedColumns) {
  // TODO: disable or discourage kick off until all green?
  const select = $('#' + selectId);
  const selectStatusChecker = new SameSelectChecker(select);
  const asset = selectStatusChecker.val();
  const assetMissingErrorFunction = (err) => {
    if (!selectStatusChecker.markDoneIfStillValid()) {
      // Don't show errors if not current asset.
      return;
    }
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
    return null;
  } else if (!expectedColumns || expectedColumns.length === 0) {
    updateColorAndHover(select, 'yellow', 'Checking...');
    // TODO: is there a better way to evaluate feature collection existence?
    let result;
    try {
      addPending();
      result = await convertEeObjectToPromise(
          ee.FeatureCollection(asset).first().propertyNames());
    } catch (err) {
      assetMissingErrorFunction(err);
      return null;
    } finally {
      pendingDone();
    }
    if (!selectStatusChecker.markDoneIfStillValid()) {
      // Don't do anything if not current asset.
      return null;
    }
    updateColorAndHover(
        select, 'green', expectedColumns ? 'No expected columns' : null);
    return result.sort();
  } else if (expectedColumns) {
    updateColorAndHover(select, 'yellow', 'Checking columns...');
    let columnsStatusFailure;
    try {
      columnsStatusFailure = await convertEeObjectToPromise(
          getColumnsStatus(asset, expectedColumns));
    } catch (err) {
      assetMissingErrorFunction(err);
      return null;
    }
    if (!selectStatusChecker.markDoneIfStillValid()) {
      // Don't do anything if not current asset.
      return null;
    }
    if (columnsStatusFailure) {
      updateColorAndHover(
          select, 'red',
          'Error! asset does not have all expected columns: ' +
              expectedColumns);
    } else {
      updateColorAndHover(
          select, 'green', 'Success! asset has all expected columns');
    }
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
  validateFunction();
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

function damageAssetPresent() {
  return !!$('#damage-asset-select').val();
}

const KICK_OFF_TEXT = 'Kick off Data Processing (will take a while!)';
const OPTIONAL_WARNING_PREFIX = '; warning: created asset will be missing ';

function showProcessButtonWithDamage(message, optionalMessage) {
  const damagePresent = damageAssetPresent();
  const hasDamage = damagePresent || getElementFromPath(scoreCoordinatesPath);
  if (!hasDamage) {
    message += (message ? '; and m' : 'M') +
        'ust specify either damage asset or map bounds';
  }
  if (message && optionalMessage) {
    message += OPTIONAL_WARNING_PREFIX + optionalMessage;
  }
  if (message) {
    showProcessButton(message);
  } else {
    $('#process-button')
    .show()
    .text(
        KICK_OFF_TEXT +
        (optionalMessage ? OPTIONAL_WARNING_PREFIX + optionalMessage : ''))
    .attr('disabled', false)
    .css(
        'background-color', optionalMessage ? 'rgb(150, 150, 0)' : '');
  }
}

function showProcessButton(message) {
  $('#process-button')
  .show()
  .text(message)
  .attr('disabled', true)
  .css('background-color', '');
}

function continueMessage(message, addition) {
  return message + (message ? '; ' + addition : capitalizeFirstLetter(addition));
}

function addPending() {
  ++pendingOperations;
}

function pendingDone() {
  return --pendingOperations === 0;
}

function allFinished() {
  return pendingOperations === 0;
}