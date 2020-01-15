import {colorToRgbString, LayerType} from '../firebase_layers.js';
import {latLngToGeoPoint, transformGeoPointArrayToLatLng} from '../map_util.js';
import {isUserProperty} from '../property_names.js';
import {getDisaster} from '../resources.js';

import {getAssetPropertyNames, getColumnsStatus, getDisasterAssetsFromEe} from './list_ee_assets.js';
import {createOptionFrom, stylePendingSelect} from './manage_common.js';
import {PendingChecker, useDamageForBuildings, validateFlexibleUserFields} from './manage_disaster_flexible.js';
import {validateStateBasedUserFields} from './manage_disaster_state_based.js';
import {ScoreBoundsMap} from './score_bounds_map.js';
import {updateDataInFirestore} from './update_firestore_disaster.js';

export {
  capitalizeFirstLetter,
  checkDamageFieldsAndShowKickoffButton,
  continueMessage,
  createListForAsset,
  createSelect,
  createSelectListItemFromColumnInfo,
  createSelectWithSimpleWriteOnChange,
  damageAssetPresent,
  disasterData,
  getAssetsAndSetOptionsForSelect,
  getInputElementFromPath,
  getIsCurrentDisasterChecker,
  getPageValueOfPath,
  getStoredValueFromPath,
  handleAssetDataChange,
  initializeDamage,
  isFlexible,
  makeInputElementIdFromPath,
  maybeShowNoDamageValueItem,
  NODAMAGE_COLUMN_INFO,
  NODAMAGE_VALUE_INFO,
  noteNewDisaster,
  onAssetSelect,
  setExplanationSpanTextForColumn,
  setOptionsForSelect,
  setUpScoreBoundsMap,
  showDisabledKickoffButton,
  showListForAsset,
  showPendingKickoffButton,
  showSelectAsPending,
  validateColumnPathHasValue,
  verifyAsset,
  writeAssetDataLocally,
  writeSelectAndGetPropertyNames,
};
// For testing.
export {DAMAGE_PROPERTY_PATH, scoreBoundsMap};

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

//                       Damage-related functions

const SCORE_COORDINATES_PATH = Object.freeze(['scoreBoundsCoordinates']);
const DAMAGE_PROPERTY_PATH = Object.freeze(['damageAssetPath']);

const damageAssetChecker = new PendingChecker();

/**
 * Does all initialization for damage asset and related fields. Creates damage
 * select, no-damage column and value, puts everything in a pending state but
 * with initial visibility based on Firestore values, and when all data ready,
 * finishes display.
 * @param {AssetData} assetData
 * @return {Promise<void>}
 */
async function initializeDamage(assetData) {
  damageAssetChecker.maybeStartPending();
  if (isFlexible()) {
    initializeScoreBoundsMapFromAssetData(assetData);
  } else {
    initializeScoreBoundsMapFromAssetData(
        assetData, assetData.stateBasedData.states);
  }
  const damageIntroSpan = $('#damage-intro-span');
  const damageDiv = $('#damage-asset-div').empty().append(damageIntroSpan);
  const damageSelect =
      createSelect(DAMAGE_PROPERTY_PATH)
          .on('change',
              () => displayDamageRelatedElements(
                  writeSelectAndGetPropertyNames(DAMAGE_PROPERTY_PATH),
                  damageSelect.val()));
  damageDiv.append(damageSelect);
  createNoDamageColumnAndValueList();
  showHideDamageAndMapDivs(!!getStoredValueFromPath(DAMAGE_PROPERTY_PATH));
  if (!await getAssetsAndSetOptionsForSelect(DAMAGE_PROPERTY_PATH, false)) {
    return;
  }
  damageAssetChecker.finishPending();
  return displayDamageRelatedElements(
      verifyAsset(DAMAGE_PROPERTY_PATH, []), damageSelect.val());
}

/** @type {ColumnInfo} */
const NODAMAGE_COLUMN_INFO = {
  label: 'column that can distinguish between damaged and undamaged buildings',
  // Actual text on page modified when flexible using setExplanationSpanText.
  explanation:
      'optional: if omitted, all buildings in damage asset are considered ' +
      'damaged',
  path: ['noDamageKey'],
};

/** @type {ColumnInfo} */
const NODAMAGE_VALUE_INFO = {
  label: 'value in column that identifies undamaged buildings',
  // Actual text on page modified when flexible using setExplanationSpanText.
  explanation: 'required if column is set',
  path: ['noDamageValue'],
};

/**
 * Displays all damage-related elements based on current value of damage asset
 * select. Invoked both during initialization and on damage asset change. Will
 * put no-damage column into a "pending" state until columns available.
 * @param {Promise<?Array<EeColumn>>} propertyNamesPromise Promise that will
 *     contain columns of damage asset. Created via {@link verifyAsset} or
 *     {@link writeSelectAndGetPropertyNames}
 * @param {?EeFC} damageAsset Value of damage asset, from page
 * @return {Promise<void>}
 */
async function displayDamageRelatedElements(propertyNamesPromise, damageAsset) {
  setNoDamageColumnAndValue(null);
  showHideDamageAndMapDivs(!!damageAsset);
  const propertyNames = await propertyNamesPromise;
  if (propertyNames) {
    setNoDamageColumnAndValue(propertyNames);
  }
}

/**
 * Creates list associated to the damage asset, with the no-damage column select
 * and no-damage value input. The list is only shown if there is a damage asset,
 * since the user can kick off score asset creation without specifying damage;
 * and the no-damage value input is only shown if there is a no-damage column
 * selection, since the user can legitimately omit the no-damage column. See
 * {@link maybeShowNoDamageValueItem} for the exception to this in the flexible
 * disaster case.
 */
function createNoDamageColumnAndValueList() {
  // TODO(janakr): do an add_layer-style lookup of the columns of this asset,
  //  and provide a select with the available values if possible, and an input
  //  field if there are too many values (for instance, if damage is given by a
  //  percentage, with 0 meaning undamaged, there might be >25 values).
  const noDamageValuPath = NODAMAGE_VALUE_INFO.path;
  const noDamageValueInput =
      $(document.createElement('input'))
          .prop('id', makeInputElementIdFromPath(noDamageValuPath))
          .on('blur',
              () => handleAssetDataChange(
                  noDamageValueInput.val(), noDamageValuPath));
  noDamageValueInput.val(getStoredValueFromPath(noDamageValuPath));
  const valueSelect =
      createListItem(NODAMAGE_VALUE_INFO).append(noDamageValueInput);
  const columnSelectListItem =
      createSelectListItemFromColumnInfo(NODAMAGE_COLUMN_INFO);
  // Firestore writes will happen with the default change handler, this new one
  // will run as well.
  columnSelectListItem.children('select').on(
      'change', maybeShowNoDamageValueItem);
  $('#damage-asset-div')
      .append(createListForAsset('damage')
                  .append(columnSelectListItem)
                  .append(valueSelect));
  maybeShowNoDamageValueItem();
}

const damageColumnChecker = new PendingChecker();

/**
 * Sets options for damage-related column input ({@link NODAMAGE_COLUMN_INFO})
 * and shows/hides {@link NODAMAGE_VALUE_INFO} if the column is set/unset.
 * @param {?Array<EeColumn>} propertyNames If null, show "pending" selects if
 * not already pending.
 */
function setNoDamageColumnAndValue(propertyNames) {
  const columnPath = NODAMAGE_COLUMN_INFO.path;
  if (propertyNames) {
    setOptionsForSelect(propertyNames, columnPath);
    maybeShowNoDamageValueItem();
    damageColumnChecker.finishPending();
  } else if (damageColumnChecker.maybeStartPending()) {
    showSelectAsPending(columnPath);
    maybeShowNoDamageValueItem();
  }
}

/**
 * Shows/hides the no-damage-value input associated to
 * {@link NODAMAGE_VALUE_INFO}. Ordinarily, it should only be shown if there is
 * a no-damage column specified in the select associated to
 * {@link NODAMAGE_COLUMN_INFO}, since otherwise it is meaningless and the user
 * doesn't have to set it. However, if a damage asset is specified and this is a
 * flexible disaster with damage used for buildings, then the user must specify
 * the column and value, so we show it to give the user more information about
 * what they'll have to fill in.
 */
function maybeShowNoDamageValueItem() {
  const noDamageValueItem =
      getInputElementFromPath(NODAMAGE_VALUE_INFO.path).parent();
  if (useDamageForBuildings()) {
    noDamageValueItem.show();
    return;
  }
  const noDamageColumnSelect =
      getInputElementFromPath(NODAMAGE_COLUMN_INFO.path);
  const show =
      (!noDamageColumnSelect.length || noDamageColumnSelect.is(':disabled')) ?
      getStoredValueFromPath(NODAMAGE_COLUMN_INFO.path) :
      noDamageColumnSelect.val();
  if (show) {
    noDamageValueItem.show();
  } else {
    noDamageValueItem.hide();
  }
}

/**
 * If damage asset present, shows no-damage list, and hides score-bounds map.
 * Does the opposite if no damage asset.
 * @param {boolean} damageAssetPresent
 */
function showHideDamageAndMapDivs(damageAssetPresent) {
  showListForAsset(!!damageAssetPresent, 'damage');
  setMapBoundsDiv(!!damageAssetPresent);
}

//                    Score-bounds-map-related functions.

/**
 * Does initialization for score-bounds map.
 * @param {AssetData} assetData
 * @param {?Array<string>} states See {@link ScoreBoundsMap.initialize}
 */
function initializeScoreBoundsMapFromAssetData(assetData, states = null) {
  const {scoreBoundsCoordinates} = assetData;
  const scoreBoundsAsLatLng = scoreBoundsCoordinates ?
      transformGeoPointArrayToLatLng(scoreBoundsCoordinates) :
      null;
  scoreBoundsMap.initialize(scoreBoundsAsLatLng, states);
}

/** @param {HTMLDivElement} div Div to attach score bounds map to */
function setUpScoreBoundsMap(div) {
  scoreBoundsMap = new ScoreBoundsMap(
      div,
      (polygonPath) => handleAssetDataChange(
          polygonPath ? polygonPath.map(latLngToGeoPoint) : null,
          SCORE_COORDINATES_PATH));
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

//                Page element creation/setting functions.

/**
 * Gets assets for the current disaster from EarthEngine, then sets those
 * disasters as options for the select element given by `propertyPath`.
 * @param {PropertyPath} propertyPath
 * @param {boolean} allowFeatureCollectionsWithoutGeometries True to enable all
 *     Feature Collections, false to leave the defaults (geometry required).
 * @return {Promise<boolean>} True if successful, false if disaster changed
 *     while waiting for asset listing, in which case caller should abort
 */
async function getAssetsAndSetOptionsForSelect(
    propertyPath, allowFeatureCollectionsWithoutGeometries = true) {
  // The first time this function is called, we'll wait on
  // getDisasterAssetsFromEe. Every subsequent call will not wait, since
  // getDisasterAssetsFromEe caches the result.
  const isCurrent = getIsCurrentDisasterChecker();
  const disasterAssets = await getDisasterAssetsFromEe(getDisaster());
  if (!isCurrent()) {
    return false;
  }
  let assets = disasterAssets;
  if (allowFeatureCollectionsWithoutGeometries) {
    assets = new Map();
    for (const [key, attributes] of disasterAssets) {
      assets.set(
          key, {disabled: attributes.type !== LayerType.FEATURE_COLLECTION});
    }
  }
  setOptionsForSelect(assets, propertyPath);
  return true;
}

/**
 * Creates a select element that triggers a simple write to Firestore on change.
 * If additional actions are desired, additional change handlers can be added.
 * @param {PropertyPath} propertyPath Path associated to element for writes
 * @return {JQuery<HTMLSelectElement>}
 */
function createSelectWithSimpleWriteOnChange(propertyPath) {
  const select =
      createSelect(propertyPath)
          .on('change',
              () => handleAssetDataChange(select.val(), propertyPath));
  return select;
}

//                          Save-related functions.

/**
 * Handles a change to a select element with no required columns, but with
 * "cascading" effects, meaning that there are other inputs whose values depend
 * on this asset's columns. See the file-level comment of
 * manage_disaster_flexible.js for an explanation of cascading.
 * @param {PropertyPath} path
 * @return {Promise<?Array<EeColumn>>} Returns result of {@link onAssetSelect},
 *     filtering out "system" columns, unless value of select has
 *     changed/disaster has changed, in which case returns null
 */
async function writeSelectAndGetPropertyNames(path) {
  const propertyNames = await onAssetSelect(path, null);
  return propertyNames ? propertyNames.filter(isUserProperty) : null;
}

/**
 * Sets off a column verification check and data write.
 * @param {PropertyPath} propertyPath
 * @param {?Array<EeColumn>} expectedColumns See {@link verifyAsset}
 * @return {?Promise<Array<EeColumn>>} See {@link verifyAsset}
 */
function onAssetSelect(propertyPath, expectedColumns) {
  handleAssetDataChange(getPageValueOfPath(propertyPath), propertyPath);
  return verifyAsset(propertyPath, expectedColumns);
}

/**
 * Verifies an asset specified in a select element exists and has the expected
 * columns, if any. If we do asynchronous work to fetch the columns, then if the
 * select's value has changed in the interim, don't perform any actions. This
 * assumes that if the disaster changes but the select's value does not change,
 * any follow-on work by the caller of `verifyAsset` is still valid. That work
 * should definitely be idempotent (have the same effect if done multiple times)
 * since the user might switch to this select repeatedly before results are
 * ready.
 *
 * For disaster-specific assets, idempotence is enough, since the select cannot
 * have the same value when the disaster changes. For state-specific assets, it
 * is currently true that any computation on a state asset valid for one
 * disaster is valid for any other, so the disaster changing is ok.
 * @param {PropertyPath} propertyPath
 * @param {?Array<EeColumn>} expectedColumns Expected column names. If empty or
 *     null, checks existence and returns all columns from the first feature
 * @return {Promise<?Array<EeColumn>>} Returns a promise that resolves when
 *     existence and column checking are finished and select border color is
 *     updated, and contains the first feature's properties if `expectedColumns`
 *     is empty. Null if select's value changed during asynchronous work
 */
async function verifyAsset(propertyPath, expectedColumns) {
  // TODO: disable or discourage kick off until all green?
  const select = $('#' + makeInputElementIdFromPath(propertyPath));
  const asset = select.val();
  const isCurrent = getIsCurrentDisasterChecker();
  /** @return {boolean} If disaster/select's value changed, so should abort. */
  function contextChanged() {
    return (!isCurrent() || asset !== select.val());
  }
  const assetMissingErrorFunction = (err) => {
    if (contextChanged()) {
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
    if (contextChanged()) {
      return null;
    }
    updateColorAndHover(
        select, 'green', expectedColumns ? 'No expected columns' : '');
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
    if (contextChanged()) {
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
 * Writes to local copy of data. Does not write to Firestore, so only use if
 * about to do another write!
 * @param {?*} val Value of input. empty strings are treated like null (ugh)
 * @param {PropertyPath} propertyPath path to property inside asset data. We
 *     set this value by setting the parent's attribute to the target's value
 */
function writeAssetDataLocally(val, propertyPath) {
  // We want to change the value, which means we have to write an expression
  // like "parent[prop] = val". To obtain the parent object, we just follow the
  // same path as the child's, but stop one property short. That last property
  // is then the "prop" in the expression above.
  const parentProperty = getStoredValueFromPath(propertyPath.slice(0, -1));
  parentProperty[propertyPath[propertyPath.length - 1]] =
      val !== '' ? val : null;
}

/**
 * Handles the user entering a value into score-related input
 * @param {?*} val Value of input. empty strings are treated like null (ugh)
 * @param {PropertyPath} propertyPath path to property inside asset data. We
 *     set this value by setting the parent's attribute to the target's value
 * @return {Promise<void>} Promise that completes when Firestore writes are done
 */
function handleAssetDataChange(val, propertyPath) {
  writeAssetDataLocally(val, propertyPath);
  if (isFlexible()) {
    // This will immediately display 'Pending...' and exit if there are any
    // pending checks, which will be the case for EE asset changes. Column value
    // changes won't have pending operations, though, since they don't cascade,
    // so this will actually work.
    validateFlexibleUserFields();
  } else {
    // State-based disasters have no delays in validation, will always do work.
    validateStateBasedUserFields();
  }
  return updateDataInFirestore(() => disasterData.get(getDisaster()));
}

//                      Validation-related functions.


const KICK_OFF_TEXT = 'Kick off score asset creation (will take a while!)';
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
function checkDamageFieldsAndShowKickoffButton(message, optionalMessage) {
  if (!damageAssetPresent() &&
      !getStoredValueFromPath(SCORE_COORDINATES_PATH)) {
    message = continueMessage(
        message, 'must specify either damage asset or map bounds');
  }
  if (!getPageValueOfPath(NODAMAGE_VALUE_INFO.path) &&
      getPageValueOfPath(NODAMAGE_COLUMN_INFO.path)) {
    message = continueMessage(
        message, 'Must specify no-damage value if no-damage column is set');
  }

  if (message && optionalMessage) {
    message += OPTIONAL_WARNING_PREFIX + optionalMessage;
  }
  if (message) {
    showDisabledKickoffButton(message);
  } else {
    $('#kickoff-button')
        .show()
        .text(
            KICK_OFF_TEXT +
            (optionalMessage ? OPTIONAL_WARNING_PREFIX + optionalMessage : ''))
        .attr('disabled', false)
        .css('background-color', optionalMessage ? 'rgb(150, 150, 0)' : '');
  }
}

/** Disables button, shows 'Pending...': use when validation waiting on EE. */
function showPendingKickoffButton() {
  showDisabledKickoffButton('Pending...');
}

/**
 * Disables kick-off button, puts `message` on it, and shows it.
 * @param {string} message Error message to show on button
 */
function showDisabledKickoffButton(message) {
  $('#kickoff-button')
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
  return message +
      (message ? '; ' + addition : capitalizeFirstLetter(addition));
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
  return createListItem(columnInfo)
      .append(createSelectWithSimpleWriteOnChange(columnInfo.path));
}

/**
 * Creates an `li` for `columnInfo`: Span with "Label (optional explanation): ".
 * Explanation has span with id for later modification.
 * @param {ColumnInfo} columnInfo
 * @return {JQuery<HTMLLIElement>}
 */
function createListItem(columnInfo) {
  const labelSpan = $(document.createElement('span'));
  labelSpan.append(capitalizeFirstLetter(columnInfo.label))
      .append(setExplanationTextForSpan(
          $(document.createElement('span'))
              .prop('id', makeIdForExplanationSpan(columnInfo)),
          columnInfo))
      .append(': ');
  return $(document.createElement('li')).append(labelSpan);
}

/**
 * Sets text of explanation span given by `columnInfo`. Useful for context-
 * sensitive explanation text (mandatory/optional depending on settings).
 * @param {ColumnInfo} columnInfo If `text` is omitted, span's text will be set
 *     to `columnInfo.explanation` instead
 * @param {?string} text
 */
function setExplanationSpanTextForColumn(
    columnInfo, text = columnInfo.explanation) {
  setExplanationTextForSpan(
      $('#' + makeIdForExplanationSpan(columnInfo)), columnInfo, text);
}

/**
 * Sets text of explanation span.
 * @param {JQuery<HTMLSpanElement>} explanationSpan
 * @param {ColumnInfo} columnInfo If `text` is omitted, span's text will be set
 *     to `columnInfo.explanation` instead
 * @param {?string} text
 * @return {JQuery<HTMLSpanElement>} `explanationSpan`, for chaining
 */
function setExplanationTextForSpan(
    explanationSpan, columnInfo, text = columnInfo.explanation) {
  explanationSpan.empty();
  if (text) {
    explanationSpan.text(' (' + text + ')');
  }
  return explanationSpan;
}

/**
 * Computes document id for explanation span corresponding to `columnInfo`.
 * @param {ColumnInfo} columnInfo
 * @return {string}
 */
function makeIdForExplanationSpan(columnInfo) {
  return 'explanation-span-' + makeInputElementIdFromPath(columnInfo.path);
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
  const select = getInputElementFromPath(propertyPath)
                     .empty()
                     .attr('disabled', false)
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
    const selectOption = createOptionFrom(option);
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
  return stylePendingSelect(
      $(document.createElement('select'))
          .prop('id', makeInputElementIdFromPath(propertyPath))
          .addClass('just-created-select'));
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
 * 2. Or the available options are not yet known.
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
 * @return {string}
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
  select.css('border-color', colorToRgbString(color)).prop('title', title);
}

/**
 * Capitalizes first letter of `str`.
 * @param {string} str
 * @return {string}
 */
function capitalizeFirstLetter(str) {
  return str[0].toUpperCase() + str.slice(1);
}
