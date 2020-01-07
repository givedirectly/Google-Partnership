import {
  blockGroupTag,
  damageTag,
  geoidTag,
  isUserProperty,
  povertyPercentageTag,
  scoreTag
} from './property_names.js';

export {processJoinedData};

const scoreDisplayCap = 255;

const COLOR_TAG = 'color';

/**
 * Processes a feature corresponding to a geographic area and sets the score,
 * poverty and damage ratios, and color.
 *
 * @param {GeoJSON} feature GeoJSON Feature
 * @param {number} scalingFactor multiplies the raw score, it can be
 *     adjusted to make sure that the values span the desired range of ~0 to
 *     ~100.
 * @param {number} povertyThreshold between 0 and 1 representing what
 *     fraction of a population must be SNAP eligible to be considered.
 * @param {number} damageThreshold a number between 0 and 1 representing what
 *     fraction of a block group's buildings must be damaged to be considered.
 * @param {number} povertyWeight float between 0 and 1 that describes what
 *     percentage of the score should be based on poverty (this is also a proxy
 *     for damageWeight which is 1-this value).
 */
function colorAndRate(
    feature, scalingFactor, povertyThreshold, damageThreshold, povertyWeight) {
  const povertyRatio = feature.properties[povertyPercentageTag];
  // If damage tag is absent, treat as 0.
  const ratioBuildingsDamaged = feature.properties[damageTag] || 0;
  let score = 0;
  if (povertyRatio >= povertyThreshold &&
      ratioBuildingsDamaged >= damageThreshold) {
    score = Math.round(
        scalingFactor *
        (ratioBuildingsDamaged * (1 - povertyWeight) +
         povertyRatio * povertyWeight));
  }
  feature.properties[scoreTag] = score;
  // Opacity is between 0 and 255, while score is between 0 and scalingFactor.
  // Math.min is out of an abundance of caution, in case bad data leads to
  // score > scalingFactor.
  const opacity =
      Math.min(Math.round((255 / scalingFactor) * score), scoreDisplayCap);
  feature.properties[COLOR_TAG] = [255, 0, 255, opacity];
}

// We put these keys here because adding them to the set first guarantees they
// will be the first three columns in the table.
const ALWAYS_PRESENT_KEYS = Object.freeze([geoidTag, blockGroupTag, scoreTag]);

/**
 * Processes the provided Promise. The returned Promise has the same underlying
 * data as the original Promise. In other words, this method will mutate the
 * underlying data of the original Promise. This is acceptable, because it only
 * adds/overwrites the computed attributes of score and color. We avoid doing a
 * full copy because it would unnecessarily copy a lot of data.
 *
 * @param {Promise} dataPromise
 * @param {number} scalingFactor multiplies the raw score, it can be
 *     adjusted to make sure that the values span the desired range of ~0 to
 *     ~100.
 * @param {Promise<Object>} initialTogglesValuesPromise promise
 * that returns the poverty and damage thresholds and the poverty weight (from
 * which the damage weight is derived).
 * @typedef {Object} GeoJsonFeature See
 *     https://macwright.org/2015/03/23/geojson-second-bite.html#features
 * @return {Promise<{featuresList: Array<GeoJsonFeature>, columnsFound:
 *     Array<string>}>} Resolved scored features, together with all columns
 *     found in features
 */
function processJoinedData(
    dataPromise, scalingFactor, initialTogglesValuesPromise) {
  return Promise.all([dataPromise, initialTogglesValuesPromise])
      .then(([
              featuresList,
              {
                povertyThreshold,
                damageThreshold,
                povertyWeight,
              },
            ]) => {
        const columnsFound = new Set(ALWAYS_PRESENT_KEYS);
        for (const feature of featuresList) {
          colorAndRate(
              feature, scalingFactor, povertyThreshold, damageThreshold,
              povertyWeight);
          for (const key of Object.keys(feature.properties)) {
            if (key !== COLOR_TAG && isUserProperty(key)) {
              columnsFound.add(key);
            }
          }
        }
        return {
          featuresList,
          columnsFound: Object.freeze(Array.from(columnsFound)),
        };
      });
}
