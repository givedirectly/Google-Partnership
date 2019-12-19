import {eeLegacyPathPrefix, legacyStateDir} from '../ee_paths.js';
import {LayerType} from '../firebase_layers.js';
import {convertEeObjectToPromise} from '../map_util.js';

export {getDisasterAssetsFromEe, getStatesAssetsFromEe};

/**
 * Cache for the results of listEeAssets for each state.
 * @type {Map<string, Promise<Map<string, string>>>} Promise with a map whose
 *     keys are the asset names, and values are types
 */
const stateAssetPromises = new Map();

/**
 * Gets all assets in ee directories corresponding to given states. Caches
 * results of calls to listEeAssets for each state. Marks assets with their type
 * and whether or not they should be disabled when put into a select. Here,
 * disabling any assets that aren't feature collections.
 * @param {Array<string>} states e.g. ['WA']
 * @return {Promise<Array<Array<string, {disable: boolean}>>>} 2-d array of all
 *     retrieved assets in the form [['WA', {'path' => {disable: true}}],...]
 */
function getStatesAssetsFromEe(states) {
  const promises = [];
  for (const state of states) {
    let listEeAssetsPromise = stateAssetPromises.get(state);
    if (!listEeAssetsPromise) {
      const dir = legacyStateDir + '/' + state;
      listEeAssetsPromise = listEeAssets(dir);
      stateAssetPromises.set(state, listEeAssetsPromise);
    }
    promises.push(listEeAssetsPromise.then((result) => [state, result]));
  }
  return Promise.all(promises).then((results) => {
    const toReturn = [];
    for (const result of results) {
      const assetMap = new Map();
      for (const assetInfo of result[1]) {
        assetMap.set(
            assetInfo[0],
            {disable: assetInfo[1] !== LayerType.FEATURE_COLLECTION});
      }
      toReturn.push([result[0], assetMap]);
    }
    return toReturn;
  });
}

/**
 * Cache for the results of getDisasterAssetsFromEe for each disaster
 * @type {Map<string, Promise<Map<string, {type: LayerType, disable:
 *     boolean}>>>}
 */
const disasterAssetPromises = new Map();

/**
 * Gets all assets for the given disaster. Assumes an ee folder has already
 * been created for this disaster. Marks assets with their type and whether or
 * not they should be disabled when put into a select. Here, disabling any
 * feature collections that have a null-looking (see comment below) geometry.
 *
 * De-duplicates requests, so retrying before a fetch completes won't start a
 * new fetch.
 * @param {string} disaster disaster in the form name-year
 * @return {Promise<Map<string, {type: number, disabled: number}>>} Returns
 *     a promise containing the map
 * of asset path to info for the given disaster.
 */
function getDisasterAssetsFromEe(disaster) {
  const maybePromise = disasterAssetPromises.get(disaster);
  if (maybePromise) {
    return maybePromise;
  }
  const result =
      listEeAssets(eeLegacyPathPrefix + disaster)
          .then((result) => {
            const shouldDisable = [];
            for (const asset of Array.from(result.keys())) {
              if (result.get(asset) === LayerType.FEATURE_COLLECTION) {
                // census data returns an empty coords multipoint
                // geometry instead of a true null geometry. So
                // we check for that. Could be bad if we ever see
                // a data set with a mix of empty and non-empty
                // geometries.
                shouldDisable.push(ee.Algorithms.If(
                    ee.Algorithms.IsEqual(
                        ee.FeatureCollection(asset)
                            .first()
                            .geometry()
                            .coordinates()
                            .length(),
                        ee.Number(0)),
                    true, false));
              } else {
                shouldDisable.push(false);
              }
            }
            return Promise.all([
              Promise.resolve(result),
              convertEeObjectToPromise(ee.List(shouldDisable)),
            ]);
          })
          .then((results) => {
            const assetTypeMap = results[0];
            const disableList = results[1];
            const assetMap = new Map();
            const assets = Array.from(assetTypeMap.keys());
            for (let i = 0; i < assets.length; i++) {
              const asset = assets[i];
              assetMap.set(
                  asset,
                  {type: assetTypeMap.get(asset), disable: disableList[i]});
            }
            return assetMap;
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
