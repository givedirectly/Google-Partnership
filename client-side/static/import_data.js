import damageLevelsList from './fema_damage_levels.js';

/**
 * Joins Texas Census block-group-level SNAP/population data with building
 * counts and damage, and creates a FeatureCollection. Requires that all of
 * the source assets are already uploaded. Uploading a Census table can be done
 * with something like the command line:
 * `earthengine upload table --asset_id users/janak/census_building_data \
 *      gs://noaa-michael-data/ACS_16_5YR_B25024_with_ann.csv`
 * (assuming the file has already been uploaded into Google Cloud Storage).
 */
const censusSnapKey = 'ACS_16_5_4';
const censusTotalKey = 'ACS_16_5_2';
const censusBuildingKeyPrefix = 'HD01_VD';

const damageKey = 'DMG_LEVEL';
const damageAsset = 'users/janak/FEMA_Damage_Assessments_Harvey_20170829';
const rawSnapAsset = 'users/janak/texas-snap';
const buildingsAsset = 'users/janak/census_building_data';

/**
 * Counts the number of damaged buildings within the boundaries of the given
 * feature, categorized by type of damage.
 *
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function countDamage(feature) {
  const damage = ee.FeatureCollection(damageAsset);
  const damageLevels = ee.List(damageLevelsList);
  const damageFilters =
      damageLevels.map((type) => ee.Filter.eq(damageKey, type));

  const mainFeature = ee.Feature(feature.get('primary'));
  // TODO(janakr): #geometry() is deprecated?
  const geometry = mainFeature.geometry();
  const blockDamage = damage.filterBounds(geometry);
  const attrDict = ee.Dictionary.fromLists(
      damageLevels,
      damageFilters.map((type) => blockDamage.filter(type).size()));
  return ee.Feature(
      geometry,
      attrDict.set('GEOID', mainFeature.get('GEOID'))
          .set('SNAP', mainFeature.get(censusSnapKey))
          .set('TOTAL', mainFeature.get(censusTotalKey))
          .set(
              'BUILDING_COUNT',
              ee.Feature(feature.get('secondary')).get('BUILDING_COUNT')));
}

/**
 * Count the total number of buildings in the given feature, which comes from a
 * Census table that partitions buildings by types.
 *
 * @param {ee.Feature} feature
 * @return {ee.Feature}
 */
function countBuildings(feature) {
  let totalBuildings = ee.Number(0);
  // Columns in Census data. HD01_VD{i} is the number of buildings in category
  // i, where category 1 is single homes, category 2 is attached, etc. See
  // Census table B25024 for details.
  for (let i = 1; i <= 11; i++) {
    totalBuildings = totalBuildings.add(
        feature.get(censusBuildingKeyPrefix + padToTwoDigits(i)));
  }
  return ee.Feature(feature.geometry(), ee.Dictionary([
    // TODO(#22): when we're processing data from scratch, this won't be a
    // string on the other side, so we can leave it as is here.
    'GEOID',
    ee.String(feature.get('GEOid2')),
    'BUILDING_COUNT',
    totalBuildings,
  ]));
}

/**
 * Pads a 1- or 2-digit number to 2 digits. Only valid for 0 <= 0 < 100.
 *
 * @param {number} i
 * @return {string}
 */
function padToTwoDigits(i) {
  return i < 10 ? '0' + i : i;
}

/** Performs operation of processing inputs and creating output asset. */
function run() {
  ee.initialize();

  // TODO(#22): get raw Census data, and do the snap join in this script as
  // well.
  const damage = ee.FeatureCollection(damageAsset);
  const rawSnap =
      ee.FeatureCollection(rawSnapAsset).filterBounds(damage.geometry());
  const buildings = ee.FeatureCollection(buildingsAsset);

  const processedBuildings = buildings.map(countBuildings);
  const joinedSnap = ee.Join.inner().apply(
      rawSnap, processedBuildings,
      ee.Filter.equals({leftField: 'GEOID', rightField: 'GEOID'}));
  const task = ee.batch.Export.table.toAsset(
      joinedSnap.map(countDamage), 'texas-snap-join-damage',
      'users/janak/texas-snap-join-damage');
  task.start();
  $('.upload-status')
      .text('Check Code Editor console for progress. Task: ' + task.id);
  joinedSnap.size().evaluate(function(val, failure) {
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
    ee.data.authenticate(CLIENT_ID, run, null, null, onImmediateFailed);
  });
}

setup();
