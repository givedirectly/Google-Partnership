import {LayerType} from '../firebase_layers.js';
import {latLngToGeoPoint, transformGeoPointArrayToLatLng} from '../map_util.js';
import {getDisaster} from '../resources.js';
import {
  getAssetPropertyNames,
  getColumnsStatus,
  getDisasterAssetsFromEe,
} from './list_ee_assets.js';
import {createOptionFrom, stylePendingSelect} from './manage_common.js';
import {
  finishPending,
  startPending,
  validateFlexibleUserFields,
} from './manage_disaster_flexible.js';
import {validateStateBasedUserFields} from './manage_disaster_state_based.js';
import {ScoreBoundsMap} from './score_bounds_map.js';
import {updateDataInFirestore} from './update_firestore_disaster.js';

export {
  getAssetsAndSetOptionsForSelect,
  showListForAsset,
  createSelect,
  getInputElementFromPath,
  setOptionsForSelect,
  showSelectAsPending,
  isFlexible,
  capitalizeFirstLetter,
    continueMessage,
  createSelectListItemFromColumnInfo,
  DAMAGE_COLUMN_INFO,
  DAMAGE_VALUE_INFO,
  getPageValueOfPath,
  damageAssetPresent,
    initializeDamageSelector,
  disasterData,
  getStoredValueFromPath,
  handleAssetDataChange,
  initializeScoreBoundsMapFromAssetData,
    makeInputElementIdFromPath,
  onAssetSelect,
  createListForAsset,
  getIsCurrentDisasterChecker,
  noteNewDisaster,
  checkDamageFieldsAndShowProcessButton,
    showDisabledProcessButton,
  setUpScoreBoundsMap,
  validateColumnPathHasValue,
  verifyAsset,
  writeSelectAndGetPropertyNames,
};

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

class SameValueChecker {
  constructor(path) {
    this.path = path;
    this.isCurrent = getIsCurrentDisasterChecker();
    this.val = getPageValueOfPath(this.path);
  }

  stillValid() {
    return this.isCurrent() && this.val === getPageValueOfPath(this.path);
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

function initializeScoreBoundsMapFromAssetData(assetData, states = []) {
  const {scoreBoundsCoordinates} = assetData;
  const scoreBoundsAsLatLng = scoreBoundsCoordinates ?
      transformGeoPointArrayToLatLng(scoreBoundsCoordinates) :
      null;
  scoreBoundsMap.initialize(scoreBoundsAsLatLng, states);
}

const DAMAGE_PROPERTY_PATH = Object.freeze(['damageAssetPath']);

async function initializeDamageSelector() {
  startPending();
  const damageIntroSpan = $('#damage-intro-span');
  const damageDiv = $('#damage-asset-div').empty().append(damageIntroSpan);
  const damageSelect = createSelect(DAMAGE_PROPERTY_PATH)
  .on('change', () => displayDamageRelatedElements(
      writeSelectAndGetPropertyNames(DAMAGE_PROPERTY_PATH), damageSelect.val()));
  damageDiv.append(damageSelect);
  createDamageColumns();
  showHideDamageAndMapDivs(!!getStoredValueFromPath(DAMAGE_PROPERTY_PATH));
  if (!await getAssetsAndSetOptionsForSelect(DAMAGE_PROPERTY_PATH, false)) {
    return;
  }
  return displayDamageRelatedElements(verifyAsset(DAMAGE_PROPERTY_PATH, []),  damageSelect.val());
}

const DAMAGE_COLUMN_INFO = {
  label: 'column that can distinguish between damaged and undamaged buildings',
  explanation: 'optional unless using damage asset for building count',
  path: ['noDamageKey']
};

const DAMAGE_VALUE_INFO = {
  label: 'value in column that identifies undamaged buildings',
  path: ['noDamageValue']
};

async function displayDamageRelatedElements(propertyNamesPromise, val) {
  showDamageColumns(null);
  showHideDamageAndMapDivs(!!val);
  const propertyNames = await propertyNamesPromise;
  if (!propertyNames) {
    return;
  }
  showDamageColumns(propertyNames);
  finishPending();
}

function showHideDamageAndMapDivs(val) {
  showListForAsset(!!val, 'damage');
  setMapBoundsDiv(!!val);
}

function createDamageColumns() {
  // TODO(janakr): do an add_layer-style lookup of the columns of this asset,
  //  and provide a select with the available values if possible, and an input
  //  field if there are too many values (for instance, if damage is given by a
  //  percentage, with 0 meaning undamaged, there might be >25 values).
  const noDamageValueInput =
      $(document.createElement('input'))
          .prop('id', makeInputElementIdFromPath(DAMAGE_VALUE_INFO.path))
          .on('blur',
              () => handleAssetDataChange(
                  noDamageValueInput.val(), DAMAGE_VALUE_INFO.path));
  noDamageValueInput.val(getStoredValueFromPath(DAMAGE_VALUE_INFO.path));
  const valueSelect = createListItem(DAMAGE_VALUE_INFO)
      .append(noDamageValueInput);
  const columnSelectListItem = createSelectListItemFromColumnInfo(
      DAMAGE_COLUMN_INFO);
  const columnSelect = columnSelectListItem.children('select');
  columnSelect.on('change', () => {
    const val = columnSelect.val();
    showDamageColumnValue(val);
    handleAssetDataChange(val, DAMAGE_COLUMN_INFO.path);
  });
  $('#damage-asset-div')
      .append(
          createListForAsset('damage')
              .append(columnSelectListItem)
              .append(valueSelect));
  showDamageColumnValue(getStoredValueFromPath(DAMAGE_COLUMN_INFO.path));
}

/**
 * Sets options for damage-related column input ({@link DAMAGE_COLUMN_INFO}) and
 * shows/hides {@link DAMAGE_VALUE_INFO} if the column is set/unset.
 * @param {Array<EeColumn>} propertyNames
 */
function showDamageColumns(propertyNames) {
  const columnPath = DAMAGE_COLUMN_INFO.path;
  if (propertyNames) {
    const select = setOptionsForSelect(propertyNames, columnPath);
    showDamageColumnValue(!!select.val());
  } else {
    showSelectAsPending(columnPath);
    showDamageColumnValue(!!getStoredValueFromPath(columnPath))
  }
}

/**
 * Shows/hides the no-damage-value input associated to
 * {@link DAMAGE_VALUE_INFO}. Ordinarily, it should only be shown if there is a
 * no-damage column specified in the select associated to
 * {@link DAMAGE_COLUMN_INFO}, since otherwise it is meaningless and the user
 * doesn't have to set it. However, if a damage asset is specified,
 * @param show
 */
function showDamageColumnValue(show) {
  const noDamageValueItem = getInputElementFromPath(DAMAGE_VALUE_INFO.path).parent();
  if (show) {
    noDamageValueItem.show();
  } else {
    noDamageValueItem.hide();
  }
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
 * Gets assets for the current disaster from EarthEngine, then sets those
 * disasters as options for the select element given by `propertyPath`.
 * @param {PropertyPath} propertyPath
 * @param {boolean} enableAllFeatureCollections True to enable all Feature
 *     Collections, false to leave the defaults (geometry required).
 * @return {Promise<boolean>}
 */
async function getAssetsAndSetOptionsForSelect(propertyPath,
    enableAllFeatureCollections = true) {
  // Same promise as waited on for many assets. Since getDisasterAssetsFromEe
  // deduplicates, this is fine.
  const isCurrent = getIsCurrentDisasterChecker();
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  if (!isCurrent()) {
    return false;
  }
  let assets = disasterAssets;
  if (enableAllFeatureCollections) {
    assets = new Map();
    for ([key, attributes] of disasterAssets) {
      assets.set(key, {disabled: attributes.type !== LayerType.FEATURE_COLLECTION});
    }
  }
  setOptionsForSelect(assets, propertyPath);
  return true;
}

//                          Save-related functions.

/**
 * Called on changes to select-type inputs with no required columns, but
 * "cascading" effects: other inputs whose values depend on this asset's
 * columns. Notes the start of a pending operation via {@link startPending}. The
 * caller is responsible for ending the operation after the returned columns
 * have been processed.
 * @param {PropertyPath} path
 * @return {Promise<?Array<EeColumn>>} Returns result of {@link onAssetSelect},
 *     unless value of select has changed/disaster has changed, in which case
 *     returns null
 */
async function writeSelectAndGetPropertyNames(path) {
  const sameSelectChecker = new SameValueChecker(path);
  startPending();
  const propertyNames = await onAssetSelect(path, []);
  if (!propertyNames || !sameSelectChecker.stillValid()) {
    return null;
  }
  return propertyNames;
}

/**
 * Sets off a column verification check and data write.
 * @param {PropertyPath} propertyPath
 * @param {Array<EeColumn>} expectedColumns See {@link verifyAsset}
 * @return {Promise<Array<EeColumn>>} See {@link verifyAsset}
 */
function onAssetSelect(propertyPath, expectedColumns) {
  handleAssetDataChange(getPageValueOfPath(propertyPath), propertyPath);
  return verifyAsset(propertyPath, expectedColumns);
}

/**
 * Verifies an asset exists and has the expected columns.
 * @param {PropertyPath} propertyPath
 * @param {Array<EeColumn>} expectedColumns Expected column names. If empty,
 *     checks existence and returns all columns from the first feature
 * @return {Promise<?Array<EeColumn>>} Returns a promise that resolves when
 *     existence and column checking are finished and select border color is
 *     updated, and contains the first feature's properties if `expectedColumns`
 *     is empty
 */
async function verifyAsset(propertyPath, expectedColumns) {
  // TODO: disable or discourage kick off until all green?
  const select = $('#' + makeInputElementIdFromPath(propertyPath));
  const selectStatusChecker = new SameValueChecker(propertyPath);
  const asset = selectStatusChecker.val;
  const assetMissingErrorFunction = (err) => {
    if (!selectStatusChecker.stillValid()) {
      // Don't show errors if not current asset.
      return null;
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
    return [];
  } else if (!expectedColumns || expectedColumns.length === 0) {
    updateColorAndHover(select, 'yellow', 'Checking...');
    let result;
    try {
      // TODO: is there a better way to evaluate feature collection existence?
      result = await getAssetPropertyNames(asset);
    } catch (err) {
      assetMissingErrorFunction(err);
      return null;
    }
    if (!selectStatusChecker.stillValid()) {
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
      columnsStatusFailure = await getColumnsStatus(asset, expectedColumns);
    } catch (err) {
      assetMissingErrorFunction(err);
      return null;
    }
    if (!selectStatusChecker.stillValid()) {
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
 * Handles the user entering a value into score-related input
 * @param {?*} val Value of input. empty strings are treated like null (ugh)
 * @param {PropertyPath} propertyPath path to property inside asset data. We
 *     set this value by setting the parent's attribute to the target's value
 * @return {Promise<void>} Promise that completes when Firestore writes are done
 */
function handleAssetDataChange(val, propertyPath) {
  // We want to change the value, which means we have to write an expression
  // like "parent[prop] = val". To obtain the parent object, we just follow the
  // same path as the child's, but stop one property short. That last property
  // is then the "prop" in the expression above.
  const parentProperty = getStoredValueFromPath(propertyPath.slice(0, -1));
  parentProperty[propertyPath[propertyPath.length - 1]] =
      val !== '' ? val : null;
  if (isFlexible()) {
    // This will short-circuit if there are any pending checks, which will be
    // the case for EE asset changes. Column value changes won't have pending
    // operations, though, since they don't cascade, so this will actually work.
    validateFlexibleUserFields();
  } else {
    // State-based disasters have no delays in validation, will always do work.
    validateStateBasedUserFields();
  }
  return updateDataInFirestore(() => disasterData.get(getDisaster()));
}

//                      Validation-related functions.


const KICK_OFF_TEXT = 'Kick off Data Processing (will take a while!)';
const OPTIONAL_WARNING_PREFIX = '; warning: created asset will be missing ';

/**
 * Displays kick-off button. Button will be disabled if `message` has content,
 * otherwise will be enabled, possibly with a warning from `optionalMessage`.
 *
 * Also checks damage asset requirements. If they are not met, will append to
 * `message` and button will therefore be disabled.
 * @param {string} message Error message
 * @param {string} optionalMessage Warning message about missing but optional
 *     attributes
 */
function checkDamageFieldsAndShowProcessButton(message, optionalMessage) {
  if (!damageAssetPresent() || getStoredValueFromPath(scoreCoordinatesPath)) {
    message += continueMessage(message, 'must specify either damage asset or map bounds');
  }
  if (message && optionalMessage) {
    message += OPTIONAL_WARNING_PREFIX + optionalMessage;
  }
  if (message) {
    showDisabledProcessButton(message);
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

/**
 * Disables kick-off button, puts `message` on it, and shows it.
 * @param {string} message Error message to show on button
 */
function showDisabledProcessButton(message) {
  $('#process-button')
  .show()
  .text(message)
  .attr('disabled', true)
  .css('background-color', '');
}

/**
 * Appends `addition` to `message`, separated by a semicolon, capitalizing
 * `addition` if `message` was empty.
 * @param {string} message
 * @param {string} addition
 * @return {string} Resulting message
 */
function continueMessage(message, addition) {
  return message + (message ? '; ' + addition : capitalizeFirstLetter(addition));
}

/**
 * Checks that `columnInfo.path` has a value on the page.
 * @param {ColumnInfo} columnInfo
 * @return {?string} null if there was a value, and `columnInfo.label` if not,
 *     for use in constructing an error message.
 */
function validateColumnPathHasValue(columnInfo) {
  return getPageValueOfPath(columnInfo.path) ? null : columnInfo.label;
}

/** @return {boolean} True if user has a damage asset specified on page */
function damageAssetPresent() {
  return !!getPageValueOfPath(DAMAGE_PROPERTY_PATH);
}

/** @return {boolean} True/false for flexible/state-based current disaster */
function isFlexible() {
  return !!disasterData.get(getDisaster()).assetData.flexibleData;
}

//                    Detecting if disaster has changed.


/**
 * Tracks how many times the disaster has been changed.
 * @type {number}
 */
let disasterGeneration = 0;

/**
 * Returns a function that will return true if the disaster has not changed
 * since `getIsCurrentDisasterChecker` was called, and false otherwise.
 * @return {function(): boolean}
 */
function getIsCurrentDisasterChecker() {
  const current = disasterGeneration;
  return () => current === disasterGeneration;
}

/**
 * Notes that the disaster has been changed. All functions returned by previous
 * calls to {@link getIsCurrentDisasterChecker} will now return false.
 */
function noteNewDisaster() {
  disasterGeneration++;
}

//              Simpler HTML/local data-related functions.

/**
 * Shows select given by `path` as pending on page: disables. For use when
 * values are not known. Does not trigger change handler.
 * @param {PropertyPath} path
 */
function showSelectAsPending(path) {
  stylePendingSelect(getInputElementFromPath(path));
}

/**
 * Appends a (pending) select to result of {@link createListItem}.
 * @param {ColumnInfo} columnInfo
 * @return {JQuery<HTMLLIElement>} List item will have label and select
 */
function createSelectListItemFromColumnInfo(columnInfo) {
  return createListItem(columnInfo).append(createSelect(columnInfo.path));
}

/**
 * Creates an `li` element with {@link createLabel} for `columnInfo`.
 * @param {ColumnInfo} columnInfo
 * @return {JQuery<HTMLLIElement>}
 */
function createListItem(columnInfo) {
  return $(document.createElement('li')).append(createLabel(columnInfo) + ': ');
}

/**
 * Creates text for `columnInfo`: Label followed by optional (explanation).
 * @param {ColumnInfo} columnInfo
 * @return {string} Capitalized `label` with `explanation` in parens if present
 */
function createLabel(columnInfo) {
  return capitalizeFirstLetter(columnInfo.label) +
      (columnInfo.explanation ? ' (' + columnInfo.explanation + ')' : '');
}

/**
 * Sets the select specified by `propertyPath` to have the given `options`, and
 * selects an option if there is one equal to the current stored value. Does not
 * trigger the select element's change handler.
 * @param {Array<string>|Map<string, {disabled: boolean}>} options If a map,
 *     disables an option if its `disabled` attribute is true.
 * @param {PropertyPath} propertyPath
 * @return {JQuery<HTMLSelectElement>}
 */
function setOptionsForSelect(options, propertyPath) {
  const select = getInputElementFromPath(propertyPath).empty().attr('disabled', false)
  .removeClass('just-created-select')
  .append(createOptionFrom('None').val(''));
  const value = getStoredValueFromPath(propertyPath);
  // Add assets to selector and return it.
  for (let option of options) {
    let disabled = false;
    if (Array.isArray(option)) {
      disabled = option[1].disabled;
      option = option[0];
    }
    const selectOption =
        createOptionFrom(option);
    if (disabled) {
      selectOption.attr('disabled', true);
    }
    if (option === value) {
      selectOption.attr('selected', true);
    }
    select.append(selectOption);
  }
  return select;
}

/**
 * Creates a select input associated to `propertyPath`. Starts out in a pending
 * disabled state. Call {@link setOptionsForSelect} to set its options.
 * @param {PropertyPath} propertyPath
 * @return {JQuery<HTMLSelectElement>}
 */
function createSelect(propertyPath) {
  return $(document.createElement('select')).prop('id', makeInputElementIdFromPath(propertyPath))
  .empty()
  .attr('disabled', true)
  .addClass('just-created-select')
  .append(createOptionFrom('pending...'));
}

/**
 * Creates an unnumbered list of properties associated to `idStem`.
 * @param {string} idStem List identifier, see {@link getListForAssetId}
 * @return {JQuery<HTMLUListElement>}
 */
function createListForAsset(idStem) {
  return $(document.createElement('ul')).prop('id', getListForAssetId(idStem));
}

/**
 * Shows/hides the list of properties associated to `idStem`.
 * @param {boolean} show Whether to show (true) or hide (false) the list
 * @param {string} idStem List identifier, see {@link getListForAssetId}
 */
function showListForAsset(show, idStem) {
  const list = $('#' + getListForAssetId(idStem));
  if (show) {
    list.show();
  } else {
    list.hide();
  }
}

/**
 * Creates a unique id for `idStem` to identify the list of properties
 * associated to an asset associated with `idStem`.
 * @param {string} idStem A short identifier like 'geography' or 'damage'
 * @return {string}
 */
function getListForAssetId(idStem) {
  return idStem + '-attrs-ul-id';
}

/**
 * A "path" to a Firestore item inside the `assetData` field. For instance,
 * `['damageAssetPath']` would point to the field
 * `docData.assetData.damageAssetPath`, where `docData` is the document for a
 * disaster.
 * @typedef {Array<string>|ReadonlyArray<string>} PropertyPath
 */

/**
 * Retrieves the object inside the current disaster's assetData, given by the
 * "path" of {@code propertyPath}
 * @param {PropertyPath} propertyPath List of attributes to follow
 * @return {*}
 */
function getStoredValueFromPath(propertyPath) {
  let element = disasterData.get(getDisaster()).assetData;
  for (const property of propertyPath) {
    element = element[property];
  }
  return element;
}


/**
 * Gets the value of the input element corresponding to `path`. See
 * {@link getInputElementFromPath}.
 * @param {PropertyPath} path
 * @return {string}
 */
function getPageValueOfPath(path) {
  return getInputElementFromPath(path).val();
}

/**
 * Gets the input element corresponding to `path`. The value of the Firestore
 * value for `path` and the returned input element will always be in sync,
 * unless the input is a select and:
 * 1. The Firestore value is not one of the available options;
 * 2. The available options are not yet known.
 * @param {PropertyPath} path
 * @return {JQuery<HTMLInputElement>}
 */
function getInputElementFromPath(path) {
  return $('#' + makeInputElementIdFromPath(path));
}

/**
 * Creates a unique id for `path`, that can be used to go from Firestore data to
 * a page element.
 * @param {PropertyPath} path
 * @returns {string}
 */
function makeInputElementIdFromPath(path) {
  return 'id-from-path-' + path.join('-');
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
 * Capitalizes first letter of `str`.
 * @param {string} str
 * @returns {string}
 */
function capitalizeFirstLetter(str) {
  return str[0].toUpperCase() + str.slice(1);
}

