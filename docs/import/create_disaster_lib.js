export {createDisasterData};

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

function createDisasterData(states) {
  // Make a deep copy, so any local modifications don't affect template.
  const assetData = JSON.parse(JSON.stringify(assetDataTemplate));
  return {states, layers: [], asset_data: assetData};
}