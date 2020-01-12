export {createDisasterData};
export {
  BUILDING_COUNT_KEY,
  BuildingSource,
  incomeKey,
  snapKey,
  sviKey,
  totalKey,
};
// For testing
export {deepCopy, flexibleAssetData, stateAssetDataTemplate};

const snapKey = 'HD01_VD02';
const totalKey = 'HD01_VD01';
const sviKey = 'RPL_THEMES';
const incomeKey = 'HD01_VD01';
const BUILDING_COUNT_KEY = 'BUILDING COUNT';

/**
 * EarthEngine asset path to an {@link ee.FeatureCollection}.
 * @typedef {string} EeFC
 */

/**
 * Column of {@link ee.FeatureCollection}.
 * @typedef {string} EeColumn
 */

/**
 * Contains Firestore fields that are common to both state-based and flexible
 * disasters. Currently only damage-related.
 *
 * @typedef {Readonly<Object>} CommonAssetData
 * @property {?EeFC} [damageAssetPath] Damage data. If not specified, the score
 *     asset will not have any damage data. One of this or
 *     `scoreBoundsCoordinates` must be specified for score asset creation. See
 *     {@link calculateDamage}.
 * @property {?EeColumn} [noDamageKey] The column of the damage asset that can
 *     distinguish between damaged and undamaged buildings. If damage asset
 *     contains undamaged buildings, this must be specified.
 * @property {?string} [noDamageValue] The value of `noDamageKey` that indicates
 *     that a building is undamaged.
 * @property {?Array<firebase.firestore.GeoPoint>} [scoreBoundsCoordinates]
 *     Coordinates of polygon that score asset should be restricted to. Only
 *     used if `damageAssetPath` not specified: if `damageAssetPath` is
 *     specified, an "envelope" around the damage points is used for
 *     the score asset bounds. See {@link calculateDamage}.
 */

/**
 * @type {CommonAssetData}
 */
const commonAssetDataTemplate = Object.freeze({
  damageAssetPath: null,
  noDamageKey: null,
  noDamageValue: null,
  scoreBoundsCoordinates: null,
});

/**
 * Map from two-letter state abbreviations to {@link EeFC}.
 * @typedef {Object} StateAssetMap
 */

// TODO: should we allow users to change the columns here, on a per-disaster
//  level? Or only as a "global" default? Or just make them modify directly in
//  Firestore?
/**
 * Contains Firestore fields that are used for state-based (U.S. Census
 * data-sourced) disasters.
 *
 * @typedef {Readonly<Object>} StateBasedData
 * @property {Array<string>} states List of states that disaster affected, as
 *     two-letter standard abbreviations. Cannot be modified after disaster is
 *     created. For objects below that have state-based asset paths, all states'
 *     assets must be specified for score asset creation if the asset is
 *     mandatory.
 * @property {StateAssetMap} blockGroupAssetPaths TIGER shapefiles giving Census
 *     block group geometies. Assumed to have a {@link tigerGeoidKey} column
 *     giving the block group. Mandatory asset.
 * @property {Object} snapData Contains SNAP-related data. Mandatory.
 * @property {StateAssetMap} snapData.paths Census SNAP data. Assumed to have a
 *     {@link censusGeoidKey} column giving the block group. Assumed to have a
 *     {@link censusBlockGroupKey} column describing the block group.
 * @property {EeColumn} snapKey Column of SNAP data that contains number of
 *     households on SNAP. Currently hard-coded to {@link snapKey}.
 * @property {EeColumn} totalKey Column of SNAP data that contains total number
 *     of housholds. Currently hard-coded to {@link totalKey}.
 * @property {StateAssetMap} [sviAssetPaths] SVI datasets, from CDC. Assumed to
 *     be at the Census tract level, with tract identifier {@link cdcGeoidKey}.
 * @property {EeColumn} [sviKey] Column of SVI data that contains SVI for Census
 *     tract. Currently hard-coded to {@link sviKey}.
 * @property {StateAssetMap} [incomeAssetPaths] Median income datasets at the
 *     block-group level, from Census. Assumed to have a {@link censusGeoidKey}
 *     column giving the block group.
 * @property {EeColumn} [incomeKey] Column of data that contains median income
 *     for Census block group. Currently hard-coded to {@link incomeKey}.
 * @property {StateAssetMap} buildingAssetPaths All buildings, as geometries (so
 *     that they can be intersected with block groups to get total building
 *     counts).
 *
 * @type {StateBasedData}
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

/**
 * @typedef {CommonAssetData} AssetData
 * @property {FlexibleData} [flexibleData]
 * @property {StateBasedData} [stateBasedData]
 */

// Has all the basic fields needed for a state-based score asset to be created:
// SNAP, SVI, and income together with the columns of each, and optional damage
// asset path.
const stateAssetDataTemplate = Object.freeze(
    {...commonAssetDataTemplate, stateBasedData: stateBasedDataTemplate});

/**
 * Where building count comes from.
 * @type {Object}
 * @param {number} BUILDING Indicates that there is a separate buildings asset.
 *     Asset can contain geometries (in which case each geometry corresponds to
 *     a building), or just have rows, in which case each row has a building
 *     count that will be joined to the poverty asset. `buildingGeoid` will
 *     be the joining column to the poverty asset's `povertyGeoid` and
 *     `buildingKey` the column with the count.
 * @param {number} POVERTY Indicates that poverty asset already has a building
 *     count per district. `buildingKey` will identify the column.
 * @param {number} DAMAGE Indicates that damage asset contains geometries for
 *     all buildings, not just damaged ones, so the building count can be taken
 *     from it. If specified, `flexibleData` fields `noDamageKey` and
 *     `noDamageValue` must be set if `assetData.damageAssetPath` is. (If this
 *     is set but the damage asset is not specified, the score asset can be
 *     created, without damage or buildings.)
 */
const BuildingSource = Object.freeze({
  BUILDING: 1,
  POVERTY: 2,
  DAMAGE: 3,
});

/**
 * Has data for a "flexible" (non-Census-based) disaster.
 * @typedef {Readonly<Object>} FlexibleData
 * @property {?EeFC} povertyPath Contains poverty data. May have geometries, in
 *     which case `geographyPath` is not used. May have building counts, in
 *     which case `buildingPath` is not used. All columns from this asset end up
 *     in final score asset.
 * @property {?EeColumn} povertyGeoid Column of `povertyPath` that contains
 *     district-identifying string ("district identifier").
 *     {@link censusGeoidKey} for Census data.
 * @property {?EeColumn} povertyRateKey Column of `povertyPath` that
 *     contains poverty rate, as a number between 0 and 1, for use in score.
 *     {@link POVERTY_PERCENTAGE_TAG} for Census data.
 * @property {?EeColumn} districtDescriptionKey Column of `povertyPath` that
 *     contains human-readable description of each district, for display on map.
 *     {@link censusBlockGroupKey} for Census data.
 * @property {boolean} povertyHasGeometry Whether the poverty asset has
 *     geometries for its districts. If not, `geographyPath` must be specified.
 * @property {?EeColumn} [povertyBuildingKey]  If `buildingSource` is
 *     {@link BuildingSource.POVERTY}, indicates the column of `povertyPath`
 *     that has counts.
 * @property {?EeFC} [geographyPath] Contains geometries of districts.
 * @property {?EeColumn} [geographyGeoid] Column of `geographyPath` that
 *     contains district identifier. {@link tigerGeoidKey} for Census data.
 * @property {?BuildingSource} buildingSource Where the building count comes
 *     from.
 * @property {?EeFC} [buildingPath] Contains building data. If buildings
 *     have geometries, building counts per district will be computed by
 *     geographic intersection. If there are no geometries, each row is a
 *     per-district count of buildings.
 * @property {?EeColumn} [buildingGeoid] If `buildingPath` contains per-district
 *     counts of buildings, indicates the column that has district identifier.
 * @property {?EeColumn} [buildingKey] If `buildingSource` is
 *     {@link BuildingSource.BUILDING}, indicates the column of `buildingPath`
 *     that has counts.
 */

/**
 *
 * @type {FlexibleData}
 */
const flexibleDataTemplate = Object.freeze({
  povertyPath: null,
  povertyRateKey: null,
  districtDescriptionKey: null,
  povertyGeoid: null,
  povertyHasGeometry: false,
  povertyBuildingKey: null,
  geographyPath: null,
  buildingPath: null,
  buildingSource: null,
  buildingKey: null,
});

const flexibleAssetData = Object.freeze(
    {...commonAssetDataTemplate, flexibleData: flexibleDataTemplate});

/**
 * Creates disaster data for a disaster with the following states, or a flexible
 * disaster if `states` is null.
 * @param {?Array<string>} states array of states (abbreviations) or null if
 *     this is not a state-based disaster
 * @return {Object}
 */
function createDisasterData(states) {
  const result = {layerArray: []};
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
