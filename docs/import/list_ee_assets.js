import {eeLegacyPathPrefix, legacyStateDir} from '../ee_paths.js';
import {LayerType} from '../firebase_layers.js';
import {convertEeObjectToPromise} from '../map_util.js';

export {getDisasterAssetsFromEe, getStatesAssetsFromEe};

/**
 * Requests all assets in ee directories corresponding to given states.
 * @param {Array<string>} states e.g. ['WA']
 * @return {Promise<Array<Array<string | Array<string>>>>} 2-d array of all
 *     retrieved assets in the form [['WA', {'asset/path': LayerType,...}], ...]
 */
function getStatesAssetsFromEe(states) {
  const promises = [];
  for (const state of states) {
    const dir = legacyStateDir + '/' + state;
    promises.push(listEeAssets(dir).then((result) => [state, result]));
  }
  return Promise.all(promises);
}

const disasterAssetPromises = new Map();

/**
 * Gets all assets for the given disaster. Assumes an ee folder has already
 * been created for this disaster.
 *
 * Deduplicates requests, so retrying before a fetch completes won't start a new
 * fetch.
 * @param {string} disaster disaster in the form name-year
 * @return {Promise<Map<string, string>>} Returns a promise containing the map
 * of asset path to type for the given disaster.
 */
function getDisasterAssetsFromEe(disaster) {
  const maybePromise = disasterAssetPromises.get(disaster);
  if (maybePromise) {
    return maybePromise;
  }
  const result = listEeAssets(eeLegacyPathPrefix + disaster)
                     .then((result) => {
                       const assetPromises = [];
                       result.forEach((type, asset) => {
                         if (type !== LayerType.FEATURE_COLLECTION) return;
                         // assuming that if the first feature's geometry in a
                         // collection is null, they're all null
                         const assetPromise = convertEeObjectToPromise(
                                             ee.FeatureCollection(asset)
                                                 .first()
                                                 .geometry()
                                                 .coordinates())
                                             .then((coords) => {
                                               if (coords.length !== 0) {
                                                 return [asset, type];
                                               }
                                             });
                         assetPromises.push(assetPromise);
                       });
                       return Promise.all(assetPromises);
                     })
                     .then((results) => {
                       const nonNulls = new Map();
                       for (const result of results) {
                         if (result) {
                           nonNulls.set(result[0], result[1]);
                         }
                       }
                       return nonNulls;
                     });
  disasterAssetPromises.set(disaster, result);
  return result;
}

/**
 * Lists the EE assets in dir, filtering out unsupported ones.
 * @param {string} dir fully qualified EE path
 * @return {Promise<Map<string, string>>} Promise with a map whose keys are the
 *     asset names, and values are types
 */
function listEeAssets(dir) {
  return ee.data.listAssets(dir, {}, () => {}).then(getIds);
}

/**
 * Turns a listAssets call result into a map of asset -> type.
 * @param {Object} listAssetsResult result of call to ee.data.listAssets
 * @return {Map<string, string>} asset-path -> type e.g. 'users/gd/my-asset' ->
 *     'IMAGE'
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
