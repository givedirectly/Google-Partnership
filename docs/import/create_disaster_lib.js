import {geoidTag} from '../property_names.js';

export {createDisasterData};
export {incomeKey, snapKey, sviKey, totalKey, BUILDING_COUNT_KEY};
// For testing
export {stateAssetDataTemplate, flexibleAssetData};

const snapKey = 'HD01_VD02';
const totalKey = 'HD01_VD01';
const sviKey = 'RPL_THEMES';
const incomeKey = 'HD01_VD01';
const BUILDING_COUNT_KEY = 'BUILDING COUNT';

const commonAssetDataTemplate = Object.freeze({
  damage_asset_path: null,
});

// Has all the basic fields needed for a state-based score asset to be created:
// SNAP, SVI, and income together with the columns of each, and optional damage
// asset path. The default values for column names here are taken from Census
// American FactFinder and CDC tables.
// TODO: should we allow users to change the columns here, on a per-disaster
//  level? Or only as a "global" default? Or just make them modify directly in
//  Firestore?
const stateAssetDataTemplate = Object.freeze({...commonAssetDataTemplate, ...{
  score_bounds_coordinates: null,
  block_group_asset_paths: {},
  snap_data: {
    paths: {},
    snap_key: snapKey,
    total_key: totalKey,
  },
  svi_asset_paths: {},
  svi_key: sviKey,
  income_asset_paths: {},
  income_key: incomeKey,
  building_asset_paths: {},
}});

const flexibleAssetData = Object.freeze({...commonAssetDataTemplate,
  ...{flexibleData: {}}});

/**
 * Creates disaster data for a disaster with the following states, or a flexible
 * disaster if `states` is null.
 * @param {?Array<string>} states array of states (abbreviations) or null if this is not a state-based disaster
 * @return {Object}
 */
function createDisasterData(states) {
  const result = {layers: []};
  if (states) {
    const assetData = deepCopy(stateAssetDataTemplate);
    assetData.states = states;
    result.asset_data = assetData;
  } else {
    result.asset_data = deepCopy(flexibleAssetData);
  }
  return result;
}

function deepCopy(object) {
  return JSON.parse(JSON.stringify(object));
}
