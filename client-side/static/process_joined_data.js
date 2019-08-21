import damageLevelsList from './fema_damage_levels.js';

export {
  damageTag,
  geoidTag,
  priorityTag,
  processJoinedData as default,
  snapTag,
};

const damageLevelMultipliers = [0, 0, 1, 1, 2, 3];

const damageTag = 'DAMAGE PERCENTAGE';
const geoidTag = 'GEOID';
const priorityTag = 'PRIORITY';
const snapTag = 'SNAP PERCENTAGE';

const priorityDisplayCap = 99;

/**
 * Processes a feature corresponding to a geographic area and returns a new one,
 * with just the GEOID and PRIORITY properties set, and a style attribute that
 * sets the color/opacity based on the priority, with all priorities past 99
 * equally opaque.
 *
 * @param {ee.Feature} feature
 * @param {ee.Number} scalingFactor multiplies the raw priority, it can be
 *     adjusted to make sure that the values span the desired range of ~0 to
 *     ~100.
 * @param {number} povertyThreshold  used to filter out areas that are not poor
 *     enough (as determined by the areas SNAP and TOTAL properties).
 * @param {ee.List} damageLevels
 * @param {ee.Dictionary} damageScales
 * @param {number} damageThreshold
 *
 * @return {ee.Feature}
 */
function colorAndRate(
    feature, scalingFactor, povertyThreshold, damageLevels, damageScales,
    damageThreshold) {
  const rawRatio = ee.Number(feature.get('SNAP')).divide(feature.get('TOTAL'));
  const numBuildingsDamaged = ee.Number(damageLevels
                                            .map(function(type) {
                                              return feature.get(type);
                                            })
                                            .reduce(ee.Reducer.sum()));
  const numBuildingsTotal = feature.get('BUILDING_COUNT');
  const ratioBuildingsDamaged = numBuildingsDamaged.divide(numBuildingsTotal);
  const potentialPriority =
      ee.Number(damageLevels
                    .map(function(type) {
                      return ee.Number(damageScales.get(type))
                          .multiply(feature.get(type));
                    })
                    .reduce(ee.Reducer.sum()))
          .multiply(scalingFactor)
          .divide(numBuildingsTotal)
          .round();

  /** ****************/
  // Weirdness HERE. Dependening on which of these lines of code is uncommented,
  // the result of bool changes. Isn't that strange? My evidence is that
  // the number of entries in the table is different depending on which
  // statement and the results seem to only take into account the truthiness of
  // the first statement.

  // const bool = ratioBuildingsDamaged.lte(damageThreshold) ||
  // rawRatio.lte(povertyThreshold);
  const bool = rawRatio.lte(povertyThreshold) ||
      ratioBuildingsDamaged.lte(damageThreshold);
  /** ****************/
  const priority =
      ee.Number(ee.Algorithms.If(bool, ee.Number(0), potentialPriority));
  return ee
      .Feature(feature.geometry(), ee.Dictionary([
        geoidTag,
        feature.get(geoidTag),
        priorityTag,
        priority,
        snapTag,
        rawRatio,
        damageTag,
        ratioBuildingsDamaged,
        '#Damaged',
        numBuildingsDamaged,
        'TOTAL NUM',
        feature.get('BUILDING_COUNT'),
      ]))
      .set({
        style: {
          color:
              priority.min(ee.Number(priorityDisplayCap)).format('ff00ff%02d'),
        },
      });
}

/**
 * @param {ee.FeatureCollection} joinedData
 * @param {ee.Number} scale
 * @param {number} povertyThreshold
 * @param {number} damageThreshold a number between 0 and 1 representing what
 *     fraction of a block group's building must be damaged to be considered.
 * @return {ee.FeatureCollection}
 */
function processJoinedData(
    joinedData, scale, povertyThreshold, damageThreshold) {
  const damageLevels = ee.List(damageLevelsList);
  const damageScales =
      ee.Dictionary.fromLists(damageLevels, damageLevelMultipliers);
  return joinedData.map(function(feature) {
    return colorAndRate(
        feature, scale, povertyThreshold, damageLevels, damageScales,
        damageThreshold);
  });
}
