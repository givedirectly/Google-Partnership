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
      ee.Algorithms.IsEqual(damageLevel, ee.String('AFF')), 'minor-damage',
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
      'users/janak/FEMA_Damage_Assessments_Harvey_20170829-deduplicated');
  const assetName = 'harvey-damage-crowdai-format-deduplicated';
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

/**
 * Runs immediately (before document may have fully loaded). Adds a hook so that
 * when the document is loaded, we do the work.
 */
function setup() {
  // The client ID from the Google Developers Console.
  // TODO(#13): This is from janakr's console. Should use one for GiveDirectly.
  const CLIENT_ID = '634162034024-oodhl7ngkg63hd9ha9ho9b3okcb0bp8s' +
      '.apps.googleusercontent.com';

  $(document).ready(function() {
    // Shows a button prompting the user to log in.
    const onImmediateFailed = function() {
      $('.g-sign-in').removeClass('hidden');
      $('.output').text('(Log in to see the result.)');
      $('.g-sign-in .button').click(function() {
        ee.data.authenticateViaPopup(function() {
          // If the login succeeds, hide the login button and run the analysis.
          $('.g-sign-in').addClass('hidden');
          run();
        });
      });
    };

    // Attempt to authenticate using existing credentials.
    // TODO: deprecated, use ee.data.authenticateViaOauth()
    ee.data.authenticate(CLIENT_ID, run, 'error', null, onImmediateFailed);

    // run();
  });
}

setup();