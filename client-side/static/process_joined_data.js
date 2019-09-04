import damageLevelsList from './fema_damage_levels.js';

export {
  damageTag,
  geoidTag,
  processJoinedData as default,
  scoreTag,
  snapTag,
};

const damageTag = 'DAMAGE PERCENTAGE';
const geoidTag = 'GEOID';
const scoreTag = 'SCORE';
const snapTag = 'SNAP PERCENTAGE';

const scoreDisplayCap = 99;

/**
 * Processes a feature corresponding to a geographic area and returns a new one,
 * with just the GEOID and SCORE properties set, and a style attribute that
 * sets the color/opacity based on the score, with all scores past 99
 * equally opaque.
 *
 * @param {ee.Feature} feature
 * @param {ee.Number} scalingFactor multiplies the raw score, it can be
 *     adjusted to make sure that the values span the desired range of ~0 to
 *     ~100.
 * @param {ee.List} damageLevels
 * @param {number} povertyThreshold between 0 and 1 representing what
 *     fraction of a population must be SNAP eligible to be considered.
 * @param {number} damageThreshold a number between 0 and 1 representing what
 *     fraction of a block group's buildings must be damaged to be considered.
 * @param {number} povertyWeight float between 0 and 1 that describes what
 *     percentage of the score should be based on poverty (this is also a proxy
 *     for damageWeight which is 1-this value).
 *
 * @return {ee.Feature}
 */
function colorAndRate(
    feature, scalingFactor, damageLevels, povertyThreshold, damageThreshold,
    povertyWeight) {
  const povertyRatio =
      ee.Number(feature.get('SNAP')).divide(feature.get('TOTAL'));
  const ratioBuildingsDamaged =
      ee.Number(damageLevels
                    .map((type) => {
                      return ee.Number(feature.get(type));
                    })
                    .reduce(ee.Reducer.sum()))
          .divide(feature.get('BUILDING_COUNT'));
  const belowThresholds =
      ee.Number(povertyRatio.lte(povertyThreshold))
          .or(ee.Number(ratioBuildingsDamaged.lte(damageThreshold)));
  const potentialScore =
      ee.Number(ratioBuildingsDamaged.multiply(1 - povertyWeight)
                    .add(povertyRatio.multiply(povertyWeight))
                    .multiply(scalingFactor)
                    .round());
  const score = ee.Number(
      ee.Algorithms.If(belowThresholds, ee.Number(0), potentialScore));
  return ee
      .Feature(feature.geometry(), ee.Dictionary([
        geoidTag,
        feature.get(geoidTag),
        scoreTag,
        score,
        snapTag,
        povertyRatio,
        damageTag,
        ratioBuildingsDamaged,
      ]))
      .set({
        style: {
          color: score.min(ee.Number(scoreDisplayCap)).format('ff00ff%02d'),
        },
      });
}

/**
 * @param {ee.FeatureCollection} joinedData
 * @param {ee.Number} scalingFactor multiplies the raw score, it can be
 *     adjusted to make sure that the values span the desired range of ~0 to
 *     ~100.
 * @param {number} povertyThreshold between 0 and 1 representing what
 *     fraction of a population must be SNAP eligible to be considered.
 * @param {number} damageThreshold a number between 0 and 1 representing what
 *     fraction of a block group's building must be damaged to be considered.
 * @param {number} povertyWeight float between 0 and 1 that describes what
 *     percentage of the score should be based on poverty (this is also a proxy
 *     for damageWeight which is 1-this value).
 * @return {ee.FeatureCollection}
 */
function processJoinedData(
    joinedData, scalingFactor, povertyThreshold, damageThreshold,
    povertyWeight) {
  const damageLevels = ee.List(damageLevelsList);
  return joinedData.map(function(feature) {
    return colorAndRate(
        feature, scalingFactor, damageLevels, povertyThreshold, damageThreshold,
        povertyWeight);
  });
}
