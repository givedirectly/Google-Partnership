export {run};
/**
 * The script run to generate /users/juliexxia/harvey-damage-crowdai-format.
 */

/**
 * Turns features in the FEMA damage dataset into features that have the same
 * properties as the CrowdAI damage dataset.
 *
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function femaToCrowdAi(feature) {
  const damageLevel = ee.String(feature.get('DMG_LEVEL'));
  let description = ee.Algorithms.If(
      ee.Algorithms.IsEqual(damageLevel, ee.String('NOD')), 'no-damage', null);
  description = ee.Algorithms.If(
      ee.Algorithms.IsEqual(damageLevel, ee.String('UNK')), 'no-damage',
      description);
  description = ee.Algorithms.If(
      ee.Algorithms.IsEqual(damageLevel, ee.String('AFF')), 'no-damage',
      description);
  description = ee.Algorithms.If(
      ee.Algorithms.IsEqual(damageLevel, ee.String('MIN')), 'minor-damage',
      description);
  description = ee.Algorithms.If(
      ee.Algorithms.IsEqual(damageLevel, ee.String('MAJ')), 'major-damage',
      description);
  description = ee.Algorithms.If(
      ee.Algorithms.IsEqual(damageLevel, ee.String('DES')), 'major-damage',
      description);
  return ee.Feature(
      feature.geometry().bounds(),
      ee.Dictionary(['name', 'building', 'descriptio', description]));
}

/**
 * Format FEMA damage data like CrowdAi damage data and upload as asset.
 */
function run() {
  ee.initialize();

  const femaDamageData = ee.FeatureCollection(
      'users/juliexxia/FEMA_Damage_Assessments_Harvey_20170829');
  const assetName = 'harvey-damage-crowdai-format';
  const convertedDamageData = femaDamageData.map(femaToCrowdAi);
  const task = ee.batch.Export.table.toAsset(
      convertedDamageData, assetName, 'users/juliexxia/' + assetName);

  task.start();
  $('.upload-status')
      .text('Check Code Editor console for progress. Task: ' + task.id);
  convertedDamageData.size().evaluate((val, failure) => {
    if (val) {
      $('.upload-status').append('\n<p>Found ' + val + ' elements');
    } else {
      $('.upload-status').append('\n<p>Error getting size: ' + failure);
    }
  });
}
