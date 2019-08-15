import {eeConstants} from './script.js';

export {geoidTag, priorityTag, processJoinedData as default, snapTag};

// Initialized lazily, after ee.initialize() creates necessary function.
let damageScales = null;

const geoidTag = 'GEOID';
const priorityTag = 'PRIORITY';
const snapTag = 'SNAP PERCENTAGE';

/**
 * Processes a feature corresponding to a geographic area and returns a new one,
 * with just the GEOID and PRIORITY properties set, and a style attribute that
 * sets the color/opacity based on the priority, with all priorities past 99
 * equally opaque.
 *
 * @param {ee.Feature} feature
 * @param {ee.Number} scalingFactor multiplies the raw priority, it can be
 *     adjusted to make sure that the values span the desired range of ~0 to
 * ~100.
 * @param {number} povertyThreshold  used to filter out areas that are not poor
 *     enough (as determined by the areas SNAP and TOTAL properties).
 *
 * @return {ee.Feature}
 */
function colorAndRate(feature, scalingFactor, povertyThreshold, damageLevels) {
  const rawRatio = ee.Number(feature.get('SNAP')).divide(feature.get('TOTAL'));
  const priority = ee.Number(ee.Algorithms.If(
      rawRatio.lte(povertyThreshold), eeConstants.zero,
      ee.Number(damageLevels
                    .map(function(type) {
                      return ee.Number(damageScales.get(type))
                          .multiply(feature.get(type));
                    })
                    .reduce(ee.Reducer.sum()))
          .multiply(scalingFactor)
          .divide(feature.get('BUILDING_COUNT'))
          .round()));
  const priorityDisplayCap = ee.Number(99);
  return ee
      .Feature(feature.geometry(), ee.Dictionary([
        geoidTag,
        feature.get(geoidTag),
        priorityTag,
        priority,
        snapTag,
        rawRatio,
      ]))
      .set({
        style: {color: priority.min(priorityDisplayCap).format('ff00ff%02d')},
      });
}

/**
 * @param {ee.FeatureCollection} joinedData
 * @param {ee.Number} scale
 * @param {number} povertyThreshold
 * @return {ee.FeatureCollection}
 */
function processJoinedData(joinedData, scale, povertyThreshold) {
  const damageLevels = ee.List(['NOD', 'UNK', 'AFF', 'MIN', 'MAJ', 'DES']);
  if (damageScales == null) {
    damageScales = ee.Dictionary.fromLists(damageLevels, [0, 0, 1, 1, 2, 3]);
  }
  return joinedData.map(function(feature) {
    return colorAndRate(feature, scale, povertyThreshold, damageLevels);
  });
}
