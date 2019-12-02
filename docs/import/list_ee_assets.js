import {
  eeLegacyPathPrefix,
  eeStatePrefixLength,
  legacyStateDir
} from '../ee_paths.js';
import {LayerType} from '../firebase_layers.js';

export {getStatesAssetsFromEe, getDisasterAssetsFromEe};

/**
 * Requests all assets in ee directories corresponding to given states.
 * @param {Array<string>} states e.g. ['WA']
 * @return {Promise<Array<Array<string | Array<string>>>>} 2-d array of all
 *     retrieved assets in the form [['WA', {'asset/path': LayerType,...}], ...]
 */
function getStatesAssetsFromEe(states) {
  return ee.data.listAssets(legacyStateDir, {}, () => {})
      .then((result) => {
        const folders = new Set();
        for (const folder of result.assets) {
          folders.add(folder.id.substring(eeStatePrefixLength));
        }
        const promises = [];
        for (const state of states) {
          const dir = legacyStateDir + '/' + state;
          if (!folders.has(state)) {
            // This will print a console error for anyone other than the gd
            // account. Ee console seems to have the power to grant write access
            // to non-owners but it doesn't seem to work. Sent an email to
            // gestalt.
            // TODO: replace with setIamPolicy when that works.
            ee.data.createFolder(dir, false, () => {
              // TODO: add status bar for when this is finished.
              ee.data.setAssetAcl(dir, {all_users_can_read: true});
            });
            promises.push(Promise.resolve([state, new Map()]));
          } else {
            promises.push(listEeAssets(dir).then((result) => [state, result]));
          }
        }
        return Promise.all(promises);
      });
}

/**
 * Gets all assets for the given disaster. Assumes an ee folder has already
 * been created for this disaster.
 * @param {string} disaster disaster in the form name-year
 * @return {Promise<Map<string, string>>} Returns a promise containing the map
 * of asset path to type for the given disaster.
 */
function getDisasterAssetsFromEe(disaster) {
  return listEeAssets(eeLegacyPathPrefix + disaster);
}

function listEeAssets(dir) {
  return ee.data.listAssets(dir, {}, () => {}).then(getIds);
}

/**
 * Turns a listAssets call result into a map of asset -> type.
 * @param {Object} listAssetsResult result of call to ee.data.listAssets
 * @return {Map<string, string>}
 */
function getIds(listAssetsResult) {
  const assets = new Map();
  if (listAssetsResult.assets) {
    for (const asset of listAssetsResult.assets) {
      const type = maybeConvertAssetType(asset);
      if (type) assets.set(asset.id, type);
    }
  }
  return assets;
}

// TODO: surface a warning if unsupported asset types are found?
/**
 * Check that the type of the given asset is one we support (Unsupported:
 * ALGORITHM, FOLDER, UNKNOWN).
 * @param {Object} asset single item from result of listAssets
 * @return {?number} the type of the asset if it's supported, else null
 */
function maybeConvertAssetType(asset) {
  switch (asset.type) {
    case 'IMAGE':
      return LayerType.IMAGE;
    case 'IMAGE_COLLECTION':
      return LayerType.IMAGE_COLLECTION;
    case 'TABLE':
      return LayerType.FEATURE_COLLECTION;
    default:
      return null;
  }
}
