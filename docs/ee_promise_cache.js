export {
  AssetNotFoundError,
  clearPromiseCacheForTesting,
  convertEeObjectToPromise,
  getEePromiseForFeatureCollection,
  transformEarthEngineFailureMessage,
};

// 6M objects in a FeatureCollection should be enough: if this number is too
// big, EarthEngine won't construct a list even if the FeatureCollection itself
// doesn't have that many elements.
const maxNumFeaturesExpected = 6000000;

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
 * @return {Promise<Array<GeoJson>>}
 */
function getEePromiseForFeatureCollection(eeAssetPath) {
  const maybePromise = cache.get(eeAssetPath);
  if (maybePromise) {
    return maybePromise;
  }
  const eeList =
      ee.FeatureCollection(eeAssetPath).toList(maxNumFeaturesExpected);
  const result = convertEeObjectToPromise(eeList);
  cache.set(eeAssetPath, result);
  return result;
}

/** Marker class for an asset being missing. */
class AssetNotFoundError extends Error {
  /**
   * @constructor
   * @param {string} message
   */
  constructor(message) {
    super();
    super.message = message;
  }
}

/**
 * Transforms EarthEngine failure message into an {@link Error}. Does ugly
 * string matching to check if failure message means asset wasn't found.
 *
 * @param {string} error Failure message passed to EarthEngine callback
 * @return {Error}
 */
function transformEarthEngineFailureMessage(error) {
  console.log(
      'We have error', error, error instanceof Error,
      typeof (error) === 'string');
  if (error instanceof Error) {
    // Useful if this is called recursively. EarthEngine never passes Errors.
    return error;
  } else if (typeof (error) === 'string') {
    // Ugh, but best we can do to detect missing asset.
    if (error.endsWith('not found.')) {
      return new AssetNotFoundError(error);
    } else {
      return new Error(error);
    }
  } else {
    return error;
  }
}

/**
 * Transforms an EE object into a standard Javascript Promise by wrapping its
 * evaluate call. For an {@link ee.FeatureCollection}, call
 * {@link getEePromiseForFeatureCollection} instead of this method directly!
 *
 * Does light processing of the error message in case of failure.
 *
 * @param {ee.ComputedObject} eeObject
 * @return {Promise<GeoJson>}
 */
function convertEeObjectToPromise(eeObject) {
  return new Promise((resolve, reject) => {
    eeObject.evaluate((resolvedObject, error) => {
      if (error) {
        reject(transformEarthEngineFailureMessage(error));
        return;
      }
      resolve(resolvedObject);
    });
  });
}

/** Clears cache, for use with tests. */
function clearPromiseCacheForTesting() {
  cache.clear();
}
