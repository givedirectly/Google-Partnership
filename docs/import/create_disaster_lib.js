export {createDisasterData};
export {BUILDING_COUNT_KEY, incomeKey, snapKey, sviKey, totalKey};
// For testing
export {flexibleAssetData, stateAssetDataTemplate};

const snapKey = 'HD01_VD02';
const totalKey = 'HD01_VD01';
const sviKey = 'RPL_THEMES';
const incomeKey = 'HD01_VD01';
const BUILDING_COUNT_KEY = 'BUILDING COUNT';

const commonAssetDataTemplate = Object.freeze({
  damageAssetPath: null,
  damageLevelsKey: null,
  noDamageValue: null,
});

const stateBasedDataTemplate = Object.freeze({
  score_bounds_coordinates: null,
  blockGroupAssetPaths: {},
  snapData: {
    paths: {},
    snapKey,
    totalKey,
  },
  sviAssetPaths: {},
  sviKey,
  incomeAssetPaths: {},
  incomeKey,
  buildingAssetPaths: {},
  states: null,
});

// Has all the basic fields needed for a state-based score asset to be created:
// SNAP, SVI, and income together with the columns of each, and optional damage
// asset path. The default values for column names here are taken from Census
// American FactFinder and CDC tables.
// TODO: should we allow users to change the columns here, on a per-disaster
//  level? Or only as a "global" default? Or just make them modify directly in
//  Firestore?
const stateAssetDataTemplate = Object.freeze(
    {...commonAssetDataTemplate, stateBasedData: stateBasedDataTemplate});

const flexibleAssetData =
    Object.freeze({...commonAssetDataTemplate, flexibleData: {}});

/**
 * Creates disaster data for a disaster with the following states, or a flexible
 * disaster if `states` is null.
 * @param {?Array<string>} states array of states (abbreviations) or null if
 *     this is not a state-based disaster
 * @return {Object}
 */
function createDisasterData(states) {
  const result = {layers: []};
  if (states) {
    const assetData = deepCopy(stateAssetDataTemplate);
    assetData.stateBasedData.states = states;
    result.assetData = assetData;
  } else {
    result.assetData = deepCopy(flexibleAssetData);
  }
  return result;
}

/**
 * Makes a deep copy of `object` using {@link JSON}.
 * @param {Object} object A simple object (no classes)
 * @return {Object} Deep copy of `object`
 */
function deepCopy(object) {
  return JSON.parse(JSON.stringify(object));
}
