import {getDisaster} from '../resources.js';

import {incomeKey, snapKey, sviKey, totalKey} from './create_disaster_lib.js';
import {cdcGeoidKey, censusBlockGroupKey, censusGeoidKey, tigerGeoidKey} from './import_data_keys.js';
import {createPendingSelect, getStateAssetsFromEe} from './list_ee_assets.js';
import {createAssetDropdownWithNone, damageAssetPresent, disasterData, initializeScoreBoundsMapFromAssetData, onNonDamageAssetSelect, SameDisasterChecker, setProcessButtonText, verifyAsset,} from './manage_disaster_base.js';

export {
  initializeStateBasedScoreSelectors,
  onSetStateBasedDisaster,
  setUpStateBasedScoreSelectorTable,
  validateStateBasedUserFields
};
// For testing.
export {assetSelectionPrefix, stateBasedScoreAssetTypes};

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

const assetSelectionPrefix = 'asset-selection-row-';

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
function validateStateBasedUserFields() {
  const {states} = disasterData.get(getDisaster()).assetData.stateBasedData;
  /**
   * Holds missing assets, as arrays. Each array has the display name of the
   * asset type, and, if this is a multistate disaster, a string indicating
   * which states are missing for this type.
   */
  const missingItems = [];
  const multistate = states.length > 1;

  for (const {idStem, displayName} of stateBasedScoreAssetTypes) {
    const missingForType = [];
    for (const state of states) {
      if (!$('#select-' + assetSelectionPrefix + idStem + '-' + state).val()) {
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
  let message = '';
  let optionalMessage = '';
  if (missingItems.length) {
    for (const missingItem of missingItems) {
      const isBuildings = missingItem[0] === 'Microsoft Building Shapefiles';
      // Buildings is optional if damage asset not present, mandatory otherwise.
      const buildingsOptional = isBuildings && !damageAssetPresent();
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
  setProcessButtonText(message, optionalMessage);
}

/**
 * Initializes state-based score selector table based on {@link
 * stateBasedScoreAssetTypes} data. Done as soon as page is ready.
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
      const select = createAssetDropdownWithNone(assets, statePropertyPath)
                         .prop('id', selectId)
                         .on('change',
                             () => onNonDamageAssetSelect(
                                 statePropertyPath, expectedColumns, selectId))
                         .addClass('with-status-border');
      row.append(createTd().append(select));
      verifyAsset(selectId, expectedColumns);
    }
  }
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
const sameDisasterChecker = new SameDisasterChecker();

async function onSetStateBasedDisaster(assetData) {
  sameDisasterChecker.reset();
  $('#state-based-disaster-asset-selection-table').show();
  $('#flexible-data').hide();
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
    for (const state of states) {
      row.append(createTd().append(createPendingSelect()));
    }
  }

  // getStateAssetsFromEe does internal caching.
  const stateAssets = await Promise.all(states.map(getStateAssetsFromEe));
  if (sameDisasterChecker.markDoneIfStillValid()) {
    initializeStateBasedScoreSelectors(states, stateAssets);
  }
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
