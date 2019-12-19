import {eeLegacyPathPrefix, legacyStateDir} from '../ee_paths.js';
import {LayerType} from '../firebase_layers.js';
import {convertEeObjectToPromise} from '../map_util.js';

export {getDisasterAssetsFromEe, getStatesAssetsFromEe};

/**
 * Cache for the results of getStatesAssetsFromEe for each state.
 * @type {Map<string, Promise<Map<string, string>>>}
 */
const stateAssetPromises = new Map();

/**
 * Gets all assets in ee directories corresponding to given states. Caches
 * results. Marks assets with their type and whether or not they should be
 * disabled when put into a select. Here, disabling any assets that aren't
 * feature collections.
 * @param {Array<string>} states
 * @return {Map<string, Promise<Map<string, {disabled: boolean}>>>}
 */
function getStatesAssetsFromEe(states) {
  const toReturn = new Map();
  for (const state of states) {
    const maybeStatePromise = stateAssetPromises.get(state);
    if (maybeStatePromise) {
      toReturn.set(state, maybeStatePromise);
      continue;
    }
    const statePromise =
        listEeAssets(legacyStateDir + '/' + state).then((result) => {
          const assetMap = new Map();
          for (const [asset, type] of result) {
            assetMap.set(
                asset, {disabled: type !== LayerType.FEATURE_COLLECTION});
          }
          return assetMap;
        });
    stateAssetPromises.set(state, statePromise);
    toReturn.set(state, statePromise);
  }
  return toReturn;
}

/**
 * Cache for the results of getDisasterAssetsFromEe for each disaster
 * @type {Map<string, Promise<Map<string, {type: LayerType, disabled:
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
 * @return {Promise<Map<string, {type: number, disabled: boolean}>>} Returns
 *     a promise containing the map of asset to info for the given disaster.
 */
function getDisasterAssetsFromEe(disaster) {
  const maybePromise = disasterAssetPromises.get(disaster);
  if (maybePromise) {
    return maybePromise;
  }
  const result =
      listEeAssets(eeLegacyPathPrefix + disaster)
          .then((assetMap) => {
            const shouldDisable = [];
            for (const asset of Array.from(assetMap.keys())) {
              if (assetMap.get(asset) === LayerType.FEATURE_COLLECTION) {
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
                    // DOM disable property can't recognize 0 and 1 as false and
                    // true :(
                    true, false));
              } else {
                shouldDisable.push(false);
              }
            }
            return Promise.all([
              Promise.resolve(assetMap),
              convertEeObjectToPromise(ee.List(shouldDisable)),
            ]);
          })
          .then(([assetTypeMap, disableList]) => {
            const assetMap = new Map();
            const disableListIterator = disableList[Symbol.iterator]();
            for (const [asset, type] of assetTypeMap) {
              assetMap.set(
                  asset,
                  {type: type, disabled: disableListIterator.next().value});
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
