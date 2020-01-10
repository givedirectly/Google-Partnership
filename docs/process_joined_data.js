import {damageTag, geoidTag, scoreTag, isUserProperty} from './property_names.js';

export {processJoinedData};

const scoreDisplayCap = 255;

const COLOR_TAG = 'color';

/**
 * Processes a feature corresponding to a geographic area and sets the score,
 * poverty and damage ratios, and color.
 *
 * @param {GeoJsonFeature} feature
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
 * @param {EeColumn} povertyRateKey Property to use for poverty rate
 * @param {boolean} hasDamage Whether score asset was created with damage
 */
function colorAndRate(
    feature, scalingFactor, povertyThreshold, damageThreshold, povertyWeight,
    povertyRateKey, hasDamage) {
  const povertyRatio = feature.properties[povertyRateKey];
  const ratioBuildingsDamaged = hasDamage ? feature.properties[damageTag] : 0;
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

/**
 * @typedef {Object} GeoJsonFeature See
 *     https://macwright.org/2015/03/23/geojson-second-bite.html#features
 */

/**
 * Processes the provided Promise. The returned Promise has the same underlying
 * data as the original Promise. In other words, this method will mutate the
 * underlying data of the original Promise. This is acceptable, because it only
 * adds/overwrites the computed attributes of score and color. We avoid doing a
 * full copy because it would unnecessarily copy a lot of data.
 *
 * @param {Promise<Array<GeoJsonFeature>>} dataPromise
 * @param {number} scalingFactor multiplies the raw score, it can be
 *     adjusted to make sure that the values span the desired range of ~0 to
 *     ~100.
 * @param {Promise<ScoreComputationParameters>} scoreComputationParameters
 *     promise
 * that returns the poverty and damage thresholds and the poverty weight (from
 * which the damage weight is derived).
 * @return {Promise<{featuresList: Array<GeoJsonFeature>, columnsFound:
 *     Array<EeColumn>}>} Resolved scored features, together with all columns
 *     found in features (and the additional {@link scoreTag} and
 *     {@link COLOR_TAG} columns). The first four columns are: {@link geoidTag},
 *     `districtDescriptionKey` from {@link ScoreParameters},
 *     {@link scoreTag}, and then `povertyRateKey` from
 *     {@link ScoreParameters}. If damage is present in the features,
 *     {@link damageTag} is next, followed by `buildingKey` from
 *     {@link ScoreParameters}. If damage is absent, `buildingKey` is last.
 *     Remaining columns are sorted by order encountered in the feature, which
 *     generally means alphabetically, since EarthEngine always sorts them.
 */
function processJoinedData(
    dataPromise, scalingFactor, scoreComputationParameters) {
  return Promise.all([dataPromise, scoreComputationParameters])
      .then(([
              featuresList,
              {
                povertyThreshold,
                damageThreshold,
                povertyWeight,
                scoreAssetCreationParameters: {
                  buildingKey,
                  povertyRateKey,
                  districtDescriptionKey,
                  damageAssetPath,
                },
              },
            ]) => {
        const hasDamage = !!damageAssetPath;
        const columnsFound = new Set([geoidTag]);
        columnsFound.add(districtDescriptionKey);
        columnsFound.add(scoreTag);
        columnsFound.add(povertyRateKey);
        if (hasDamage) {
          columnsFound.add(damageTag);
          columnsFound.add(buildingKey);
        }
        for (const feature of featuresList) {
          colorAndRate(
              feature, scalingFactor, povertyThreshold, damageThreshold,
              povertyWeight, povertyRateKey, hasDamage);
          for (const key of Object.keys(feature.properties)) {
            if (key !== COLOR_TAG && isUserProperty(key)) {
              columnsFound.add(key);
            }
          }
        }
        if (!hasDamage) {
          // Put buildings last if damage not present.
          columnsFound.delete(buildingKey);
          columnsFound.add(buildingKey);
        }
        return {
          featuresList,
          columnsFound: Object.freeze(Array.from(columnsFound)),
        };
      });
}
