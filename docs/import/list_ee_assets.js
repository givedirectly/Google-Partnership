import {eeLegacyPathPrefix, legacyStateDir} from '../ee_paths.js';
import {convertEeObjectToPromise} from '../ee_promise_cache.js';
import {LayerType} from '../firebase_layers.js';

import {listEeAssets} from './ee_utils.js';
import {createOptionFrom} from './manage_layers.js';

export {
  createPendingSelect,
  getDisasterAssetsFromEe,
  getStateAssetsFromEe,
  listAndProcessEeAssets
};

/**
 * Cache for the results of getStateAssetsFromEe.
 * @typedef {Map<string, {disabled: boolean, hasGeometry: boolean}>} StateList
 * @type {Map<string, Promise<StateList>>}
 */
const stateAssetPromises = new Map();

/**
 * Gets all assets in ee directories corresponding to given state. Caches
 * results. Marks assets with their type and whether or not they should be
 * disabled when put into a select. Here, disabling any assets that aren't
 * feature collections.
 * @param {string} state
 * @return {Promise<StateList>}
 */
function getStateAssetsFromEe(state) {
  const maybeStatePromise = stateAssetPromises.get(state);
  if (maybeStatePromise) {
    return maybeStatePromise;
  }
  const statePromise = markHasGeometryAssets(
                           listAndProcessEeAssets(legacyStateDir + '/' + state))
                           .then((assetMap) => {
                             for (const attributes of assetMap.values()) {
                               attributes.disabled = attributes.type !==
                                   LayerType.FEATURE_COLLECTION;
                             }
                             return assetMap;
                           });
  stateAssetPromises.set(state, statePromise);
  return statePromise;
}

/**
 * Cache for the results of getDisasterAssetsFromEe for each disaster
 * @typedef {Map<string, {type: LayerType, disabled: boolean, hasGeometry:
 * boolean}>} DisasterList
 * @type {Map<string, Promise<DisasterList>>}
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
 * @return {Promise<DisasterList>} Promise containing the map of asset to info
 *     for the given disaster.
 */
function getDisasterAssetsFromEe(disaster) {
  const maybePromise = disasterAssetPromises.get(disaster);
  if (maybePromise) {
    return maybePromise;
  }
  const result = markHasGeometryAssets(
                     listAndProcessEeAssets(eeLegacyPathPrefix + disaster))
                     .then((assetMap) => {
                       for (const attributes of assetMap.values()) {
                         attributes.disabled = !attributes.hasGeometry;
                       }
                       return assetMap;
                     });
  disasterAssetPromises.set(disaster, result);
  return result;
}

/**
 * Attaches geometry info to the given listing. Only
 * {@link ee.FeatureCollection} assets can have geometries, and an asset will
 * have the `hasGeometry` attribute if its {@link ee.Geometry} is non-null and
 * has a non-empty coordinates list. We only check the first element of each
 * {@link ee.FeatureCollection}. Could be bad if we ever see a data set with a
 * mix of empty and non-empty geometries.
 *
 * Census data returns an empty coords {@link ee.Geometry.MultiPoint} geometry
 * instead of a true null geometry. So we check for that.
 * @param {Promise<Array<{asset: string, type: LayerType}>>} listingPromise
 *     See {@link listEeAssets}
 * @return {Map<string, {type: LayerType, hasGeometry: boolean}>}
 */
function markHasGeometryAssets(listingPromise) {
  // For passing through promise without re-promise-ifying.
  let listEeAssetsResult;
  return listingPromise
      .then((assets) => {
        listEeAssetsResult = assets;
        const hasGeometry = [];
        for (const {asset, type} of assets) {
          if (type === LayerType.FEATURE_COLLECTION) {
            const geometry = ee.FeatureCollection(asset).first().geometry();
            // For some reason, ee.Feature(null, {}).geometry() returns null,
            // but ee.Feature(null, {}).geometry().coordinates() returns []. We
            // don't rely on this, and check null and empty separately.
            // Null and empty list are false.
            hasGeometry.push(ee.Algorithms.If(
                geometry, ee.Algorithms.If(geometry.coordinates(), true, false),
                false));
          } else {
            hasGeometry.push(false);
          }
        }
        return convertEeObjectToPromise(ee.List(hasGeometry));
      })
      .then((hasGeometryList) => {
        const assetMap = new Map();
        const hasGeometryIterator = hasGeometryList[Symbol.iterator]();
        for (const {asset, type} of listEeAssetsResult) {
          assetMap.set(
              asset, {type, hasGeometry: hasGeometryIterator.next().value});
        }
        return assetMap;
      });
}

/**
 * Lists the EE assets in dir, filtering out unsupported ones.
 * @param {string} dir fully qualified EE path
 * @return {Promise<Array<{asset: string, type: LayerType}>>} Promise with an
 *     array of asset info objects.
 */
function listAndProcessEeAssets(dir) {
  return listEeAssets(dir).then(getIds);
}

/**
 * Turns a listAssets call result into a list of asset info objects.
 * @param {Object} listResult result of call to {@link listEeAssets}
 * @return {Array<{asset: string, type: LayerType}>} asset-path -> type e.g.
 *     'users/gd/my-asset' -> 'IMAGE'
 */
function getIds(listResult) {
  const assets = [];
  for (const asset of listResult) {
    const type = maybeConvertAssetType(asset);
    if (type) assets.push({asset: asset.id, type});
  }
  return assets;
}

// TODO: surface a warning if unsupported asset types are found?
/**
 * Check that the type of the given asset is one we support (Unsupported:
 * ALGORITHM, FOLDER, UNKNOWN).
 * @param {Object} asset single item from result of listAssets
 * @return {?LayerType} the type of the asset if it's supported, else null
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

function createPendingSelect() {
  return $(document.createElement('select'))
      .width(200)
      .attr('disabled', true)
      .append(createOptionFrom('pending...'));
}
