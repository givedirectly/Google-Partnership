import {convertEeObjectToPromise} from './map_util.js';

export {getEePromiseForFeatureCollection};

// 250M objects in a FeatureCollection ought to be enough for anyone.
const maxNumFeaturesExpected = 250000000;

const cache = new Map();

/**
 * Converts given asset path pointing to a {@link ee.FeatureCollection} to a
 * {@link Promise} using {@link convertEeObjectToPromise}, converting the
 * {@link ee.FeatureCollection} to an {@link ee.List} first, to get around
 * issues materializing very large {@link ee.FeatureCollection} objects.
 *
 * Caches results, so there will be only one {@link Promise} per asset path,
 * avoiding duplicate work in the case that the same asset is requested multiple
 * times.
 *
 * @param {string} eeAssetPath Path to an {@link ee.FeatureCollection}
 * @return {Promise<GeoJson>}
 */
function getEePromiseForFeatureCollection(eeAssetPath) {
  const maybePromise = cache.get(eeAssetPath);
  if (maybePromise) {
    return maybePromise;
  }
  eeAssetPath =
      ee.FeatureCollection(eeAssetPath).toList(maxNumFeaturesExpected);
  const result = convertEeObjectToPromise(eeAssetPath);
  cache.set(eeAssetPath, result);
  return result;
}
