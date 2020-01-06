export {createDisasterData};
export {BUILDING_COUNT_KEY, incomeKey, snapKey, sviKey, totalKey};
// For testing
export {deepCopy, flexibleAssetData, stateAssetDataTemplate};

const snapKey = 'HD01_VD02';
const totalKey = 'HD01_VD01';
const sviKey = 'RPL_THEMES';
const incomeKey = 'HD01_VD01';
const BUILDING_COUNT_KEY = 'BUILDING COUNT';

/**
 * Contains Firestore fields that are common to both state-based and flexible
 * disasters. Currently only damage-related.
 *
 * @type {Readonly<Object>}
 * @property {string} [damageAssetPath] The EarthEngine asset giving damage. If
 *     not specified, the score asset will not have any damage data. One of this
 *     or `scoreBoundsCoordinates` must be specified for score asset creation.
 *     See {@link calculateDamage}.
 * @property {string} [noDamageKey] The column of the damage asset that can
 *     distinguish between damaged and undamaged buildings. If damage asset
 *     contains undamaged buildings, this must be specified.
 * @property {string} [noDamageValue] The value of `noDamageKey` that indicates
 *     that a building is undamaged.
 * @property {Array<firebase.firestore.GeoPoint>} [scoreBoundsCoordinates]
 *     Coordinates of polygon that score asset should be restricted to. Only
 *     used if `damageAssetPath` not specified: if `damageAssetPath` is
 *     specified, an "envelope" around the damage points is used for
 *     the score asset bounds.
 */
const commonAssetDataTemplate = Object.freeze({
  damageAssetPath: null,
  noDamageKey: null,
  noDamageValue: null,
  scoreBoundsCoordinates: null,
});

/**
 * Contains Firestore fields that are used for state-based (U.S. Census
 * data-sourced) disasters.
 * @type {Readonly<Object>}
 * @property {Array<string>} states List of states that disaster affected, as
 *     two-letter standard abbreviations. Cannot be modified after disaster is
 *     created
 * @property {Object} blockGroupAssetPaths Maps states to EarthEngine asset
 *     paths for TIGER shapefiles for those states. All states must  
 */
const stateBasedDataTemplate = Object.freeze({
  states: null,
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
