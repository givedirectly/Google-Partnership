export {createDisasterData};

// For testing
export {assetDataTemplate};

// Has all the basic fields needed for the score asset to be created: SNAP, SVI,
// and income together with the columns of each, and optional damage asset path.
const assetDataTemplate = {
  asset_data: {
    damage_asset_path: null,
    block_group_asset_paths: {},
    snap_data: {
      paths: {},
      snap_key: 'HD01_VD02',
      total_key: 'HD01_VD01',
    },
    svi_asset_paths: {},
    svi_key: 'RPL_THEMES',
    income_asset_paths: {},
    income_key: 'HD01_VD01',
    building_asset_paths: {},
  },
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
