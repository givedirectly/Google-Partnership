export {createDisasterData};
export {incomeKey, snapKey, sviKey, totalKey};
// For testing
export {assetDataTemplate};

const snapKey = 'HD01_VD02';
const totalKey = 'HD01_VD01';
const sviKey = 'RPL_THEMES';
const incomeKey = 'HD01_VD01';

// Has all the basic fields needed for the score asset to be created: SNAP, SVI,
// and income together with the columns of each, and optional damage asset path.
// The default values for column names here are taken from Census American
// FactFinder and CDC tables.
// TODO: should we allow users to change the columns here, on a per-disaster
//  level? Or only as a "global" default? Or just make them modify directly in
//  Firestore?
const assetDataTemplate = {
  damage_asset_path: null,
  map_bounds_sw: null,
  map_bounds_ne: null,
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
};
Object.freeze(assetDataTemplate);

/**
 * Creates disaster data for a disaster with the following states.
 * @param {Array<string>} states
 * @return {Object}
 */
function createDisasterData(states) {
  // Make a deep copy, so any local modifications don't affect template.
  const assetData = JSON.parse(JSON.stringify(assetDataTemplate));
  return {states, layers: [], asset_data: assetData};
}
