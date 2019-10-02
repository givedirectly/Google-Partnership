import {damageTag, scoreTag, snapPercentageTag} from './property_names.js';

export {processJoinedData as default};

const scoreDisplayCap = 255;

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
  const povertyRatio = feature.properties[snapPercentageTag];
  const ratioBuildingsDamaged = feature.properties[damageTag];
  let score = 0;
  if (povertyRatio >= povertyThreshold &&
      ratioBuildingsDamaged >= damageThreshold) {
    score = Math.round(
        scalingFactor *
        (ratioBuildingsDamaged * (1 - povertyWeight) +
         povertyRatio * povertyWeight));
  }
  feature.properties[scoreTag] = score;
  feature.properties['color'] =
      [255, 0, 255, Math.min(3 * score, scoreDisplayCap)];
}

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
 * @param {number} povertyThreshold between 0 and 1 representing what
 *     fraction of a population must be SNAP eligible to be considered.
 * @param {number} damageThreshold a number between 0 and 1 representing what
 *     fraction of a block group's building must be damaged to be considered.
 * @param {number} povertyWeight float between 0 and 1 that describes what
 *     percentage of the score should be based on poverty (this is also a proxy
 *     for damageWeight which is 1-this value).
 * @return {Promise}
 */
function processJoinedData(
    dataPromise, scalingFactor, povertyThreshold, damageThreshold,
    povertyWeight) {
  return dataPromise.then((featureCollection) => {
    for (const feature of featureCollection.features) {
      colorAndRate(
          feature, scalingFactor, povertyThreshold, damageThreshold,
          povertyWeight);
    }
    return featureCollection.features;
  });
}
