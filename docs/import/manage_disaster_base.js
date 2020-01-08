import {getDisaster} from '../resources.js';
import {latLngToGeoPoint, transformGeoPointArrayToLatLng} from '../map_util.js';
import {ScoreBoundsMap} from './score_bounds_map.js';
import {convertEeObjectToPromise} from '../ee_promise_cache.js';
import {updateDataInFirestore} from './update_firestore_disaster.js';

export {setUpScoreBoundsMap, initializeScoreBoundsMapFromAssetData, createAssetDropdownWithNone, onNonDamageAssetSelect,
SameDisasterChecker, disasterData, handleAssetDataChange, initializeDamageSelector, setProcessButtonText, damageAssetPresent, setValidateFunction, verifyAsset,
createDropdown};

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
  const scoreBoundsAsLatLng = scoreBoundsCoordinates ? transformGeoPointArrayToLatLng(scoreBoundsCoordinates) : null;
  scoreBoundsMap.initialize(scoreBoundsAsLatLng, states);
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
  handleAssetDataChange($('#selectId').val(), propertyPath);
  return verifyAsset(selectId, expectedColumns);
}

/**
 * Verifies an asset exists and has the expected columns.
 * @param {?Array<string>} expectedColumns Expected column names. If null, does
 *     no column checking
 * @return {Promise<?Array<string>>} returns a promise that resolves when existence and column
 *     checking are finished and select border color is updated, and contains
 *     the feature's properties if
 */
async function verifyAsset(selectId, expectedColumns) {
  // TODO: disable or discourage kick off until all green?
  const select = $('#' + selectId);
  const asset = select.val();
  const assetMissingErrorFunction = (err) => {
    if (select.val() !== asset) {
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
      result = await convertEeObjectToPromise(
          ee.FeatureCollection(asset).first().propertyNames());
    } catch (err) {
      assetMissingErrorFunction(err);
      return null;
    }
    if (select.val() !== asset) {
      // Don't do anything if not current asset.
      return null;
    }
    updateColorAndHover(select, 'green', expectedColumns ? 'No expected columns' : null);
    return result;
  } else if (expectedColumns) {
    updateColorAndHover(select, 'yellow', 'Checking columns...');
    let columnsStatusFailure;
    try {
      columnsStatusFailure = await convertEeObjectToPromise(getColumnsStatus(asset, expectedColumns));
    } catch (err) {
      assetMissingErrorFunction(err);
      return null;
    }
    if (select.val() !== asset) {
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

function setProcessButtonText(message, optionalMessage) {
  const hasDamage =
      damageAssetPresent || getElementFromPath(scoreCoordinatesPath);
  if (message) {
    message = 'Missing asset(s): ' + message;
  }
  if (!hasDamage) {
    message += (message ? ', and m' : 'M') +
        'ust specify either damage asset or map bounds';
  }
  if (message && optionalMessage) {
    message += OPTIONAL_WARNING_PREFIX + optionalMessage;
  }
  const processButton = $('#process-button');
  processButton.show();
  if (message) {
    processButton.text(message);
    processButton.attr('disabled', true);
    processButton.css('background-color', '');
  } else {
    processButton.text(
        KICK_OFF_TEXT +
        (optionalMessage ? OPTIONAL_WARNING_PREFIX + optionalMessage : ''));
    processButton.attr('disabled', false);
    processButton.css(
        'background-color', optionalMessage ? 'rgb(150, 150, 0)' : '');
  }
}

class SameStateChecker {
  constructor(valueSupplier) {
    this.valueSupplier = valueSupplier;
  }

  reset() {
    this.done = false;
    this.knownValue = this.valueSupplier();
  }

  shouldProceed() {
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
