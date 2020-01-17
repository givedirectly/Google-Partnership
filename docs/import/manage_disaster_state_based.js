import {getDisaster} from '../resources.js';

import {
  cdcGeoidKey,
  censusBlockGroupKey,
  censusGeoidKey,
  incomeKey, snapKey, sviKey,
  tigerGeoidKey, totalKey,
} from './state_based_key_names.js';
import {getStateAssetsFromEe} from './list_ee_assets.js';
import {checkDamageFieldsAndShowKickoffButton, createSelect, damageAssetPresent, disasterData, getIsCurrentDisasterChecker, getPageValueOfPath, onAssetSelect, setOptionsForSelect, verifyAsset} from './manage_disaster_base.js';

export {
  initializeStateBasedDisaster,
  initializeStateBasedScoreSelectors,
  setUpStateBasedOnPageLoad,
  validateStateBasedUserFields,
};
// For testing.
export {assetSelectionRowPrefix, stateBasedScoreAssetTypes};

const stateBasedScoreAssetTypes = Object.freeze([
  {
    propertyPath: ['stateBasedData', 'snapData', 'paths'],
    displayName: 'SNAP',
    expectedColumns: [censusGeoidKey, censusBlockGroupKey, snapKey, totalKey],
  },
  {
    propertyPath: ['stateBasedData', 'incomeAssetPaths'],
    displayName: 'Income',
    expectedColumns: [censusGeoidKey, incomeKey],
  },
  {
    propertyPath: ['stateBasedData', 'sviAssetPaths'],
    displayName: 'SVI',
    expectedColumns: [cdcGeoidKey, sviKey],
  },
  {
    propertyPath: ['stateBasedData', 'blockGroupAssetPaths'],
    displayName: 'Census TIGER Shapefiles',
    expectedColumns: [tigerGeoidKey],
    geometryExpected: true,
  },
  {
    propertyPath: ['stateBasedData', 'buildingAssetPaths'],
    displayName: 'Microsoft Building Shapefiles',
    expectedColumns: [],
    geometryExpected: true,
  },
]);

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

  for (const {propertyPath, displayName} of stateBasedScoreAssetTypes) {
    const missingForType = [];
    for (const state of states) {
      if (!getPageValueOfPath(propertyPath.concat([state]))) {
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
  checkDamageFieldsAndShowKickoffButton(message, optionalMessage);
}

const assetSelectionRowPrefix = 'asset-selection-row-';

/**
 * Initializes state-based score selector table based on {@link
 * stateBasedScoreAssetTypes} data. Done as soon as page is ready.
 */
function setUpStateBasedOnPageLoad() {
  const tbody = $('#asset-selection-table-body');
  for (const [i, {displayName}] of stateBasedScoreAssetTypes.entries()) {
    const row = $(document.createElement('tr'));
    row.append(createTd().text(displayName));
    row.prop('id', assetSelectionRowPrefix + i);
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
  // For each asset type, add assets to select for each state.
  for (const {
         propertyPath,
         expectedColumns,
         geometryExpected,
       } of stateBasedScoreAssetTypes) {
    for (const [i, state] of states.entries()) {
      // Disable FeatureCollections without geometries if desired. Be careful
      // not to modify stateAssets[i]!
      const assets = geometryExpected ?
          new Map(Array.from(
              stateAssets[i],
              ([k, v]) => [k, {disabled: v.disabled || !v.hasGeometry}])) :
          stateAssets[i];
      const statePropertyPath = propertyPath.concat([state]);
      setOptionsForSelect(assets, statePropertyPath);
      verifyAsset(statePropertyPath, expectedColumns);
    }
  }
}

/**
 * Initializes state-based disaster. Removes any prior state from score asset
 * table, and creates select elements for each asset type and state. Selects are
 * in the "pending" state to start, updated when asset listings complete.
 * @param {AssetData} assetData
 * @return {Promise<void>} Promise that completes when all data displayed.
 */
async function initializeStateBasedDisaster(assetData) {
  $('#state-based-disaster-asset-selection-table').show();
  $('#flexible-data').hide();
  const {states} = assetData.stateBasedData;

  // Clear out old data on disaster switch.
  const headerRow = $('#score-asset-header-row');
  // Initialize headers.
  removeAllButFirstFromRow(headerRow);
  for (const state of states) {
    headerRow.append(createTd().text(state + ' Assets'));
  }
  for (const [i, {propertyPath, expectedColumns}] of stateBasedScoreAssetTypes
           .entries()) {
    const row = $('#' + assetSelectionRowPrefix + i);
    removeAllButFirstFromRow(row);
    for (const state of states) {
      const statePropertyPath = propertyPath.concat([state]);
      const select =
          createSelect(statePropertyPath)
              .on('change',
                  () => onAssetSelect(statePropertyPath, expectedColumns))
              .addClass('with-status-border');
      row.append(createTd().append(select));
    }
  }

  const isCurrent = getIsCurrentDisasterChecker();
  // getStateAssetsFromEe does internal caching.
  const stateAssets = await Promise.all(states.map(getStateAssetsFromEe));
  if (isCurrent()) {
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
